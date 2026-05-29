'use server';

import { auth }          from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

const API_URL     = process.env.BACKEND_API_URL || 'http://localhost:3000';
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthenticated' as const, userId: null as null };
  return { error: null as null, userId: session.user.id };
}

// ── Refresh ───────────────────────────────────────────────────────────────────
// Calls Express backend (background job — returns immediately).

export async function triggerRefresh(): Promise<{ status: string; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { status: 'error', error };

  try {
    const res = await fetch(`${API_URL}/api/engagement/refresh`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-key': SERVICE_KEY,
      },
      body: JSON.stringify({ user_id: userId }),
    });
    const data = await res.json();
    if (!res.ok) return { status: 'error', error: data.error };
    return data;
  } catch (err: unknown) {
    return { status: 'error', error: err instanceof Error ? err.message : 'Request failed' };
  }
}

// ── Status (read from Supabase directly — no backend hop needed) ──────────────

export async function getEngagementStatus(): Promise<{
  refresh_status: string;
  last_refreshed: string | null;
} | null> {
  const { error, userId } = await requireUser();
  if (error) return null;

  const { data } = await supabaseAdmin
    .from('users')
    .select('engagement_refresh_status, engagement_last_refreshed')
    .eq('id', userId)
    .single();

  return {
    refresh_status: data?.engagement_refresh_status ?? 'never',
    last_refreshed: data?.engagement_last_refreshed ?? null,
  };
}

// ── Single / bulk action ──────────────────────────────────────────────────────

export async function executeBulkAction(
  action: string,
  senderEmails: string[],
  deleteExisting = false,
  olderThanDays: number | null = null,
): Promise<{ succeeded: number; failed: number; results: ActionResult[]; error?: string; upgrade?: boolean }> {
  const { error, userId } = await requireUser();
  if (error) return { succeeded: 0, failed: 0, results: [], error };

  try {
    const res = await fetch(`${API_URL}/api/engagement/action`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-key': SERVICE_KEY,
      },
      body: JSON.stringify({
        user_id:                userId,
        action,
        sender_emails:          senderEmails,
        delete_existing:        deleteExisting,
        delete_older_than_days: olderThanDays,
        confirmed:              true,
      }),
    });
    const data = await res.json();
    if (!res.ok) return { succeeded: 0, failed: 0, results: [], error: data.error, upgrade: data.upgrade ?? false };
    revalidatePath('/sender-intelligence');
    return data;
  } catch (err: unknown) {
    return { succeeded: 0, failed: 0, results: [], error: err instanceof Error ? err.message : 'Request failed' };
  }
}

export type ActionResult = {
  sender_email: string;
  success:      boolean;
  error?:       string;
  method?:      string;
  emails_affected?: number;
};

export type ActionHistoryItem = {
  id:               string;
  sender_email:     string;
  action_type:      string;
  status:           string;
  emails_affected:  number | null;
  error_message:    string | null;
  created_at:       string;
  completed_at:     string | null;
};

// ── Email preview ─────────────────────────────────────────────────────────────

export type SenderPreview = {
  subject:  string | null;
  from:     string | null;
  date:     string | null;
  snippet:  string | null;
  date_ts:  number | null;
  total:    string | number;
};

export async function getSenderPreview(senderEmail: string): Promise<{ preview: SenderPreview | null; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { preview: null, error };

  // Calls the Express backend which uses the Gmail API to fetch email snippets.
  // Passes user_id + service key so the backend can look up the refresh token.
  try {
    const res = await fetch(
      `${API_URL}/api/engagement/preview?sender=${encodeURIComponent(senderEmail)}&user_id=${encodeURIComponent(userId!)}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-service-key': SERVICE_KEY,
        },
      },
    );
    const data = await res.json();
    if (!res.ok) return { preview: null, error: data.error };
    return data;
  } catch (err: unknown) {
    return { preview: null, error: err instanceof Error ? err.message : 'Request failed' };
  }
}

// ── History (read from Supabase directly) ─────────────────────────────────────

export async function getActionHistory(): Promise<{ actions: ActionHistoryItem[]; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { actions: [], error };

  const { data, error: dbError } = await supabaseAdmin
    .from('sender_actions')
    .select('id, sender_email, action_type, status, emails_affected, error_message, created_at, completed_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (dbError) return { actions: [], error: dbError.message };
  return { actions: data ?? [] };
}

// ── Undo ──────────────────────────────────────────────────────────────────────

export async function undoAction(actionId: string): Promise<{ success: boolean; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { success: false, error };

  try {
    const res = await fetch(`${API_URL}/api/engagement/undo`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-key': SERVICE_KEY,
      },
      body: JSON.stringify({ user_id: userId, action_id: actionId }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error };
    revalidatePath('/sender-intelligence');
    return data;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Request failed' };
  }
}
