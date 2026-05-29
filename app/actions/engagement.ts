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

// ── Types ─────────────────────────────────────────────────────────────────────

export type CleanupJob = {
  id:                string;
  job_type:          string;
  action:            string | null;
  status:            string;
  total_senders:     number;
  processed_senders: number;
  succeeded:         number;
  failed:            number;
  results?:          Array<{ sender_email: string; success: boolean; error?: string; emails_affected?: number }>;
  error_message:     string | null;
  created_at:        string;
  started_at:        string | null;
  completed_at:      string | null;
};

export type StorageSender = {
  sender_email:  string;
  sender_name:   string | null;
  total_bytes:   number;
  total_mb:      string;
  message_count: number;
  largest_mb:    string;
};

export type LargeEmail = {
  id:           string;
  size_bytes:   number;
  size_mb:      string;
  subject:      string;
  sender_email: string;
  sender_name:  string | null;
  date_ts:      number | null;
};

export type StorageResult = {
  senders_by_storage: StorageSender[];
  largest_emails:     LargeEmail[];
  total_scanned_mb:   string;
  messages_scanned:   number;
  scanned_at:         string;
  from_cache:         boolean;
};

export type ScreenerSender = {
  id:              string;
  sender_email:    string;
  sender_name:     string | null;
  sender_domain:   string | null;
  email_count:     number;
  sample_subject:  string | null;
  first_email_date: string | null;
  status:          string;
  created_at:      string;
};

// ── Async jobs ────────────────────────────────────────────────────────────────

export async function createBulkJob(
  action: string,
  senderEmails: string[],
  deleteExisting = false,
  olderThanDays: number | null = null,
): Promise<{ job?: CleanupJob; error?: string; upgrade?: boolean }> {
  const { error, userId } = await requireUser();
  if (error) return { error };

  try {
    const res = await fetch(`${API_URL}/api/engagement/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-key': SERVICE_KEY },
      body: JSON.stringify({
        user_id:       userId,
        action,
        sender_emails: senderEmails,
        delete_existing: deleteExisting,
        older_than_days: olderThanDays,
        confirmed: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error, upgrade: data.upgrade };
    return data;
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Request failed' };
  }
}

export async function getJobs(): Promise<{ jobs: CleanupJob[]; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { jobs: [], error };

  const { data, error: dbError } = await supabaseAdmin
    .from('cleanup_jobs')
    .select('id, job_type, action, status, total_senders, processed_senders, succeeded, failed, created_at, started_at, completed_at, error_message')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (dbError) return { jobs: [], error: dbError.message };
  return { jobs: (data ?? []) as CleanupJob[] };
}

export async function getJob(jobId: string): Promise<{ job?: CleanupJob; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { error };

  const { data, error: dbError } = await supabaseAdmin
    .from('cleanup_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .single();

  if (dbError) return { error: dbError.message };
  return { job: data as CleanupJob };
}

// ── Deep clean ────────────────────────────────────────────────────────────────

export async function estimateDeepClean(
  categories: string[],
  olderThanDays: number | null,
): Promise<{ senders: number; estimated_emails: number; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { senders: 0, estimated_emails: 0, error };

  try {
    const res = await fetch(`${API_URL}/api/engagement/deep-clean/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-key': SERVICE_KEY },
      body: JSON.stringify({ user_id: userId, categories, older_than_days: olderThanDays }),
    });
    const data = await res.json();
    if (!res.ok) return { senders: 0, estimated_emails: 0, error: data.error };
    return data;
  } catch (err: unknown) {
    return { senders: 0, estimated_emails: 0, error: err instanceof Error ? err.message : 'Request failed' };
  }
}

export async function runDeepClean(
  categories: string[],
  olderThanDays: number | null,
): Promise<{ job?: CleanupJob; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { error };

  try {
    const res = await fetch(`${API_URL}/api/engagement/deep-clean/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-key': SERVICE_KEY },
      body: JSON.stringify({ user_id: userId, categories, older_than_days: olderThanDays, confirmed: true }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error };
    return data;
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Request failed' };
  }
}

// ── Storage analysis ──────────────────────────────────────────────────────────

export async function getStorageAnalysis(force = false): Promise<{ result?: StorageResult; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { error };

  try {
    const res = await fetch(
      `${API_URL}/api/engagement/storage?user_id=${encodeURIComponent(userId!)}${force ? '&force=true' : ''}`,
      { headers: { 'Content-Type': 'application/json', 'x-service-key': SERVICE_KEY } },
    );
    const data = await res.json();
    if (!res.ok) return { error: data.error };
    return { result: data };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Request failed' };
  }
}

// ── Screener ──────────────────────────────────────────────────────────────────

export async function enableScreener(): Promise<{ success: boolean; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { success: false, error };
  try {
    const res = await fetch(`${API_URL}/api/engagement/screener/enable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-key': SERVICE_KEY },
      body: JSON.stringify({ user_id: userId }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error };
    revalidatePath('/sender-intelligence');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Request failed' };
  }
}

export async function disableScreener(): Promise<{ success: boolean; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { success: false, error };
  try {
    const res = await fetch(`${API_URL}/api/engagement/screener/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-key': SERVICE_KEY },
      body: JSON.stringify({ user_id: userId }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error };
    revalidatePath('/sender-intelligence');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Request failed' };
  }
}

export async function getScreenerQueue(): Promise<{ queue: ScreenerSender[]; settings: { enabled: boolean; last_scan: string | null; whitelist: string[] }; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { queue: [], settings: { enabled: false, last_scan: null, whitelist: [] }, error };

  const { data: queueData } = await supabaseAdmin
    .from('screener_senders')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('preferences')
    .eq('id', userId)
    .single();

  const prefs = user?.preferences?.engagement || {};
  return {
    queue:    (queueData ?? []) as ScreenerSender[],
    settings: {
      enabled:   !!prefs.screener_enabled,
      last_scan: prefs.screener_last_scan || null,
      whitelist: prefs.screener_whitelist || [],
    },
  };
}

export async function reviewScreenerBatch(
  senderEmails: string[],
  decision: 'approved' | 'blocked',
): Promise<{ processed: number; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { processed: 0, error };

  try {
    const res = await fetch(`${API_URL}/api/engagement/screener/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-key': SERVICE_KEY },
      body: JSON.stringify({ user_id: userId, sender_emails: senderEmails, decision }),
    });
    const data = await res.json();
    if (!res.ok) return { processed: 0, error: data.error };
    revalidatePath('/sender-intelligence');
    return data;
  } catch (err: unknown) {
    return { processed: 0, error: err instanceof Error ? err.message : 'Request failed' };
  }
}
