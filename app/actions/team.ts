'use server';

import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getOrCreateOrg } from '@/lib/org';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthenticated');
  const role = session.user.orgRole;
  if (role !== 'admin' && role !== 'owner') throw new Error('Forbidden');
  return session;
}

export async function inviteMember(formData: FormData) {
  const session = await requireAdmin();
  const email   = (formData.get('email') as string)?.trim().toLowerCase();
  const role    = (formData.get('role') as string) ?? 'member';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Please enter a valid email address.' };
  }
  if (!['admin', 'member'].includes(role)) {
    return { error: 'Invalid role.' };
  }

  const orgId = await getOrCreateOrg(
    session.user.id,
    session.user.email ?? '',
    session.user.orgRole,
  );
  if (!orgId) return { error: 'No organisation found.' };

  // Check if a user with this email is already an active member
  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existingUser) {
    const { data: existingMember } = await supabaseAdmin
      .from('org_members')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', existingUser.id)
      .eq('status', 'active')
      .single();

    if (existingMember) {
      return { error: 'This person is already a member.' };
    }
  }

  const token = randomUUID();

  const { error } = await supabaseAdmin
    .from('org_invites')
    .upsert(
      {
        org_id:     orgId,
        email,
        role,
        token,
        invited_by: session.user.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        accepted_at: null,
      },
      { onConflict: 'org_id,email', ignoreDuplicates: false }
    );

  if (error) return { error: 'Failed to create invite. They may already be invited.' };

  revalidatePath('/team');
  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://inbox-triage-dashboard.vercel.app';
  return { success: true, inviteUrl: `${baseUrl}/invite/${token}` };
}

export async function changeRole(memberId: string, newRole: 'admin' | 'member') {
  await requireAdmin();
  if (!['admin', 'member'].includes(newRole)) return { error: 'Invalid role.' };

  const { error } = await supabaseAdmin
    .from('org_members')
    .update({ role: newRole })
    .eq('id', memberId)
    .neq('role', 'owner'); // never demote owner via this action

  if (error) return { error: 'Failed to update role.' };
  revalidatePath('/team');
  return { success: true };
}

export async function removeMember(memberId: string) {
  await requireAdmin();

  const { error } = await supabaseAdmin
    .from('org_members')
    .delete()
    .eq('id', memberId)
    .neq('role', 'owner'); // can't remove owner

  if (error) return { error: 'Failed to remove member.' };
  revalidatePath('/team');
  return { success: true };
}

export async function revokeInvite(inviteId: string) {
  await requireAdmin();

  const { error } = await supabaseAdmin
    .from('org_invites')
    .delete()
    .eq('id', inviteId);

  if (error) return { error: 'Failed to revoke invite.' };
  revalidatePath('/team');
  return { success: true };
}
