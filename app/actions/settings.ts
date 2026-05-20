'use server';

import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { stripe } from '@/lib/stripe';

const VALID_TIMEZONES = new Set([
  'UTC',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'America/Sao_Paulo',
  'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Amsterdam', 'Europe/Stockholm', 'Europe/Zurich', 'Europe/Madrid',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Shanghai',
  'Asia/Tokyo', 'Asia/Seoul',
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth',
  'Pacific/Auckland', 'Pacific/Honolulu',
]);

const VALID_SNOOZE_HOURS = new Set([1, 4, 24, 48, 72, 168]);

export async function updatePreferences(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthenticated' };

  const timezone            = formData.get('timezone') as string;
  const defaultSnoozeHours  = Number(formData.get('default_snooze_hours'));

  if (!VALID_TIMEZONES.has(timezone))       return { error: 'Invalid timezone.' };
  if (!VALID_SNOOZE_HOURS.has(defaultSnoozeHours)) return { error: 'Invalid snooze duration.' };

  const { error } = await supabaseAdmin
    .from('users')
    .update({ timezone, default_snooze_hours: defaultSnoozeHours, updated_at: new Date().toISOString() })
    .eq('id', session.user.id);

  if (error) return { error: 'Failed to save preferences.' };
  revalidatePath('/preferences');
  return { success: true };
}

export async function updateOrgName(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthenticated' };
  const role = session.user.orgRole;
  if (role !== 'admin' && role !== 'owner') return { error: 'Forbidden' };

  const name = (formData.get('name') as string)?.trim();
  if (!name || name.length < 2) return { error: 'Name must be at least 2 characters.' };
  if (name.length > 60)         return { error: 'Name must be under 60 characters.' };

  // Find the user's org
  const { data: membership } = await supabaseAdmin
    .from('org_members')
    .select('org_id')
    .eq('user_id', session.user.id)
    .eq('status', 'active')
    .single();

  if (!membership?.org_id) return { error: 'No organization found.' };

  const { error } = await supabaseAdmin
    .from('organizations')
    .update({ name })
    .eq('id', membership.org_id);

  if (error) return { error: 'Failed to update organization name.' };
  revalidatePath('/account');
  revalidatePath('/team');
  return { success: true };
}

export async function deleteAccount(): Promise<{ error?: string; success?: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthenticated' };

  const userId = session.user.id;

  // ── Guard: block if sole owner of any org ─────────────────────────────────
  const { data: ownedMemberships } = await supabaseAdmin
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId)
    .eq('org_role', 'owner')
    .eq('status', 'active');

  for (const { org_id } of ownedMemberships ?? []) {
    const { count } = await supabaseAdmin
      .from('org_members')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', org_id)
      .eq('org_role', 'owner')
      .eq('status', 'active');

    if ((count ?? 0) <= 1) {
      return {
        error:
          'You are the sole owner of an organization. Transfer ownership or delete the organization before removing your account.',
      };
    }
  }

  // ── Cancel any active Stripe subscriptions ────────────────────────────────
  if (stripe) {
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    if (userRow?.stripe_customer_id) {
      try {
        const { data: subs } = await stripe.subscriptions.list({
          customer: userRow.stripe_customer_id as string,
          status:   'active',
          limit:    10,
        });
        await Promise.all(subs.map((sub) => stripe!.subscriptions.cancel(sub.id)));
      } catch (err) {
        // Log but don't block deletion — Stripe state can be reconciled later
        console.error('[deleteAccount] Stripe cancellation error:', err);
      }
    }
  }

  // ── Delete user data in dependency order ──────────────────────────────────
  await supabaseAdmin.from('user_preferences').delete().eq('user_id', userId);
  await supabaseAdmin.from('commitments').delete().eq('user_id', userId);
  await supabaseAdmin.from('triage_sessions').delete().eq('user_id', userId);
  await supabaseAdmin.from('org_members').delete().eq('user_id', userId);
  await supabaseAdmin.from('org_invites').update({ invited_by: null }).eq('invited_by', userId);

  const { error } = await supabaseAdmin.from('users').delete().eq('id', userId);
  if (error) return { error: 'Failed to delete account. Please contact support.' };

  return { success: true };
}
