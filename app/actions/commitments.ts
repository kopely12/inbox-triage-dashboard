'use server';

import { auth }           from '@/auth';
import { supabaseAdmin }  from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

function bust() {
  revalidatePath('/commitments');
  revalidatePath('/'); // overview My Week card
}

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthenticated' as const, userId: null as null };
  return { error: null as null, userId: session.user.id };
}

const VALID_PRIORITIES = new Set(['high', 'medium', 'low']);
const VALID_DIRECTIONS = new Set(['outgoing', 'assigned']);

// ── Mark done ─────────────────────────────────────────────────────────────────

export async function markCommitmentDone(id: string) {
  const { error, userId } = await requireUser();
  if (error) return { error };
  if (!id || typeof id !== 'string') return { error: 'Invalid ID.' };

  const { error: dbError } = await supabaseAdmin
    .from('commitments')
    .update({ status: 'done', resolved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);

  if (dbError) return { error: 'Failed to update commitment.' };
  bust();
  return { success: true };
}

// ── Reopen ────────────────────────────────────────────────────────────────────

export async function reopenCommitment(id: string) {
  const { error, userId } = await requireUser();
  if (error) return { error };
  if (!id || typeof id !== 'string') return { error: 'Invalid ID.' };

  const { error: dbError } = await supabaseAdmin
    .from('commitments')
    .update({ status: 'open', resolved_at: null })
    .eq('id', id)
    .eq('user_id', userId);

  if (dbError) return { error: 'Failed to reopen commitment.' };
  bust();
  return { success: true };
}

// ── Dismiss ───────────────────────────────────────────────────────────────────

export async function dismissCommitment(id: string) {
  const { error, userId } = await requireUser();
  if (error) return { error };
  if (!id || typeof id !== 'string') return { error: 'Invalid ID.' };

  const { error: dbError } = await supabaseAdmin
    .from('commitments')
    .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);

  if (dbError) return { error: 'Failed to dismiss.' };
  bust();
  return { success: true };
}

// ── Restore (dismissed → open) ────────────────────────────────────────────────

export async function restoreCommitment(id: string) {
  const { error, userId } = await requireUser();
  if (error) return { error };
  if (!id || typeof id !== 'string') return { error: 'Invalid ID.' };

  const { error: dbError } = await supabaseAdmin
    .from('commitments')
    .update({ status: 'open', resolved_at: null })
    .eq('id', id)
    .eq('user_id', userId);

  if (dbError) return { error: 'Failed to restore commitment.' };
  bust();
  return { success: true };
}

// ── Update due date ───────────────────────────────────────────────────────────

export async function updateCommitmentDueDate(id: string, dueDate: string | null) {
  const { error, userId } = await requireUser();
  if (error) return { error };
  if (!id || typeof id !== 'string') return { error: 'Invalid ID.' };
  const sanitized = dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null;

  const { error: dbError } = await supabaseAdmin
    .from('commitments')
    .update({ due_date: sanitized })
    .eq('id', id)
    .eq('user_id', userId);

  if (dbError) return { error: 'Failed to update due date.' };
  bust();
  return { success: true };
}

// ── Update priority ───────────────────────────────────────────────────────────

export async function updateCommitmentPriority(id: string, priority: 'high' | 'medium' | 'low' | null) {
  const { error, userId } = await requireUser();
  if (error) return { error };
  if (!id || typeof id !== 'string') return { error: 'Invalid ID.' };
  if (priority !== null && !VALID_PRIORITIES.has(priority)) return { error: 'Invalid priority.' };

  const { error: dbError } = await supabaseAdmin
    .from('commitments')
    .update({ priority })
    .eq('id', id)
    .eq('user_id', userId);

  if (dbError) return { error: 'Failed to update priority.' };
  bust();
  return { success: true };
}

// ── Update note ───────────────────────────────────────────────────────────────

export async function updateCommitmentNote(id: string, note: string | null) {
  const { error, userId } = await requireUser();
  if (error) return { error };
  if (!id || typeof id !== 'string') return { error: 'Invalid ID.' };
  const trimmed = note?.trim() || null;
  if (trimmed && trimmed.length > 2000) return { error: 'Note too long (max 2,000 characters).' };

  const { error: dbError } = await supabaseAdmin
    .from('commitments')
    .update({ note: trimmed })
    .eq('id', id)
    .eq('user_id', userId);

  if (dbError) return { error: 'Failed to update note.' };
  bust();
  return { success: true };
}

// ── Create (manual) ───────────────────────────────────────────────────────────

export async function createCommitment(data: {
  description:  string;
  direction:    'outgoing' | 'assigned';
  counterparty?: string | null;
  due_date?:    string | null;
  priority?:    'high' | 'medium' | 'low' | null;
}) {
  const { error, userId } = await requireUser();
  if (error) return { error };

  const description = data.description?.trim();
  if (!description || description.length < 3) return { error: 'Description is required (min 3 characters).' };
  if (description.length > 1000) return { error: 'Description too long (max 1,000 characters).' };
  if (!VALID_DIRECTIONS.has(data.direction)) return { error: 'Invalid direction.' };
  if (data.priority && !VALID_PRIORITIES.has(data.priority)) return { error: 'Invalid priority.' };

  const dueDate     = data.due_date && /^\d{4}-\d{2}-\d{2}$/.test(data.due_date) ? data.due_date : null;
  const counterparty = data.counterparty?.trim() || null;

  const { error: dbError } = await supabaseAdmin
    .from('commitments')
    .insert({
      user_id:     userId,
      description,
      direction:   data.direction,
      counterparty,
      due_date:    dueDate,
      priority:    data.priority ?? null,
      status:      'open',
      scanned_at:  new Date().toISOString(),
      thread_id:   `manual_${Date.now()}`,
    });

  if (dbError) return { error: 'Failed to create commitment.' };
  bust();
  return { success: true };
}

// ── Bulk mark done ────────────────────────────────────────────────────────────

export async function bulkMarkDone(ids: string[]) {
  const { error, userId } = await requireUser();
  if (error) return { error };
  if (!Array.isArray(ids) || ids.length === 0) return { error: 'No commitments selected.' };
  if (ids.length > 100) return { error: 'Too many selected (max 100 at once).' };
  if (!ids.every((id) => typeof id === 'string' && id.length > 0)) return { error: 'Invalid selection.' };

  const { error: dbError } = await supabaseAdmin
    .from('commitments')
    .update({ status: 'done', resolved_at: new Date().toISOString() })
    .in('id', ids)
    .eq('user_id', userId);

  if (dbError) return { error: 'Failed to mark done.' };
  bust();
  return { success: true };
}

// ── Bulk dismiss ──────────────────────────────────────────────────────────────

export async function bulkDismiss(ids: string[]) {
  const { error, userId } = await requireUser();
  if (error) return { error };
  if (!Array.isArray(ids) || ids.length === 0) return { error: 'No commitments selected.' };
  if (ids.length > 100) return { error: 'Too many selected (max 100 at once).' };
  if (!ids.every((id) => typeof id === 'string' && id.length > 0)) return { error: 'Invalid selection.' };

  const { error: dbError } = await supabaseAdmin
    .from('commitments')
    .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
    .in('id', ids)
    .eq('user_id', userId);

  if (dbError) return { error: 'Failed to dismiss.' };
  bust();
  return { success: true };
}
