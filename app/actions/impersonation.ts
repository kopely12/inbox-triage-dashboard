'use server';

import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Pre-flight check before starting impersonation.
 * The JWT callback enforces the real security gate — this action gives the
 * client a clear error message before it calls session.update().
 */
export async function canImpersonate(
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();

  if (!session?.user?.isSuperAdmin) {
    return { ok: false, error: 'Unauthorized' };
  }

  const { data: target } = await supabaseAdmin
    .from('users')
    .select('email, suspended_at')
    .eq('id', targetUserId)
    .single();

  if (!target) {
    return { ok: false, error: 'User not found' };
  }

  if (target.email === process.env.SUPER_ADMIN_EMAIL) {
    return { ok: false, error: 'Cannot impersonate another super admin' };
  }

  return { ok: true };
}
