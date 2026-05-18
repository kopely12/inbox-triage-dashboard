'use server';

import { auth }           from '@/auth';
import { supabaseAdmin }  from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthenticated');
  return session.user.id;
}

export async function markCommitmentDone(id: string) {
  const userId = await requireUser();

  const { error } = await supabaseAdmin
    .from('commitments')
    .update({ status: 'done', resolved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId); // ownership guard

  if (error) return { error: 'Failed to update commitment.' };
  revalidatePath('/commitments');
  return { success: true };
}

export async function reopenCommitment(id: string) {
  const userId = await requireUser();

  const { error } = await supabaseAdmin
    .from('commitments')
    .update({ status: 'open', resolved_at: null })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return { error: 'Failed to reopen commitment.' };
  revalidatePath('/commitments');
  return { success: true };
}

export async function updateCommitmentDueDate(id: string, dueDate: string | null) {
  const userId = await requireUser();

  const sanitized = dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null;

  const { error } = await supabaseAdmin
    .from('commitments')
    .update({ due_date: sanitized })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return { error: 'Failed to update due date.' };
  revalidatePath('/commitments');
  return { success: true };
}
