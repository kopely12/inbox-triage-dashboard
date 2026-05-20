'use server';

import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export async function acceptInvite(token: string): Promise<{ error?: string; success?: boolean }> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return { error: 'Unauthenticated' };

  // Fetch the invite
  const { data: invite } = await supabaseAdmin
    .from('org_invites')
    .select('id, org_id, email, role, expires_at, accepted_at')
    .eq('token', token)
    .is('accepted_at', null)
    .single();

  if (!invite)                                         return { error: 'Invite not found or already used.' };
  if (new Date(invite.expires_at) < new Date())        return { error: 'This invite has expired.' };
  if (invite.email !== session.user.email)             return { error: 'This invite was sent to a different email address.' };

  // Enforce seat limit before accepting
  const [{ data: org }, { count: activeCount }] = await Promise.all([
    supabaseAdmin
      .from('organizations')
      .select('seat_count')
      .eq('id', invite.org_id)
      .single(),
    supabaseAdmin
      .from('org_members')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', invite.org_id)
      .eq('status', 'active'),
  ]);

  const seatCount = org?.seat_count ?? 0;
  if (seatCount > 0 && (activeCount ?? 0) >= seatCount) {
    return { error: 'This team has reached its seat limit. Ask the owner to upgrade the plan before you can join.' };
  }

  const now = new Date().toISOString();

  // Add to org_members (upsert in case they somehow already have a row)
  const { error: memberErr } = await supabaseAdmin
    .from('org_members')
    .upsert(
      {
        org_id:  invite.org_id,
        user_id: session.user.id,
        role:    invite.role,
        status:  'active',
      },
      { onConflict: 'org_id,user_id', ignoreDuplicates: false }
    );

  if (memberErr) return { error: 'Failed to add you to the team. Please try again.' };

  // Mark invite accepted
  await supabaseAdmin
    .from('org_invites')
    .update({ accepted_at: now })
    .eq('id', invite.id);

  // Update user record with their new org and role
  await supabaseAdmin
    .from('users')
    .update({ org_id: invite.org_id, org_role: invite.role })
    .eq('id', session.user.id);

  revalidatePath('/team');
  return { success: true };
}
