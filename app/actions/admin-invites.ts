'use server';

import { auth }          from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

/**
 * Revoke (delete) an org invite. Super admin only.
 * Works on both pending and expired invites.
 */
export async function revokeInvite(
  inviteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();

  if (!session?.user?.isSuperAdmin) {
    return { ok: false, error: 'Unauthorized' };
  }

  const { error } = await supabaseAdmin
    .from('org_invites')
    .delete()
    .eq('id', inviteId);

  if (error) {
    console.error('[admin] revokeInvite error:', error.message);
    return { ok: false, error: 'Failed to revoke invite.' };
  }

  revalidatePath('/admin');
  return { ok: true };
}
