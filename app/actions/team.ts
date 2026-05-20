'use server';

import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getOrCreateOrg } from '@/lib/org';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';

// ── Auth guard ────────────────────────────────────────────────────────────────
// Returns { error } instead of throwing so callers can forward a structured
// response to the client rather than surfacing an unhandled server exception.

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthenticated' as const, session: null };
  const role = session.user.orgRole;
  if (role !== 'admin' && role !== 'owner') return { error: 'Forbidden' as const, session: null };
  return { error: null, session };
}

// ── Seat limit helper ─────────────────────────────────────────────────────────

async function checkSeatLimit(orgId: string): Promise<string | null> {
  const [{ data: org }, { count: activeCount }] = await Promise.all([
    supabaseAdmin
      .from('organizations')
      .select('seat_count')
      .eq('id', orgId)
      .single(),
    supabaseAdmin
      .from('org_members')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'active'),
  ]);

  const seatCount = org?.seat_count ?? 0;
  if (seatCount > 0 && (activeCount ?? 0) >= seatCount) {
    return `Your plan allows ${seatCount} seat${seatCount !== 1 ? 's' : ''} and all are taken. Upgrade your plan to add more members.`;
  }
  return null;
}

// ── Actions ───────────────────────────────────────────────────────────────────

export async function inviteMember(formData: FormData) {
  const { error: authErr, session } = await requireAdmin();
  if (authErr) return { error: authErr };

  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const role  = (formData.get('role') as string) ?? 'member';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Please enter a valid email address.' };
  }
  if (!['admin', 'member'].includes(role)) {
    return { error: 'Invalid role.' };
  }

  const orgId = await getOrCreateOrg(
    session!.user.id,
    session!.user.email ?? '',
    session!.user.orgRole,
  );
  if (!orgId) return { error: 'No organization found.' };

  // Enforce seat limit before issuing the invite
  const seatErr = await checkSeatLimit(orgId);
  if (seatErr) return { error: seatErr };

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
        org_id:      orgId,
        email,
        role,
        token,
        invited_by:  session!.user.id,
        expires_at:  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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
  const { error: authErr } = await requireAdmin();
  if (authErr) return { error: authErr };

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
  const { error: authErr } = await requireAdmin();
  if (authErr) return { error: authErr };

  // Fetch the member to check role before attempting deletion
  const { data: member } = await supabaseAdmin
    .from('org_members')
    .select('role, user_id')
    .eq('id', memberId)
    .single();

  if (member?.role === 'owner') {
    return { error: 'Transfer ownership to another member before leaving or removing the owner.' };
  }

  const { error } = await supabaseAdmin
    .from('org_members')
    .delete()
    .eq('id', memberId);

  if (error) return { error: 'Failed to remove member.' };

  // Clear org fields on the user row
  if (member?.user_id) {
    await supabaseAdmin
      .from('users')
      .update({ org_id: null, org_role: null })
      .eq('id', member.user_id);
  }

  revalidatePath('/team');
  return { success: true };
}

export async function transferOwnership(newOwnerMemberId: string) {
  const { error: authErr, session } = await requireAdmin();
  if (authErr) return { error: authErr };
  if (session!.user.orgRole !== 'owner') return { error: 'Only the current owner can transfer ownership.' };

  // Find the caller's own member record
  const { data: myMember } = await supabaseAdmin
    .from('org_members')
    .select('id, org_id')
    .eq('user_id', session!.user.id)
    .eq('role', 'owner')
    .single();

  if (!myMember) return { error: 'Owner record not found.' };

  // Verify new owner is in the same org
  const { data: newMember } = await supabaseAdmin
    .from('org_members')
    .select('user_id, role')
    .eq('id', newOwnerMemberId)
    .eq('org_id', myMember.org_id)
    .single();

  if (!newMember) return { error: 'Member not found in your organization.' };
  if (newMember.role === 'owner') return { error: 'Already the owner.' };

  await Promise.all([
    supabaseAdmin.from('org_members').update({ role: 'admin'  }).eq('id', myMember.id),
    supabaseAdmin.from('org_members').update({ role: 'owner'  }).eq('id', newOwnerMemberId),
    supabaseAdmin.from('organizations').update({ owner_id: newMember.user_id }).eq('id', myMember.org_id),
    supabaseAdmin.from('users').update({ org_role: 'admin' }).eq('id', session!.user.id),
    supabaseAdmin.from('users').update({ org_role: 'owner' }).eq('id', newMember.user_id),
  ]);

  revalidatePath('/team');
  return { success: true };
}

export async function revokeInvite(inviteId: string) {
  const { error: authErr } = await requireAdmin();
  if (authErr) return { error: authErr };

  const { error } = await supabaseAdmin
    .from('org_invites')
    .delete()
    .eq('id', inviteId);

  if (error) return { error: 'Failed to revoke invite.' };
  revalidatePath('/team');
  return { success: true };
}
