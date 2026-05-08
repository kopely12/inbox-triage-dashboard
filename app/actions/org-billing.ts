'use server';

import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

// ─── guards ───────────────────────────────────────────────────────────────────

async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) throw new Error('Unauthorized');
}

async function requireOrgAdmin(orgId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthenticated');
  if (session.user.isSuperAdmin) return session; // super admin can always act

  const { data: member } = await supabaseAdmin
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', session.user.id)
    .eq('status', 'active')
    .single();

  if (!member || !['admin', 'owner'].includes(member.role)) throw new Error('Forbidden');
  return session;
}

// ─── admin: save org billing (super-admin only) ───────────────────────────────

export type OrgBillingFields = {
  billing_email?:           string | null;
  billing_provider?:        string;
  subscription_status?:     string;
  current_period_end?:      string | null;
  seat_count?:              number;
  stripe_customer_id?:      string | null;
  stripe_subscription_id?:  string | null;
  custom_notes?:            string | null;
};

export async function saveOrgBilling(orgId: string, fields: OrgBillingFields) {
  await requireSuperAdmin();

  const { error } = await supabaseAdmin
    .from('organizations')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', orgId);

  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}

// ─── org admin: update billing email (self-service) ──────────────────────────

export async function updateBillingEmail(orgId: string, email: string) {
  await requireOrgAdmin(orgId);

  const trimmed = email.trim().toLowerCase();
  if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { error: 'Please enter a valid email address.' };
  }

  const { error } = await supabaseAdmin
    .from('organizations')
    .update({ billing_email: trimmed || null })
    .eq('id', orgId);

  if (error) return { error: 'Failed to update billing email.' };
  revalidatePath('/team');
  revalidatePath('/admin');
  return { success: true };
}

// ─── transfer org ownership ───────────────────────────────────────────────────

export async function transferOrgOwnership(orgId: string, newOwnerMemberId: string) {
  await requireSuperAdmin();

  // Resolve the new owner's user_id from their org_members row
  const { data: newMember } = await supabaseAdmin
    .from('org_members')
    .select('user_id, role')
    .eq('id', newOwnerMemberId)
    .eq('org_id', orgId)
    .single();

  if (!newMember) throw new Error('Member not found in this org');
  if (newMember.role === 'owner') throw new Error('Already the owner');

  // Find the current owner
  const { data: currentOwner } = await supabaseAdmin
    .from('org_members')
    .select('id, user_id')
    .eq('org_id', orgId)
    .eq('role', 'owner')
    .single();

  // Demote current owner → admin, promote new member → owner
  await Promise.all([
    currentOwner
      ? supabaseAdmin.from('org_members').update({ role: 'admin' }).eq('id', currentOwner.id)
      : Promise.resolve(),
    supabaseAdmin.from('org_members').update({ role: 'owner' }).eq('id', newOwnerMemberId),
    supabaseAdmin.from('organizations').update({ owner_id: newMember.user_id }).eq('id', orgId),
    // Sync users.org_role
    currentOwner
      ? supabaseAdmin.from('users').update({ org_role: 'admin' }).eq('id', currentOwner.user_id)
      : Promise.resolve(),
    supabaseAdmin.from('users').update({ org_role: 'owner' }).eq('id', newMember.user_id),
  ]);

  revalidatePath('/admin');
  revalidatePath('/team');
}
