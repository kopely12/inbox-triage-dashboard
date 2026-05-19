'use server';

import { auth }           from '@/auth';
import { supabaseAdmin }  from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

function bust() {
  revalidatePath('/commitments');
  revalidatePath('/');   // overview My Week card
}

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
  bust();
  return { success: true };
}

export async function reopenCommitment(id: string) {
  const userId = await requireUser();
  const { error } = await supabaseAdmin
    .from('commitments')
    .update({ status: 'open', resolved_at: null })
    .eq('id', id).eq('user_id', userId);
  if (error) return { error: 'Failed to reopen commitment.' };
  bust();
  return { success: true };
}

export async function updateCommitmentDueDate(id: string, dueDate: string | null) {
  const userId   = await requireUser();
  const sanitized = dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null;
  const { error } = await supabaseAdmin
    .from('commitments')
    .update({ due_date: sanitized })
    .eq('id', id).eq('user_id', userId);
  if (error) return { error: 'Failed to update due date.' };
  bust();
  return { success: true };
}

export async function updateCommitmentPriority(id: string, priority: 'high' | 'medium' | 'low' | null) {
  const userId = await requireUser();
  const { error } = await supabaseAdmin
    .from('commitments')
    .update({ priority })
    .eq('id', id).eq('user_id', userId);
  if (error) return { error: 'Failed to update priority.' };
  bust();
  return { success: true };
}

export async function updateCommitmentNote(id: string, note: string | null) {
  const userId = await requireUser();
  const { error } = await supabaseAdmin
    .from('commitments')
    .update({ note: note?.trim() || null })
    .eq('id', id).eq('user_id', userId);
  if (error) return { error: 'Failed to update note.' };
  bust();
  return { success: true };
}

export async function dismissCommitment(id: string) {
  const userId = await requireUser();
  const { error } = await supabaseAdmin
    .from('commitments')
    .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', userId);
  if (error) return { error: 'Failed to dismiss.' };
  bust();
  return { success: true };
}
