'use server';

import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

// ─── guard ────────────────────────────────────────────────────────────────────

async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) {
    throw new Error('Unauthorized');
  }
}

// ─── plan override ────────────────────────────────────────────────────────────

export async function setUserPlan(userId: string, plan: string) {
  await requireSuperAdmin();

  const { error } = await supabaseAdmin
    .from('users')
    .update({ plan_tier: plan, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}

// ─── delete user ──────────────────────────────────────────────────────────────

export async function deleteUser(userId: string) {
  await requireSuperAdmin();

  // Remove org memberships first (FK)
  await supabaseAdmin.from('org_members').delete().eq('user_id', userId);

  // Remove triage sessions
  await supabaseAdmin.from('triage_sessions').delete().eq('user_id', userId);

  // Delete the user row
  const { error } = await supabaseAdmin.from('users').delete().eq('id', userId);
  if (error) throw new Error(error.message);

  revalidatePath('/admin');
}

// ─── admin notes ──────────────────────────────────────────────────────────────

export async function saveAdminNote(userId: string, note: string) {
  await requireSuperAdmin();

  const { error } = await supabaseAdmin
    .from('users')
    .update({ admin_notes: note.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}

// ─── org: change role ─────────────────────────────────────────────────────────

export async function adminChangeOrgRole(memberId: string, role: 'admin' | 'member') {
  await requireSuperAdmin();
  if (!['admin', 'member'].includes(role)) throw new Error('Invalid role');

  // Get the member record so we can sync users.org_role
  const { data: member } = await supabaseAdmin
    .from('org_members')
    .select('user_id, role')
    .eq('id', memberId)
    .single();

  if (!member) throw new Error('Member not found');
  if (member.role === 'owner') throw new Error('Cannot change owner role');

  await Promise.all([
    supabaseAdmin.from('org_members').update({ role }).eq('id', memberId),
    supabaseAdmin.from('users').update({ org_role: role }).eq('id', member.user_id),
  ]);

  revalidatePath('/admin');
}

// ─── org: remove member ───────────────────────────────────────────────────────

export async function adminRemoveFromOrg(memberId: string) {
  await requireSuperAdmin();

  const { data: member } = await supabaseAdmin
    .from('org_members')
    .select('user_id, role')
    .eq('id', memberId)
    .single();

  if (!member) throw new Error('Member not found');
  if (member.role === 'owner') throw new Error('Cannot remove owner');

  await Promise.all([
    supabaseAdmin.from('org_members').delete().eq('id', memberId),
    supabaseAdmin.from('users').update({ org_id: null, org_role: null }).eq('id', member.user_id),
  ]);

  revalidatePath('/admin');
}

// ─── org: add member by email ─────────────────────────────────────────────────

export async function adminAddToOrg(orgId: string, email: string, role: 'admin' | 'member') {
  await requireSuperAdmin();

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, org_id')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (!user) return { error: 'No account found with that email.' };
  if (user.org_id) return { error: 'User is already in an organization. Remove them first.' };

  const { error } = await supabaseAdmin
    .from('org_members')
    .insert({ org_id: orgId, user_id: user.id, role, status: 'active' });

  if (error) return { error: 'Failed to add member.' };

  await supabaseAdmin
    .from('users')
    .update({ org_id: orgId, org_role: role })
    .eq('id', user.id);

  revalidatePath('/admin');
  return { success: true };
}
