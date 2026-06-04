'use server';

import { supabaseAdmin }  from '@/lib/supabase';
import { auth }           from '@/auth';
import { revalidatePath } from 'next/cache';
import type { AutopilotRuleType, AutopilotAction, AutopilotRule } from '@/lib/autopilot';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) return { userId: null as string | null, error: 'Not authenticated' };
  return { userId: session.user.id, error: null as string | null };
}

// ── Actions ───────────────────────────────────────────────────────────────────

export async function getAutopilotRules(): Promise<{ rules: AutopilotRule[]; error?: string }> {
  const { userId, error } = await requireUser();
  if (error) return { rules: [], error };

  const { data, error: dbErr } = await supabaseAdmin
    .from('autopilot_rules')
    .select('*')
    .eq('user_id', userId!)
    .order('created_at', { ascending: true });

  if (dbErr) return { rules: [], error: dbErr.message };
  return { rules: (data ?? []) as AutopilotRule[] };
}

export async function upsertAutopilotRule(
  ruleType:  AutopilotRuleType,
  threshold: Record<string, number>,
  action:    AutopilotAction,
  enabled:   boolean,
): Promise<{ error?: string }> {
  const { userId, error } = await requireUser();
  if (error) return { error };

  const { error: dbErr } = await supabaseAdmin
    .from('autopilot_rules')
    .upsert(
      { user_id: userId!, rule_type: ruleType, threshold, action, enabled },
      { onConflict: 'user_id,rule_type' },
    );

  if (dbErr) return { error: dbErr.message };
  revalidatePath('/preferences');
  return {};
}

export async function deleteAutopilotRule(ruleType: AutopilotRuleType): Promise<{ error?: string }> {
  const { userId, error } = await requireUser();
  if (error) return { error };

  const { error: dbErr } = await supabaseAdmin
    .from('autopilot_rules')
    .delete()
    .eq('user_id', userId!)
    .eq('rule_type', ruleType);

  if (dbErr) return { error: dbErr.message };
  revalidatePath('/preferences');
  return {};
}

// ── Global autopilot on/off ───────────────────────────────────────────────────

export async function getAutopilotEnabled(): Promise<{ enabled: boolean; error?: string }> {
  const { userId, error } = await requireUser();
  if (error) return { enabled: true, error };

  const { data } = await supabaseAdmin
    .from('users')
    .select('preferences')
    .eq('id', userId!)
    .single();

  return { enabled: data?.preferences?.autopilot?.enabled !== false };
}

export async function setAutopilotEnabled(enabled: boolean): Promise<{ error?: string }> {
  const { userId, error } = await requireUser();
  if (error) return { error };

  const { data } = await supabaseAdmin.from('users').select('preferences').eq('id', userId!).single();
  const prefs = data?.preferences ?? {};
  const updated = { ...prefs, autopilot: { ...(prefs.autopilot ?? {}), enabled } };

  const { error: dbErr } = await supabaseAdmin.from('users').update({ preferences: updated }).eq('id', userId!);
  if (dbErr) return { error: dbErr.message };
  revalidatePath('/preferences');
  revalidatePath('/sender-intelligence');
  return {};
}

// ── Rule impact preview ───────────────────────────────────────────────────────

export type PreviewSender = {
  sender_email:    string;
  sender_name:     string | null;
  emails_received: number;
  category:        string;
};

/**
 * Simulates which senders a rule would act on at the given threshold,
 * without persisting anything. Mirrors the backend evaluateAutopilotRules logic.
 *
 * Threshold values are always in UI units:
 *   low_engagement_archive → rate is a percentage (3 = 3%), not a decimal
 *   all others → stored as-is
 */
export async function previewAutopilotRule(
  ruleType:  AutopilotRuleType,
  threshold: Record<string, number>,
): Promise<{ senders: PreviewSender[]; total: number; error?: string }> {
  const { userId, error } = await requireUser();
  if (error) return { senders: [], total: 0, error };

  const { data, error: dbErr } = await supabaseAdmin
    .from('sender_engagement')
    .select('sender_email, sender_name, emails_received, emails_deleted, emails_opened, emails_replied, engagement_score, category, auto_archive_enabled, unsubscribe_status, period_days')
    .eq('user_id', userId!)
    .gte('emails_received', 3)
    .limit(500);

  if (dbErr) return { senders: [], total: 0, error: dbErr.message };

  const t       = threshold;
  const matched: PreviewSender[] = [];

  for (const sender of data ?? []) {
    // Skip already handled
    if (sender.unsubscribe_status === 'unsubscribed') continue;
    if (sender.auto_archive_enabled) continue;

    let triggered = false;

    if (ruleType === 'delete_without_open') {
      const minDeletes = t.count ?? 5;
      triggered = (
        (sender.emails_deleted  ?? 0) >= minDeletes &&
        (sender.emails_opened   ?? 0) === 0          &&
        (sender.emails_received ?? 0) >= minDeletes
      );

    } else if (ruleType === 'low_engagement_archive') {
      // UI threshold: rate is a percentage (3 = 3%). engagement_score is 0-100.
      const maxRate   = t.rate       ?? 3;
      const minEmails = t.min_emails ?? 10;
      triggered = (
        (sender.emails_received  ?? 0) >= minEmails &&
        (sender.engagement_score ?? 0) < maxRate
      );

    } else if (ruleType === 'never_replied_after_n_emails') {
      const minEmails = t.count ?? 10;
      triggered = (
        (sender.emails_received ?? 0) >= minEmails &&
        (sender.emails_replied  ?? 0) === 0
      );

    } else if (ruleType === 'frequency_spike_unsubscribe') {
      const maxDailyRate = t.daily_rate ?? 1.0;
      const isNoise      = sender.category === 'never_engage' || sender.category === 'rarely_engage';
      const periodDays   = (sender.period_days as number | null) ?? 90;
      triggered = (
        isNoise &&
        periodDays > 0 &&
        (sender.emails_received ?? 0) / periodDays > maxDailyRate
      );
    }

    if (!triggered) continue;

    matched.push({
      sender_email:    sender.sender_email,
      sender_name:     sender.sender_name,
      emails_received: sender.emails_received,
      category:        sender.category,
    });
  }

  matched.sort((a, b) => b.emails_received - a.emails_received);
  return { senders: matched.slice(0, 5), total: matched.length };
}

// ── Rule activity log ─────────────────────────────────────────────────────────

export type AutopilotActivityEntry = {
  id:           string;
  sender_email: string;
  sender_name:  string | null;
  action_type:  string;
  rule_type:    string | null;
  status:       string;
  created_at:   string;
};

export async function getAutopilotActivity(): Promise<{ entries: AutopilotActivityEntry[]; error?: string }> {
  const { userId, error } = await requireUser();
  if (error) return { entries: [], error };

  const { data, error: dbErr } = await supabaseAdmin
    .from('sender_actions')
    .select('id, sender_email, sender_name, action_type, rule_type, status, created_at')
    .eq('user_id', userId!)
    .eq('triggered_by', 'autopilot')
    .order('created_at', { ascending: false })
    .limit(50);

  if (dbErr) return { entries: [], error: dbErr.message };
  return { entries: (data ?? []) as AutopilotActivityEntry[] };
}
