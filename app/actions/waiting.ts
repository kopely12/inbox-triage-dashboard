'use server';

import { auth }           from '@/auth';
import { supabaseAdmin }  from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export async function dismissWaitingItem(id: string): Promise<{ error: string | null }> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthenticated' };
  if (!id || typeof id !== 'string') return { error: 'Invalid ID' };

  const { error } = await supabaseAdmin
    .from('waiting_items')
    .update({ status: 'resolved' })
    .eq('id', id)
    .eq('user_id', session.user.id);

  if (error) return { error: 'Failed to dismiss' };
  revalidatePath('/');
  return { error: null };
}
