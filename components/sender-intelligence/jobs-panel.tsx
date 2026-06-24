'use client';

// JobsPanel — shows active and recent cleanup jobs with live progress.
// Rendered as a floating panel when a job is in flight; also accessible
// from the History modal.

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, XCircle, Clock, Zap } from 'lucide-react';
import { Button }  from '@/components/ui/button';
import { cn }      from '@/lib/utils';
import { getJob, getJobs, type CleanupJob } from '@/app/actions/engagement';

// ── Helpers ───────────────────────────────────────────────────────────────────

function progressPercent(job: CleanupJob) {
  if (!job.total_senders) return 0;
  return Math.round((job.processed_senders / job.total_senders) * 100);
}

function jobStatusLabel(status: string) {
  switch (status) {
    case 'pending':   return 'Queued';
    case 'running':   return 'Processing…';
    case 'completed': return 'Done';
    case 'failed':    return 'Failed';
    case 'cancelled': return 'Cancelled';
    default:          return status;
  }
}

function actionLabel(action: string | null) {
  const map: Record<string, string> = {
    unsubscribe:         'Unsubscribe',
    bulk_delete:         'Delete emails',
    auto_archive:        'Auto-archive',
    remove_auto_archive: 'Remove auto-archive',
    mark_never_engage:   'Mark as noise',
    report_spam:         'Report spam',
  };
  return action ? (map[action] ?? action) : 'Deep clean';
}

// ── ActiveJobBanner — shown in the main page while a job is running ───────────

// 240 attempts × 3 s = 12 minutes max polling time before showing a stale warning.
const MAX_POLL_ATTEMPTS = 240;

export function ActiveJobBanner({ jobId, onComplete }: { jobId: string; onComplete: () => void }) {
  const [job, setJob] = useState<CleanupJob | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let attempts  = 0;

    async function poll() {
      while (!cancelled) {
        attempts++;
        if (attempts > MAX_POLL_ATTEMPTS) {
          setTimedOut(true);
          break;
        }
        const { job: data } = await getJob(jobId);
        if (!data || cancelled) break;
        setJob(data);
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
          if (data.status === 'completed') {
            const label = data.failed > 0
              ? `Done — ${data.succeeded} succeeded, ${data.failed} failed`
              : `Done — ${data.succeeded} sender${data.succeeded !== 1 ? 's' : ''} processed`;
            toast.success(label);
          } else if (data.status === 'failed') {
            toast.error(`Job failed: ${data.error_message ?? 'unknown error'}`);
          }
          onComplete();
          break;
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    poll();
    return () => { cancelled = true; };
  }, [jobId, onComplete]);

  if (!job || job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') return null;

  if (timedOut) {
    return (
      <div className="flex items-center gap-3 px-6 py-3 bg-amber-50 border-b border-amber-200 shrink-0">
        <Clock className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="text-sm text-amber-800 flex-1">
          Job is taking longer than expected — check back later.
        </span>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 h-7 text-xs"
          onClick={() => window.location.reload()}
        >
          Refresh
        </Button>
      </div>
    );
  }

  const pct = progressPercent(job);

  return (
    <div className="flex items-center gap-3 px-6 py-3 bg-primary/5 border-b border-primary/20 shrink-0">
      <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium">
            {actionLabel(job.action)} — {job.processed_senders} of {job.total_senders} senders
          </span>
          <span className="text-xs text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      {job.failed > 0 && (
        <span className="text-xs text-amber-600 shrink-0">{job.failed} failed</span>
      )}
    </div>
  );
}

// ── JobsPanel — full job history list ────────────────────────────────────────

export function JobsPanel() {
  const [jobs,    setJobs]    = useState<CleanupJob[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { jobs: data } = await getJobs();
    setJobs(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh while any job is active
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === 'pending' || j.status === 'running');
    if (!hasActive) return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [jobs, load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!jobs.length) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        <Zap className="w-8 h-8 mx-auto mb-3 opacity-30" />
        No cleanup jobs yet. Start a bulk action to see progress here.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {jobs.map((job) => {
        const pct    = progressPercent(job);
        const active = job.status === 'pending' || job.status === 'running';
        return (
          <li key={job.id} className="py-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                {job.status === 'running'   && <Loader2    className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />}
                {job.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                {job.status === 'failed'    && <XCircle    className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                {job.status === 'pending'   && <Clock      className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                {job.status === 'cancelled' && <XCircle    className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                <span className="text-sm font-medium">{actionLabel(job.action)}</span>
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full font-medium',
                  job.status === 'completed' ? 'bg-green-100 text-green-700'
                  : job.status === 'failed'  ? 'bg-red-100 text-red-700'
                  : job.status === 'running' ? 'bg-blue-100 text-blue-700'
                  : 'bg-muted text-muted-foreground',
                )}>
                  {jobStatusLabel(job.status)}
                </span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(job.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>

            {/* Progress bar for active jobs */}
            {active && (
              <div className="mb-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>{job.processed_senders} of {job.total_senders} senders</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}

            {/* Completion summary */}
            {job.status === 'completed' && (
              <p className="text-xs text-muted-foreground">
                {job.succeeded} succeeded{job.failed > 0 ? `, ${job.failed} failed` : ''}
                {job.total_senders > 0 ? ` across ${job.total_senders} sender${job.total_senders !== 1 ? 's' : ''}` : ''}
              </p>
            )}

            {/* Error */}
            {job.status === 'failed' && job.error_message && (
              <p className="text-xs text-red-600">{job.error_message}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
