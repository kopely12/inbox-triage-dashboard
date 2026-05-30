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

// ── AI sender description ─────────────────────────────────────────────────────

export async function describeSenders(
  senderEmails: string[],
): Promise<{ descriptions: Record<string, string | null>; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { descriptions: {}, error };

  try {
    const res = await fetch(`${API_URL}/api/engagement/describe-sender`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-key': SERVICE_KEY },
      body: JSON.stringify({ user_id: userId, sender_emails: senderEmails }),
    });
    const data = await res.json();
    if (!res.ok) return { descriptions: {}, error: data.error };
    return data;
  } catch (err: unknown) {
    return { descriptions: {}, error: err instanceof Error ? err.message : 'Request failed' };
  }
}

// ── Safety scan before delete ─────────────────────────────────────────────────

export type SafetyFinding = {
  sender:   string;
  subject:  string;
  reason:   string;
  severity: 'warning' | 'info';
};

export async function scanBeforeDelete(
  senderEmails: string[],
  olderThanDays: number | null,
): Promise<{ findings: SafetyFinding[]; skipped?: boolean; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { findings: [], error };

  try {
    const res = await fetch(`${API_URL}/api/engagement/scan-before-delete`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-key': SERVICE_KEY },
      body: JSON.stringify({ user_id: userId, sender_emails: senderEmails, older_than_days: olderThanDays }),
    });
    const data = await res.json();
    if (!res.ok) return { findings: [], error: data.error };
    return data;
  } catch (err: unknown) {
    return { findings: [], error: err instanceof Error ? err.message : 'Request failed' };
  }
}

// ── Noise briefing ────────────────────────────────────────────────────────────

export type NoiseBriefing = {
  generated_at:    string;
  headline:        string;
  summary:         string;
  stats: {
    recent_noise_senders: number;
    recent_noise_emails:  number;
    can_unsubscribe:      number;
  };
  top_senders: Array<{ email: string; name: string; category: string; emails: number; engagement: number }>;
  proposed_action: string | null;
};

export async function getNoiseBriefing(): Promise<{ briefing: NoiseBriefing | null; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { briefing: null, error };

  const { data, error: dbError } = await supabaseAdmin
    .from('users')
    .select('preferences')
    .eq('id', userId)
    .single();

  if (dbError) return { briefing: null, error: dbError.message };
  return { briefing: data?.preferences?.engagement?.last_briefing ?? null };
}

// ── Cleanup schedule ──────────────────────────────────────────────────────────

export type CleanupSchedule = {
  enabled:         boolean;
  frequency:       'daily' | 'weekly' | 'monthly';
  day_of_week:     string;
  categories:      string[];
  older_than_days: number;
  next_run_at:     string | null;
  last_run_at:     string | null;
};

export async function getCleanupSchedule(): Promise<{ schedule: CleanupSchedule | null; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { schedule: null, error };

  const { data, error: dbError } = await supabaseAdmin
    .from('users')
    .select('preferences')
    .eq('id', userId)
    .single();

  if (dbError) return { schedule: null, error: dbError.message };
  return { schedule: data?.preferences?.engagement?.scheduled_cleanup ?? null };
}

export async function saveCleanupSchedule(
  schedule: Partial<CleanupSchedule> & { enabled: boolean },
): Promise<{ schedule: CleanupSchedule | null; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { schedule: null, error };

  try {
    const res = await fetch(`${API_URL}/api/engagement/schedule`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-key': SERVICE_KEY },
      body: JSON.stringify({ user_id: userId, ...schedule }),
    });
    const data = await res.json();
    if (!res.ok) return { schedule: null, error: data.error };
    return data;
  } catch (err: unknown) {
    return { schedule: null, error: err instanceof Error ? err.message : 'Request failed' };
  }
}

// ── Trash single email ────────────────────────────────────────────────────────

export async function trashEmail(messageId: string): Promise<{ success: boolean; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { success: false, error };

  try {
    const res = await fetch(`${API_URL}/api/engagement/emails/trash`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-key': SERVICE_KEY },
      body: JSON.stringify({ user_id: userId, message_id: messageId }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error };
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Request failed' };
  }
}

// ── Inbox Health ─────────────────────────────────────────────────────────────

export type InboxHealthComponent = {
  score:  number;
  max:    number;
  label:  string;
  detail: string;
};

export type InboxHealthRecommendation = {
  priority: number;
  label:    string;
  action:   'senders' | 'deep_clean';
  impact:   'high' | 'medium' | 'low';
};

export type InboxHealthData = {
  score:       number | null;
  grade:       string | null;     // A+, A, B, C, D, F
  components:  Record<string, InboxHealthComponent> | null;
  recommendations: InboxHealthRecommendation[];
  trend:       Array<{ score: number; snapshot_date: string }>;
  metadata: {
    total_senders:       number;
    noise_senders:       number;
    acted_on:            number;
    unsubscribeable:     number;
    unsubscribed:        number;
    days_since_action:   number;
    unresolved_opt_outs: number;
  };
};

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

export async function getInboxHealth(): Promise<{ health: InboxHealthData | null; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { health: null, error };

  const [sendersRes, actionsRes, jobsRes, trendRes] = await Promise.all([
    supabaseAdmin
      .from('sender_engagement')
      .select('category, has_unsubscribe_header, unsubscribe_status, auto_archive_enabled, ignored, opt_out_replied_at')
      .eq('user_id', userId!),

    supabaseAdmin
      .from('sender_actions')
      .select('created_at')
      .eq('user_id', userId!)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1),

    supabaseAdmin
      .from('cleanup_jobs')
      .select('completed_at')
      .eq('user_id', userId!)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1),

    supabaseAdmin
      .from('inbox_health_snapshots')
      .select('score, snapshot_date')
      .eq('user_id', userId!)
      .order('snapshot_date', { ascending: true })
      .limit(30),
  ]);

  const senders = sendersRes.data ?? [];
  if (senders.length === 0) return { health: { score: null, grade: null, components: null, recommendations: [], trend: [], metadata: { total_senders: 0, noise_senders: 0, acted_on: 0, unsubscribeable: 0, unsubscribed: 0, days_since_action: 999, unresolved_opt_outs: 0 } } };

  const totalSenders  = senders.length;
  const noiseSenders  = senders.filter((s) => s.category === 'never_engage' || s.category === 'rarely_engage');
  const noiseCount    = noiseSenders.length;

  const actedOn = noiseSenders.filter((s) =>
    s.unsubscribe_status === 'unsubscribed' || s.auto_archive_enabled || s.ignored,
  ).length;

  const unsubscribeable = noiseSenders.filter((s) => s.has_unsubscribe_header).length;
  const unsubscribed    = noiseSenders.filter((s) =>
    s.has_unsubscribe_header && s.unsubscribe_status === 'unsubscribed',
  ).length;

  const unresolvedOptOuts = noiseSenders.filter((s) =>
    s.opt_out_replied_at && s.unsubscribe_status !== 'unsubscribed',
  ).length;

  const lastAction = actionsRes.data?.[0]?.created_at ?? jobsRes.data?.[0]?.completed_at ?? null;
  const daysSince  = lastAction
    ? (Date.now() - new Date(lastAction).getTime()) / 86_400_000
    : 90;

  // ── Component scores ──────────────────────────────────────────────────────
  const noiseRatio        = totalSenders > 0 ? noiseCount / totalSenders : 0;
  const noiseScore        = Math.round(25 * Math.max(0, 1 - noiseRatio * 1.5));
  const cleanupScore      = noiseCount > 0 ? Math.round(25 * (actedOn / noiseCount)) : 25;
  const subscriptionScore = unsubscribeable > 0 ? Math.round(20 * (unsubscribed / unsubscribeable)) : 20;
  const recencyScore      = Math.round(15 * Math.max(0, 1 - daysSince / 60));
  const replyDebtScore    = unresolvedOptOuts === 0
    ? 15
    : Math.round(15 * Math.max(0, 1 - unresolvedOptOuts / 5));

  const score = Math.min(100, Math.max(0, noiseScore + cleanupScore + subscriptionScore + recencyScore + replyDebtScore));

  const components: Record<string, InboxHealthComponent> = {
    noise:        { score: noiseScore,        max: 25, label: 'Noise ratio',       detail: `${noiseCount} of ${totalSenders} senders are noise` },
    cleanup:      { score: cleanupScore,      max: 25, label: 'Cleanup hygiene',   detail: `${actedOn} of ${noiseCount} noise senders actioned` },
    subscription: { score: subscriptionScore, max: 20, label: 'Subscription debt', detail: `${unsubscribed} of ${unsubscribeable} unsubscribed` },
    recency:      { score: recencyScore,      max: 15, label: 'Recent activity',   detail: lastAction ? `Last action ${Math.round(daysSince)}d ago` : 'No cleanup actions yet' },
    reply_debt:   { score: replyDebtScore,    max: 15, label: 'Reply health',      detail: unresolvedOptOuts > 0 ? `${unresolvedOptOuts} opt-out replies unresolved` : 'All opt-outs resolved' },
  };

  // ── Recommendations ───────────────────────────────────────────────────────
  const recs: InboxHealthRecommendation[] = [];
  const canUnsub   = unsubscribeable - unsubscribed;
  const unactedNoise = noiseCount - actedOn;

  if (unresolvedOptOuts > 0) recs.push({ priority: 1, label: `Unsubscribe from ${unresolvedOptOuts} sender${unresolvedOptOuts > 1 ? 's' : ''} you asked to stop emailing you`, action: 'senders',    impact: 'high' });
  if (canUnsub > 0)          recs.push({ priority: 2, label: `Unsubscribe from ${canUnsub} noise sender${canUnsub > 1 ? 's' : ''} with unsubscribe links`,                          action: 'senders',    impact: canUnsub > 5 ? 'high' : 'medium' });
  if (unactedNoise > 3)      recs.push({ priority: 3, label: `Run a deep clean on ${unactedNoise} unactioned noise sender${unactedNoise > 1 ? 's' : ''}`,                           action: 'deep_clean', impact: unactedNoise > 10 ? 'high' : 'medium' });
  if (daysSince > 30 && score < 80) recs.push({ priority: 4, label: `${Math.round(daysSince)} days since last cleanup — schedule a recurring clean`,                                action: 'deep_clean', impact: 'medium' });

  const metadata = { total_senders: totalSenders, noise_senders: noiseCount, acted_on: actedOn, unsubscribeable, unsubscribed, days_since_action: Math.round(daysSince), unresolved_opt_outs: unresolvedOptOuts };

  return {
    health: {
      score,
      grade: scoreToGrade(score),
      components,
      recommendations: recs.sort((a, b) => a.priority - b.priority).slice(0, 3),
      trend: (trendRes.data ?? []) as Array<{ score: number; snapshot_date: string }>,
      metadata,
    },
  };
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
