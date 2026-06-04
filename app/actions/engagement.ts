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

export type PreviewEmail = {
  subject: string | null;
  from:    string | null;
  date:    string | null;
  snippet: string | null;
  date_ts: number | null;
};

export type SenderPreview = PreviewEmail & {
  total?:  string | number;
  emails?: PreviewEmail[];
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
    // Embed the emails array into the preview object so the modal
    // has access to all fetched emails for navigation.
    const preview: SenderPreview | null = data.preview
      ? { ...data.preview, emails: data.emails ?? [data.preview] }
      : null;
    return { preview };
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

export type TrustSignals = {
  spf:              'pass' | 'fail' | 'neutral' | 'unknown';
  dkim:             'pass' | 'fail' | 'unknown';
  dmarc:            'pass' | 'fail' | 'unknown';
  has_list_headers: boolean;
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
  trust_signals:   TrustSignals | null;
  lookalike_of:    string | null;
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
): Promise<{ senders: number; estimated_emails: number; sender_emails: string[]; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { senders: 0, estimated_emails: 0, sender_emails: [], error };

  try {
    const res = await fetch(`${API_URL}/api/engagement/deep-clean/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-key': SERVICE_KEY },
      body: JSON.stringify({ user_id: userId, categories, older_than_days: olderThanDays }),
    });
    const data = await res.json();
    if (!res.ok) return { senders: 0, estimated_emails: 0, sender_emails: [], error: data.error };
    return { ...data, sender_emails: data.sender_emails ?? [] };
  } catch (err: unknown) {
    return { senders: 0, estimated_emails: 0, sender_emails: [], error: err instanceof Error ? err.message : 'Request failed' };
  }
}

export async function runDeepClean(
  categories: string[],
  olderThanDays: number | null,
  excludedEmails: string[] = [],
): Promise<{ job?: CleanupJob; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { error };

  try {
    const res = await fetch(`${API_URL}/api/engagement/deep-clean/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-key': SERVICE_KEY },
      body: JSON.stringify({ user_id: userId, categories, older_than_days: olderThanDays, excluded_emails: excludedEmails, confirmed: true }),
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

export async function untrashEmail(messageId: string): Promise<{ success: boolean; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { success: false, error };

  try {
    const res = await fetch(`${API_URL}/api/engagement/emails/untrash`, {
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

// ── Analysis schedule ─────────────────────────────────────────────────────────

export type AnalysisSchedule = {
  enabled:      boolean;
  refresh_day:  string;   // 'monday' … 'sunday'
  refresh_hour: number;   // 0–23 UTC
};

export async function getAnalysisSchedule(): Promise<{ schedule: AnalysisSchedule }> {
  const { error, userId } = await requireUser();
  if (error) return { schedule: { enabled: true, refresh_day: 'sunday', refresh_hour: 23 } };

  const { data } = await supabaseAdmin
    .from('users')
    .select('preferences')
    .eq('id', userId!)
    .single();

  const eng = data?.preferences?.engagement ?? {};
  return {
    schedule: {
      enabled:      eng.auto_refresh_enabled !== false,
      refresh_day:  eng.refresh_day  || 'sunday',
      refresh_hour: eng.refresh_hour ?? 23,
    },
  };
}

export async function saveAnalysisSchedule(
  schedule: AnalysisSchedule,
): Promise<{ error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { error };

  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('preferences')
    .eq('id', userId!)
    .single();

  const prefs = userData?.preferences ?? {};
  const eng   = prefs.engagement      ?? {};

  const updated = {
    ...prefs,
    engagement: {
      ...eng,
      auto_refresh_enabled: schedule.enabled,
      refresh_day:          schedule.refresh_day,
      refresh_hour:         schedule.refresh_hour,
    },
  };

  const { error: dbErr } = await supabaseAdmin
    .from('users')
    .update({ preferences: updated })
    .eq('id', userId!);

  if (dbErr) return { error: dbErr.message };
  revalidatePath('/preferences');
  return {};
}

// ── Inbox Health ─────────────────────────────────────────────────────────────

export type PendingMilestone = {
  type:         'grade' | 'streak';
  grade?:       string;    // e.g. 'B', 'A', 'A+' (grade milestones)
  streak?:      number;    // e.g. 7, 14, 30      (streak milestones)
  score:        number;
  message:      string;
  achieved_at:  string;    // YYYY-MM-DD
};

export type InboxHealthComponent = {
  score:  number;
  max:    number;
  label:  string;
  detail: string;
};

export type InboxHealthRecommendation = {
  priority:          number;
  label:             string;
  action:            'senders' | 'deep_clean' | 'opt_outs';
  impact:            'high' | 'medium' | 'low';
  points_gained:     number;   // projected pts added if this action is completed
  estimated_minutes: number;   // ~time to complete this action
};

export type InboxHealthTrendPoint = {
  score:               number;
  snapshot_date:       string;
  noise_score?:        number | null;
  cleanup_score?:      number | null;
  subscription_score?: number | null;
  recency_score?:      number | null;
  reply_debt_score?:   number | null;
};

export type InboxHealthData = {
  score:           number | null;
  grade:           string | null;     // A+, A, B, C, D, F
  components:      Record<string, InboxHealthComponent> | null;
  recommendations: InboxHealthRecommendation[];
  trend:           InboxHealthTrendPoint[];
  metadata: {
    total_senders:            number;
    noise_senders:            number;
    acted_on:                 number;
    unsubscribeable:          number;
    unsubscribed:             number;
    days_since_action:        number;
    opt_out_count:            number;  // senders with any opt-out reply on record
    still_sending_count:      number;  // senders still emailing after opt-out
    still_sending_emails:     number;  // total emails received after opt-out across those senders
    // Time-cost frame
    noise_emails_per_month:   number;  // estimated noise emails/month (basis: 30-day period)
    time_cost_minutes_month:  number;  // minutes/month lost to scanning noise (~5 sec/email)
    time_cost_hours_year:     number;  // hours/year — the headline "attention tax" number
    // Enriched fields
    category_counts:          Record<string, number>;   // sender count per category
    email_counts_by_category: Record<string, number>;   // email volume per category
    delta:                    number | null;             // score change vs ~7 days ago
    streak:                   number;                   // consecutive snapshots ≥ 70
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
      .select('category, has_unsubscribe_header, unsubscribe_status, auto_archive_enabled, ignored, opt_out_replied_at, last_email_date, emails_received')
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

    // Fetch 90 days of snapshots including all component scores for trend charts
    supabaseAdmin
      .from('inbox_health_snapshots')
      .select('score, snapshot_date, noise_score, cleanup_score, subscription_score, recency_score, reply_debt_score')
      .eq('user_id', userId!)
      .order('snapshot_date', { ascending: true })
      .limit(90),
  ]);

  if (sendersRes.error) {
    console.error('[getInboxHealth] sender_engagement query failed:', sendersRes.error.message);
  }
  const senders = sendersRes.data ?? [];
  const emptyMeta = {
    total_senders: 0, noise_senders: 0, acted_on: 0,
    unsubscribeable: 0, unsubscribed: 0, days_since_action: 999,
    opt_out_count: 0, still_sending_count: 0, still_sending_emails: 0,
    noise_emails_per_month: 0, time_cost_minutes_month: 0, time_cost_hours_year: 0,
    category_counts: {}, email_counts_by_category: {},
    delta: null, streak: 0,
  };
  if (senders.length === 0) return {
    health: { score: null, grade: null, components: null, recommendations: [], trend: [], metadata: emptyMeta },
  };

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

  const allOptOuts = senders.filter((s) => s.opt_out_replied_at);
  const stillSending = allOptOuts.filter((s) => {
    if (s.unsubscribe_status === 'unsubscribed') return false;
    if (!s.last_email_date) return false;
    return new Date(s.last_email_date) > new Date(s.opt_out_replied_at!);
  });
  // emails_since_optout is not fetched in this query (migration 007 may not be applied);
  // use 0 here — the per-sender count is displayed in the Opt-outs tab instead.
  const stillSendingEmailCount = 0;

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
  const replyDebtScore    = stillSending.length === 0
    ? 15
    : Math.round(15 * Math.max(0, 1 - stillSending.length / 5));

  const score = Math.min(100, Math.max(0, noiseScore + cleanupScore + subscriptionScore + recencyScore + replyDebtScore));

  // ── Category counts (for distribution chart) ──────────────────────────────
  const category_counts:          Record<string, number> = {};
  const email_counts_by_category: Record<string, number> = {};
  for (const s of senders) {
    const cat = s.category || 'unknown';
    category_counts[cat]          = (category_counts[cat]          || 0) + 1;
    email_counts_by_category[cat] = (email_counts_by_category[cat] || 0) + (s.emails_received || 0);
  }

  // ── Trend delta (score change vs snapshot ~7 days ago) ────────────────────
  const trend = (trendRes.data ?? []) as InboxHealthTrendPoint[];
  const sevenDaysAgo  = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const weekOldSnap   = [...trend].reverse().find((s) => s.snapshot_date <= sevenDaysAgo);
  const delta: number | null = weekOldSnap != null ? score - weekOldSnap.score : null;

  // ── Streak (consecutive snapshots ≥ 70 from most recent) ─────────────────
  let streak = 0;
  for (let i = trend.length - 1; i >= 0; i--) {
    if (trend[i].score >= 70) streak++;
    else break;
  }

  const components: Record<string, InboxHealthComponent> = {
    noise:        { score: noiseScore,        max: 25, label: 'Noise ratio',       detail: `${noiseCount} of ${totalSenders} senders are noise` },
    cleanup:      { score: cleanupScore,      max: 25, label: 'Cleanup hygiene',   detail: `${actedOn} of ${noiseCount} noise senders actioned` },
    subscription: { score: subscriptionScore, max: 20, label: 'Subscription debt', detail: `${unsubscribed} of ${unsubscribeable} unsubscribed` },
    recency:      { score: recencyScore,      max: 15, label: 'Recent activity',   detail: lastAction ? `Last action ${Math.round(daysSince)}d ago` : 'No cleanup actions yet' },
    reply_debt:   { score: replyDebtScore,    max: 15, label: 'Ignored opt-outs',  detail: stillSending.length > 0 ? `${stillSending.length} sender${stillSending.length > 1 ? 's' : ''} still emailing after opt-out` : allOptOuts.length > 0 ? `${allOptOuts.length} opt-out${allOptOuts.length > 1 ? 's' : ''} — all respected` : 'No opt-out replies on record' },
  };

  // ── Recommendations with projected points gained ──────────────────────────
  const recs: InboxHealthRecommendation[] = [];
  const canUnsub     = unsubscribeable - unsubscribed;
  const unactedNoise = noiseCount - actedOn;

  if (stillSending.length > 0) recs.push({
    priority: 1,
    label: `${stillSending.length} sender${stillSending.length > 1 ? 's' : ''} ignored your opt-out — unsubscribe to stop them`,
    action: 'opt_outs', impact: 'high',
    points_gained: 15 - replyDebtScore,
    estimated_minutes: Math.max(1, stillSending.length),  // ~1 min per sender
  });
  if (canUnsub > 0) recs.push({
    priority: 2,
    label: `Unsubscribe from ${canUnsub} noise sender${canUnsub > 1 ? 's' : ''} with unsubscribe links`,
    action: 'senders', impact: canUnsub > 5 ? 'high' : 'medium',
    points_gained: 20 - subscriptionScore,
    estimated_minutes: Math.max(1, Math.ceil(canUnsub * 0.5)),  // ~30 sec per sender
  });
  if (unactedNoise > 3) recs.push({
    priority: 3,
    label: `Run a deep clean on ${unactedNoise} unactioned noise sender${unactedNoise > 1 ? 's' : ''}`,
    action: 'deep_clean', impact: unactedNoise > 10 ? 'high' : 'medium',
    points_gained: 25 - cleanupScore,
    estimated_minutes: 3,   // automated — just review & confirm
  });
  if (daysSince > 30 && score < 80) recs.push({
    priority: 4,
    label: `${Math.round(daysSince)} days since last cleanup — run a quick scan`,
    action: 'deep_clean', impact: 'medium',
    points_gained: 15 - recencyScore,
    estimated_minutes: 3,
  });

  // ── Time cost frame ───────────────────────────────────────────────────────────
  // Assume ~5 seconds per noise email (recognise subject + scroll past + context switch).
  // emails_received approximates a ~30-day period (the default analysis window).
  const noiseEmailsPerMonth   = noiseSenders.reduce((sum, s) => sum + (s.emails_received || 0), 0);
  const timeCostMinutesMonth  = Math.round(noiseEmailsPerMonth * 5 / 60);
  const timeCostHoursYear     = +(timeCostMinutesMonth * 12 / 60).toFixed(1);

  const metadata = {
    total_senders: totalSenders, noise_senders: noiseCount, acted_on: actedOn,
    unsubscribeable, unsubscribed, days_since_action: Math.round(daysSince),
    opt_out_count: allOptOuts.length,
    still_sending_count: stillSending.length,
    still_sending_emails: stillSendingEmailCount,
    noise_emails_per_month: noiseEmailsPerMonth,
    time_cost_minutes_month: timeCostMinutesMonth,
    time_cost_hours_year: timeCostHoursYear,
    category_counts, email_counts_by_category, delta, streak,
  };

  return {
    health: {
      score,
      grade: scoreToGrade(score),
      components,
      recommendations: recs.sort((a, b) => a.priority - b.priority),
      trend,
      metadata,
    },
  };
}

// ── Opt-out senders ───────────────────────────────────────────────────────────

export type OptOutSender = {
  sender_email:        string;
  sender_name:         string | null;
  sender_domain:       string | null;
  opt_out_replied_at:  string;           // ISO — when user sent the opt-out reply
  unsubscribe_status:  string | null;
  last_email_date:     string | null;
  emails_since_optout: number;           // emails received AFTER the opt-out date
  has_unsubscribe_header: boolean;
  unsubscribe_http_url:   string | null;
  unsubscribe_mailto:     string | null;
  category:            string;
  // Computed client-side:
  resolution?: 'unsubscribed' | 'still_sending' | 'went_quiet';
};

export async function getOptOutSenders(): Promise<{ senders: OptOutSender[] }> {
  const { error, userId } = await requireUser();
  if (error) return { senders: [] };

  const { data } = await supabaseAdmin
    .from('sender_engagement')
    .select(`
      sender_email, sender_name, sender_domain,
      opt_out_replied_at, unsubscribe_status, last_email_date,
      emails_since_optout, has_unsubscribe_header,
      unsubscribe_http_url, unsubscribe_mailto, category
    `)
    .eq('user_id', userId!)
    .not('opt_out_replied_at', 'is', null)
    .order('opt_out_replied_at', { ascending: false });

  return { senders: (data ?? []) as OptOutSender[] };
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

export type ScreenerStats = {
  total:    number;
  pending:  number;
  approved: number;
  blocked:  number;
};

export async function getScreenerQueue(): Promise<{
  queue:    ScreenerSender[];
  settings: { enabled: boolean; last_scan: string | null; whitelist: string[] };
  stats:    ScreenerStats;
  error?:   string;
}> {
  const emptyStats: ScreenerStats = { total: 0, pending: 0, approved: 0, blocked: 0 };
  const { error, userId } = await requireUser();
  if (error) return { queue: [], settings: { enabled: false, last_scan: null, whitelist: [] }, stats: emptyStats, error };

  const [{ data: queueData }, { data: allRows }, { data: user }] = await Promise.all([
    supabaseAdmin
      .from('screener_senders')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100),
    supabaseAdmin
      .from('screener_senders')
      .select('status')
      .eq('user_id', userId),
    supabaseAdmin
      .from('users')
      .select('preferences')
      .eq('id', userId)
      .single(),
  ]);

  const prefs = (user as { preferences?: Record<string, Record<string, unknown>> } | null)?.preferences?.engagement || {};
  const rows  = allRows ?? [];
  const stats: ScreenerStats = {
    total:    rows.length,
    pending:  rows.filter((r) => r.status === 'pending').length,
    approved: rows.filter((r) => r.status === 'approved').length,
    blocked:  rows.filter((r) => r.status === 'blocked').length,
  };

  return {
    queue:    (queueData ?? []) as ScreenerSender[],
    settings: {
      enabled:   !!(prefs.screener_enabled),
      last_scan: (prefs.screener_last_scan as string) || null,
      whitelist: (prefs.screener_whitelist as string[]) || [],
    },
    stats,
  };
}

export async function triggerScreenerScan(): Promise<{ error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { error };

  try {
    const res = await fetch(`${API_URL}/api/engagement/screener/scan`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-key': SERVICE_KEY },
      body:    JSON.stringify({ user_id: userId }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error };
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Request failed' };
  }
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

// ── Screener whitelist ────────────────────────────────────────────────────────

export async function addDomainToWhitelist(domain: string): Promise<{ error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { error };

  const { data } = await supabaseAdmin.from('users').select('preferences').eq('id', userId!).single();
  const prefs     = data?.preferences ?? {};
  const existing  = (prefs.screener_whitelist as string[]) ?? [];
  if (existing.includes(domain)) return {};
  const updated = { ...prefs, screener_whitelist: [...existing, domain] };
  const { error: dbErr } = await supabaseAdmin.from('users').update({ preferences: updated }).eq('id', userId!);
  if (dbErr) return { error: dbErr.message };
  revalidatePath('/sender-intelligence');
  return {};
}

export async function removeDomainFromWhitelist(domain: string): Promise<{ error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { error };

  const { data } = await supabaseAdmin.from('users').select('preferences').eq('id', userId!).single();
  const prefs    = data?.preferences ?? {};
  const existing = (prefs.screener_whitelist as string[]) ?? [];
  const updated  = { ...prefs, screener_whitelist: existing.filter((d) => d !== domain) };
  const { error: dbErr } = await supabaseAdmin.from('users').update({ preferences: updated }).eq('id', userId!);
  if (dbErr) return { error: dbErr.message };
  revalidatePath('/sender-intelligence');
  return {};
}

// ── Milestone ─────────────────────────────────────────────────────────────────

/** Returns the pending (unread) milestone for the current user, if any. */
export async function getMilestone(): Promise<{ milestone: PendingMilestone | null }> {
  const { error, userId } = await requireUser();
  if (error) return { milestone: null };

  const { data } = await supabaseAdmin
    .from('users')
    .select('preferences')
    .eq('id', userId!)
    .single();

  const milestone = (data?.preferences?.engagement?.achievements?.pending_milestone ?? null) as PendingMilestone | null;
  return { milestone };
}

/** Clears the pending milestone so it is not shown again. */
export async function dismissMilestone(): Promise<{ success: boolean }> {
  const { error, userId } = await requireUser();
  if (error) return { success: false };

  const { data } = await supabaseAdmin
    .from('users')
    .select('preferences')
    .eq('id', userId!)
    .single();

  const prefs    = (data?.preferences as Record<string, unknown>) ?? {};
  const engPrefs = (prefs.engagement  as Record<string, unknown>) ?? {};
  const achieve  = (engPrefs.achievements as Record<string, unknown>) ?? {};

  const updated = {
    ...prefs,
    engagement: {
      ...engPrefs,
      achievements: { ...achieve, pending_milestone: null },
    },
  };

  await supabaseAdmin
    .from('users')
    .update({ preferences: updated })
    .eq('id', userId!);

  return { success: true };
}

// ── Email Type Intelligence ───────────────────────────────────────────────────

export type EmailTypeStat = {
  email_type:  string;
  email_count: number;
  open_count:  number;
};

/**
 * Returns per-sender email type breakdowns from sender_type_stats.
 * Keyed by sender_email for O(1) lookup in the sender table.
 */
export async function getSenderTypeStats(
  periodDays = 90,
): Promise<{ typeStatsBySender: Record<string, EmailTypeStat[]>; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { typeStatsBySender: {}, error };

  const { data, error: dbError } = await supabaseAdmin
    .from('sender_type_stats')
    .select('sender_email, email_type, email_count, open_count')
    .eq('user_id', userId!)
    .eq('period_days', periodDays)
    .order('email_count', { ascending: false });

  if (dbError) return { typeStatsBySender: {}, error: dbError.message };

  const result: Record<string, EmailTypeStat[]> = {};
  for (const row of data ?? []) {
    if (!result[row.sender_email]) result[row.sender_email] = [];
    result[row.sender_email].push({
      email_type:  row.email_type,
      email_count: row.email_count,
      open_count:  row.open_count,
    });
  }

  return { typeStatsBySender: result };
}

// ── Cadence-aware filter suggestions ─────────────────────────────────────────

export type FilterSuggestionKind =
  | 'smart_archive'       // Mixed sender: valuable type + noise type → archive but keep receipts
  | 'full_archive'        // All types low-open → straight auto-archive
  | 'unsubscribe_noise';  // High frequency, all noise, has unsubscribe link

export type TypeSummary = {
  email_type:  string;
  email_count: number;
  open_rate:   number; // 0–1
};

export type FilterSuggestion = {
  sender_email:          string;
  sender_name:           string | null;
  category:              string;
  emails_per_week:       number;
  period_days:           number;
  kind:                  FilterSuggestionKind;
  message:               string;          // plain-English explanation
  valuable_types:        TypeSummary[];   // types worth keeping (open_rate >= 0.50)
  noise_types:           TypeSummary[];   // types to eliminate (open_rate < 0.10)
  has_unsubscribe_header: boolean;
  auto_archive_enabled:  boolean;
};

export async function getFilterSuggestions(): Promise<{
  suggestions: FilterSuggestion[];
  error?: string;
}> {
  const { error, userId } = await requireUser();
  if (error) return { suggestions: [], error };

  // Fetch engagement rows for candidates (enough volume, not already handled)
  const { data: engRows, error: engErr } = await supabaseAdmin
    .from('sender_engagement')
    .select('sender_email, sender_name, category, emails_received, period_days, engagement_rate, auto_archive_enabled, unsubscribe_status, has_unsubscribe_header')
    .eq('user_id', userId!)
    .eq('auto_archive_enabled', false)
    .neq('unsubscribe_status', 'unsubscribed')
    .not('category', 'in', '(known_contact,transactional)')
    .gte('emails_received', 10)
    .order('emails_received', { ascending: false })
    .limit(200);

  if (engErr) return { suggestions: [], error: engErr.message };
  if (!engRows?.length) return { suggestions: [] };

  // Fetch type stats for these senders
  const senderEmails = engRows.map((r) => r.sender_email);
  const { data: typeRows, error: typeErr } = await supabaseAdmin
    .from('sender_type_stats')
    .select('sender_email, email_type, email_count, open_count')
    .eq('user_id', userId!)
    .in('sender_email', senderEmails);

  if (typeErr) return { suggestions: [], error: typeErr.message };

  // Build type stats map: email → TypeSummary[]
  const typeMap = new Map<string, TypeSummary[]>();
  for (const row of typeRows ?? []) {
    const openRate = row.email_count > 0 ? row.open_count / row.email_count : 0;
    if (!typeMap.has(row.sender_email)) typeMap.set(row.sender_email, []);
    typeMap.get(row.sender_email)!.push({
      email_type:  row.email_type,
      email_count: row.email_count,
      open_rate:   openRate,
    });
  }

  const suggestions: FilterSuggestion[] = [];

  for (const eng of engRows) {
    const types = typeMap.get(eng.sender_email);
    if (!types || types.length < 2) continue; // need mixed types for a cadence insight

    const valuableTypes = types.filter((t) => t.open_rate >= 0.50 && t.email_count >= 3);
    const noiseTypes    = types.filter((t) => t.open_rate < 0.10  && t.email_count >= 3);

    // Need both a valuable type AND a noise type for a smart_archive suggestion
    if (!valuableTypes.length || !noiseTypes.length) continue;

    const emailsPerWeek = Math.round((eng.emails_received / Math.max(eng.period_days, 1)) * 7 * 10) / 10;

    // Sort for display: most frequent first
    valuableTypes.sort((a, b) => b.email_count - a.email_count);
    noiseTypes.sort((a, b) => b.email_count - a.email_count);

    const topValuable = valuableTypes[0];
    const topNoise    = noiseTypes[0];

    const valuableLabel = topValuable.email_type.charAt(0).toUpperCase() + topValuable.email_type.slice(1) + 's';
    const noiseLabel    = topNoise.email_type.charAt(0).toUpperCase() + topNoise.email_type.slice(1) + 's';
    const totalEmails   = types.reduce((n, t) => n + t.email_count, 0);
    const valuablePct   = Math.round((valuableTypes.reduce((n, t) => n + t.email_count, 0) / totalEmails) * 100);
    const noisePct      = Math.round((noiseTypes.reduce((n, t) => n + t.email_count, 0) / totalEmails) * 100);

    const displayName = eng.sender_name || eng.sender_email;

    suggestions.push({
      sender_email:           eng.sender_email,
      sender_name:            eng.sender_name,
      category:               eng.category,
      emails_per_week:        emailsPerWeek,
      period_days:            eng.period_days,
      kind:                   'smart_archive',
      message: `${displayName} sends ~${emailsPerWeek}/week. ${valuablePct}% are ${valuableLabel} (${Math.round(topValuable.open_rate * 100)}% opened) — ${noisePct}% are ${noiseLabel} (${Math.round(topNoise.open_rate * 100)}% opened). Auto-archive will skip the inbox but keep ${valuableLabel.toLowerCase()} coming through.`,
      valuable_types:         valuableTypes,
      noise_types:            noiseTypes,
      has_unsubscribe_header: eng.has_unsubscribe_header,
      auto_archive_enabled:   eng.auto_archive_enabled,
    });

    if (suggestions.length >= 20) break; // cap at 20 suggestions
  }

  return { suggestions };
}

// ── Filter audit ──────────────────────────────────────────────────────────────

export type FilterIssueType = 'orphaned' | 'dead' | 'duplicate' | 'untracked' | 'stale_reference';

export type FilterIssue = {
  type:          FilterIssueType;
  filter_id:     string;
  from_value:    string;
  sender_email?: string;
  is_tracked:    boolean;
  // orphaned
  reason?:       string;
  category?:     string;
  // dead
  days_silent?:  number | null;
  // duplicate
  action?:       string;
  original_id?:  string;
};

export type FilterAuditSummary = {
  total_gmail_filters: number;
  archive_filters:     number;
  orphaned:            number;
  dead:                number;
  duplicate:           number;
  untracked:           number;
  stale_reference:     number;
  total_issues:        number;
};

export type FilterAuditResult = {
  issues:  FilterIssue[];
  summary: FilterAuditSummary;
  error?:  string;
};

export async function getFilterAudit(): Promise<FilterAuditResult> {
  const { error, userId } = await requireUser();
  const empty: FilterAuditResult = {
    issues:  [],
    summary: { total_gmail_filters: 0, archive_filters: 0, orphaned: 0, dead: 0, duplicate: 0, untracked: 0, stale_reference: 0, total_issues: 0 },
  };
  if (error) return { ...empty, error };

  try {
    const res = await fetch(`${API_URL}/api/engagement/filter-audit`, {
      headers: { 'x-service-key': SERVICE_KEY, 'x-user-id': userId! },
      cache: 'no-store',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ...empty, error: data.error || `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { issues: data.issues || [], summary: data.summary || empty.summary };
  } catch (err: unknown) {
    return { ...empty, error: err instanceof Error ? err.message : 'Request failed' };
  }
}

export async function deleteFilterAuditItem(filterId: string): Promise<{ success: boolean; error?: string }> {
  const { error, userId: _userId } = await requireUser();
  if (error) return { success: false, error };

  try {
    const res = await fetch(`${API_URL}/api/engagement/filter-audit/${encodeURIComponent(filterId)}`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      // Uses session cookie auth (authenticateSession) — no service key needed
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.error || `HTTP ${res.status}` };
    }
    revalidatePath('/sender-intelligence');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Request failed' };
  }
}

// ── Auto-clean: manual one-time run ──────────────────────────────────────────

export type AutoCleanRuleSpec = {
  calendar?:      { enabled: boolean; days_after: number };
  otp?:           { enabled: boolean };
  promo?:         { enabled: boolean; days_after: number };
  shipping?:      { enabled: boolean };
  social?:        { enabled: boolean };
  look_back_days?: number | null;
};

export type AutoCleanResult = Record<string, { deleted: number } | { error: string }>;

export async function estimateAutoCleanNow(
  rules: AutoCleanRuleSpec,
): Promise<{ estimates?: Record<string, number>; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { error };

  try {
    const res = await fetch(`${API_URL}/api/engagement/auto-clean/estimate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-key': SERVICE_KEY },
      body:    JSON.stringify({ user_id: userId, rules }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? `HTTP ${res.status}` };
    return { estimates: data.estimates };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Request failed' };
  }
}

export async function runAutoCleanNow(
  rules: AutoCleanRuleSpec,
): Promise<{ results?: AutoCleanResult; error?: string }> {
  const { error, userId } = await requireUser();
  if (error) return { error };

  try {
    const res = await fetch(`${API_URL}/api/engagement/auto-clean/run`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-key': SERVICE_KEY },
      body:    JSON.stringify({ user_id: userId, rules }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? `HTTP ${res.status}` };
    return { results: data.results };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Request failed' };
  }
}
