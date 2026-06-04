'use server';

import { auth }          from '@/auth';
import { supabaseAdmin }  from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import type { ExtensionPrefs, PriorityRule } from '@/lib/extension-prefs';

// ── Field-level validation ────────────────────────────────────────────────────
// Guards against malformed payloads corrupting the prefs JSONB.

const VALID_TRIAGE_DEPTHS    = new Set(['20', '50', '100', '200']);
const VALID_AUTO_TRIAGE      = new Set(['manual', 'startup', 'scheduled']);
const VALID_SNOOZE_DEFAULT   = new Set(['tomorrow', '3days', 'monday', 'custom']);
const VALID_TASKS_VIEWS      = new Set(['grouped', 'flat']);
const VALID_THEMES           = new Set(['auto', 'light', 'dark']);
const VALID_URGENCIES        = new Set(['high', 'medium', 'low']);
const VALID_DAYS             = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const TIME_RE                = /^\d{2}:\d{2}$/;

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function validatePrefsPartial(partial: Partial<ExtensionPrefs>): string | null {
  const p = partial as Record<string, unknown>;

  // Reject keys that aren't part of the schema
  const KNOWN_KEYS = new Set<string>([
    'whitelist', 'blacklist', 'priority_rules', 'triage_depth', 'working_hours',
    'auto_triage', 'auto_triage_time', 'snooze_default', 'read_body', 'read_sent',
    'read_old', 'read_promo', 'skip_newsletters', 'skip_receipts', 'skip_calendar',
    'skip_social', 'skip_financial', 'compose_detection', 'followup_suggestions',
    'draft_replies', 'overdue_days', 'personal_context', 'internal_domains',
    'keyboard_shortcuts', 'tasks_default_view', 'theme', 'gmail_folders_enabled',
    'auto_clean_calendar', 'auto_clean_calendar_days', 'auto_clean_otp',
    'auto_clean_promo', 'auto_clean_promo_days', 'auto_clean_shipping', 'auto_clean_social',
  ]);

  for (const key of Object.keys(p)) {
    if (!KNOWN_KEYS.has(key)) return `Unknown preference key: ${key}`;
  }

  // String-array fields
  for (const field of ['whitelist', 'blacklist', 'internal_domains'] as const) {
    if (field in p && !isStringArray(p[field])) return `${field} must be a string array`;
    if (isStringArray(p[field]) && (p[field] as string[]).some((s) => s.length > 200))
      return `${field} entries must be under 200 characters`;
  }

  // Priority rules
  if ('priority_rules' in p) {
    if (!Array.isArray(p.priority_rules)) return 'priority_rules must be an array';
    for (const r of p.priority_rules as unknown[]) {
      if (typeof r !== 'object' || r === null) return 'priority_rules entries must be objects';
      const rule = r as Record<string, unknown>;
      if (typeof rule.pattern !== 'string' || rule.pattern.length > 200)
        return 'priority_rules pattern must be a string under 200 chars';
      if (!VALID_URGENCIES.has(rule.urgency as string))
        return 'priority_rules urgency must be high, medium, or low';
    }
    if ((p.priority_rules as unknown[]).length > 100)
      return 'priority_rules may not exceed 100 entries';
  }

  // Enum fields
  if ('triage_depth'      in p && !VALID_TRIAGE_DEPTHS.has(p.triage_depth as string))
    return 'Invalid triage_depth';
  if ('auto_triage'       in p && !VALID_AUTO_TRIAGE.has(p.auto_triage as string))
    return 'Invalid auto_triage';
  if ('snooze_default'    in p && !VALID_SNOOZE_DEFAULT.has(p.snooze_default as string))
    return 'Invalid snooze_default';
  if ('tasks_default_view' in p && !VALID_TASKS_VIEWS.has(p.tasks_default_view as string))
    return 'Invalid tasks_default_view';
  if ('theme' in p && !VALID_THEMES.has(p.theme as string))
    return 'Invalid theme';

  // Time strings
  if ('auto_triage_time' in p && !TIME_RE.test(p.auto_triage_time as string))
    return 'auto_triage_time must be HH:MM';

  // Working hours
  if ('working_hours' in p) {
    const wh = p.working_hours as Record<string, unknown>;
    if (typeof wh !== 'object' || wh === null) return 'working_hours must be an object';
    if (!TIME_RE.test(wh.start as string)) return 'working_hours.start must be HH:MM';
    if (!TIME_RE.test(wh.end   as string)) return 'working_hours.end must be HH:MM';
    if (!isStringArray(wh.days) || !(wh.days as string[]).every((d) => VALID_DAYS.has(d)))
      return 'working_hours.days must be an array of valid day strings';
  }

  // auto_clean_calendar_days: integer 1–30
  if ('auto_clean_calendar_days' in p) {
    const v = Number(p.auto_clean_calendar_days);
    if (!Number.isInteger(v) || v < 1 || v > 30)
      return 'auto_clean_calendar_days must be an integer 1–30';
  }

  // auto_clean_promo_days: integer 7–365
  if ('auto_clean_promo_days' in p) {
    const v = Number(p.auto_clean_promo_days);
    if (!Number.isInteger(v) || v < 7 || v > 365)
      return 'auto_clean_promo_days must be an integer 7–365';
  }

  // Boolean fields
  for (const field of [
    'read_body', 'read_sent', 'read_old', 'read_promo', 'skip_newsletters',
    'skip_receipts', 'skip_calendar', 'skip_social', 'skip_financial',
    'compose_detection', 'followup_suggestions', 'draft_replies', 'keyboard_shortcuts',
    'gmail_folders_enabled',
    'auto_clean_calendar', 'auto_clean_otp', 'auto_clean_promo', 'auto_clean_shipping', 'auto_clean_social',
  ] as const) {
    if (field in p && typeof p[field] !== 'boolean') return `${field} must be a boolean`;
  }

  // Numeric fields
  if ('overdue_days' in p) {
    const v = Number(p.overdue_days);
    if (!Number.isInteger(v) || v < 1 || v > 90) return 'overdue_days must be an integer 1–90';
  }

  // String fields with max length
  if ('personal_context' in p) {
    if (typeof p.personal_context !== 'string') return 'personal_context must be a string';
    if ((p.personal_context as string).length > 3000)
      return 'personal_context must be under 3,000 characters';
  }

  return null; // valid
}

// ── Server action ─────────────────────────────────────────────────────────────

/** Merge partial prefs into the user's saved prefs row in Supabase. */
export async function saveExtensionPrefs(
  partial: Partial<ExtensionPrefs>,
): Promise<{ error?: string; success?: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthenticated' };

  const validationError = validatePrefsPartial(partial);
  if (validationError) return { error: validationError };

  const userId = session.user.id;

  // Diagnose FK issue: verify this userId exists in the users table
  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (!userRow) {
    return { error: `userId ${userId} not found in users table — session may be stale` };
  }

  // Fetch existing row so we can deep-merge
  const { data: existing } = await supabaseAdmin
    .from('user_preferences')
    .select('prefs')
    .eq('user_id', userId)
    .maybeSingle();

  // Preserve any internal keys (e.g. __download_timestamps) that live in prefs
  const merged = { ...(existing?.prefs ?? {}), ...partial };

  const { error } = await supabaseAdmin
    .from('user_preferences')
    .upsert(
      { user_id: userId, prefs: merged, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );

  if (error) {
    return { error: `DB error: ${error.message} | userId: ${userId} | rowExists: ${!!existing}` };
  }

  revalidatePath('/preferences');
  return { success: true };
}
