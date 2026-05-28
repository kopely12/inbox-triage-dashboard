'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { useRouter }        from 'next/navigation';
import { toast }            from 'sonner';
import {
  RefreshCw, Inbox, Trash2, Archive, BellOff, Undo2,
  ChevronDown, AlertTriangle, CheckCircle2, Loader2,
  MailX, Filter, Download, Sparkles, TriangleAlert,
} from 'lucide-react';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button }   from '@/components/ui/button';
import { Badge }    from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  triggerRefresh, getEngagementStatus, executeBulkAction, type ActionResult,
} from '@/app/actions/engagement';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SenderRow = {
  id:                    string;
  sender_email:          string;
  sender_name:           string | null;
  sender_domain:         string | null;
  category:              string;
  emails_received:       number;
  emails_opened:         number;
  emails_starred:        number;
  emails_replied:        number;
  emails_deleted:        number;
  engagement_rate:       number;
  last_email_date:       string | null;
  has_unsubscribe_header: boolean;
  unsubscribe_status:    string | null;
  unsubscribed_at:       string | null;
  auto_archive_enabled:  boolean;
  auto_archive_filter_id: string | null;
  ignored:               boolean;
  period_days:           number;
  updated_at:            string | null;
};

export type Summary = {
  total_senders:         number;
  never_engage_count:    number;
  rarely_engage_count:   number;
  regular_count:         number;
  known_contact_count:   number;
  transactional_count:   number;
  total_emails_analyzed: number;
  total_noise_emails:    number;
  noise_percentage:      number;
  period_days:           number;
  last_refreshed:        string | null;
  refresh_status:        string;
};

interface Props {
  senders:       SenderRow[];
  summary:       Summary;
  refreshStatus: string;
  lastRefreshed: string | null;
  planTier:      string;
  queryError:    string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; color: string; bg: string }> = {
  never_engage:   { label: 'Never Open',    color: 'text-red-700',    bg: 'bg-red-100 text-red-700 border-red-200' },
  rarely_engage:  { label: 'Rarely Open',   color: 'text-amber-700',  bg: 'bg-amber-100 text-amber-700 border-amber-200' },
  regular:        { label: 'Regular',       color: 'text-blue-700',   bg: 'bg-blue-100 text-blue-700 border-blue-200' },
  known_contact:  { label: 'Known Contact', color: 'text-green-700',  bg: 'bg-green-100 text-green-700 border-green-200' },
  transactional:  { label: 'Transactional', color: 'text-gray-600',   bg: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const ACTION_META: Record<string, { label: string; description: string; destructive: boolean }> = {
  unsubscribe:         { label: 'Unsubscribe',           description: 'Send an unsubscribe request to this sender.',              destructive: false },
  bulk_delete:         { label: 'Delete All Emails',     description: 'Move all emails from this sender to trash.',               destructive: true  },
  auto_archive:        { label: 'Auto-archive',          description: 'New emails from this sender will skip your inbox.',        destructive: false },
  remove_auto_archive: { label: 'Remove Auto-archive',   description: 'Stop auto-archiving emails from this sender.',            destructive: false },
  resubscribe:         { label: 'Resubscribe',           description: 'Mark as resubscribed and clear auto-archive if active.',   destructive: false },
  ignore:              { label: 'Hide from Report',      description: 'Remove this sender from your inbox noise report.',         destructive: false },
  clean_never_engage:  { label: 'Clean Never Engage',    description: 'Unsubscribe + delete emails from all Never Open senders.', destructive: true  },
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelative(iso: string | null) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return formatDate(iso);
}

function engagementColor(rate: number) {
  if (rate < 0.05) return 'text-red-600';
  if (rate < 0.2)  return 'text-amber-600';
  return 'text-green-600';
}

// ── Category Badge ─────────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: string }) {
  const meta = CATEGORY_META[category] ?? { label: category, bg: 'bg-gray-100 text-gray-600 border-gray-200' };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', meta.bg)}>
      {meta.label}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true when a sender is still sending after being unsubscribed (7-day grace). */
function isStillReceiving(s: SenderRow): boolean {
  if (s.unsubscribe_status !== 'unsubscribed' || !s.unsubscribed_at || !s.last_email_date) return false;
  const gracePeriodMs = 7 * 24 * 60 * 60 * 1000;
  return new Date(s.last_email_date).getTime() > new Date(s.unsubscribed_at).getTime() + gracePeriodMs;
}

function exportSendersAsCSV(senders: SenderRow[]) {
  const headers = [
    'Sender Email', 'Sender Name', 'Category', 'Emails Received',
    'Emails Opened', 'Engagement %', 'Last Email', 'Unsubscribe Status',
    'Auto-archived', 'Has Unsubscribe Link',
  ];
  const rows = senders.map((s) => [
    s.sender_email,
    s.sender_name ?? '',
    CATEGORY_META[s.category]?.label ?? s.category,
    s.emails_received,
    s.emails_opened,
    `${Math.round((s.engagement_rate ?? 0) * 100)}%`,
    s.last_email_date ? new Date(s.last_email_date).toLocaleDateString() : '',
    s.unsubscribe_status ?? '',
    s.auto_archive_enabled ? 'Yes' : 'No',
    s.has_unsubscribe_header ? 'Yes' : 'No',
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `sender-intelligence-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Confirm Modal ──────────────────────────────────────────────────────────────

interface ConfirmState {
  action:          string;
  senders:         SenderRow[];
  deleteExisting?: boolean;
}

function ConfirmModal({
  state,
  isPending,
  onConfirm,
  onClose,
  onToggleDeleteExisting,
}: {
  state:                   ConfirmState;
  isPending:               boolean;
  onConfirm:               () => void;
  onClose:                 () => void;
  onToggleDeleteExisting?: (v: boolean) => void;
}) {
  const meta         = ACTION_META[state.action] ?? ACTION_META['ignore'];
  const totalEmails  = state.senders.reduce((s, r) => s + r.emails_received, 0);
  const senderCount  = state.senders.length;
  const plural       = senderCount > 1 ? 'senders' : 'sender';

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {meta.destructive && <AlertTriangle className="w-4 h-4 text-red-500" />}
            {meta.label}
          </DialogTitle>
          <DialogDescription>
            {state.action === 'bulk_delete' && (
              <>
                This will move approximately <strong>{totalEmails.toLocaleString()} emails</strong> from{' '}
                <strong>{senderCount} {plural}</strong> to your Gmail trash. You can restore them from trash
                within 30 days.
              </>
            )}
            {state.action === 'unsubscribe' && (
              <>
                Send an unsubscribe request to <strong>{senderCount} {plural}</strong>.
                We&apos;ll try the one-click HTTP method first, then send an email if needed.
              </>
            )}
            {state.action === 'auto_archive' && (
              <>
                New emails from <strong>{senderCount} {plural}</strong> will automatically skip
                your inbox. You can find them in All Mail. This creates a Gmail filter.
              </>
            )}
            {state.action === 'ignore' && (
              <>
                Hide <strong>{senderCount} {plural}</strong> from this report.
                Their emails will not be affected.
              </>
            )}
            {state.action === 'clean_never_engage' && (
              <>
                For <strong>{senderCount} Never Open {plural}</strong>: unsubscribe those with
                unsubscribe links, and optionally delete all their emails.
                This is the fastest way to clear inbox noise.
              </>
            )}
            {!['bulk_delete', 'unsubscribe', 'auto_archive', 'ignore', 'clean_never_engage'].includes(state.action) && (
              <>{meta.description} Applies to <strong>{senderCount} {plural}</strong>.</>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* "Also delete emails" checkbox — shown for unsubscribe actions */}
        {(state.action === 'unsubscribe' || state.action === 'clean_never_engage') && onToggleDeleteExisting && (
          <label className="flex items-center gap-2 text-sm cursor-pointer mt-1">
            <input
              type="checkbox"
              checked={state.deleteExisting ?? false}
              onChange={(e) => onToggleDeleteExisting(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span>Also move all existing emails from {senderCount > 1 ? 'these senders' : 'this sender'} to trash</span>
          </label>
        )}

        {/* Sender list (capped at 5) */}
        {senderCount <= 8 && (
          <ul className="mt-1 space-y-1 text-sm text-muted-foreground max-h-40 overflow-y-auto">
            {state.senders.map((s) => (
              <li key={s.sender_email} className="flex items-center justify-between gap-2">
                <span className="truncate">{s.sender_name || s.sender_email}</span>
                {s.sender_name && (
                  <span className="text-xs truncate text-muted-foreground shrink-0">{s.sender_email}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {senderCount > 8 && (
          <p className="text-sm text-muted-foreground">
            {state.senders.slice(0, 5).map((s) => s.sender_name || s.sender_email).join(', ')}
            {' '}and {senderCount - 5} more…
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            variant={meta.destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Category Tabs ──────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'all',              label: 'All' },
  { key: 'never_engage',     label: 'Never Open' },
  { key: 'rarely_engage',    label: 'Rarely Open' },
  { key: 'regular',          label: 'Regular' },
  { key: 'known_contact',    label: 'Known Contact' },
  { key: 'transactional',    label: 'Transactional' },
  { key: 'still_receiving',  label: 'Still Receiving' },
] as const;

// ── Main Component ─────────────────────────────────────────────────────────────

export function SenderIntelligenceClient({
  senders: initialSenders,
  summary,
  refreshStatus: initialRefreshStatus,
  lastRefreshed,
  planTier,
  queryError,
}: Props) {
  const router = useRouter();

  // Local state
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [selected,        setSelected]       = useState<Set<string>>(new Set());
  const [confirmState,    setConfirmState]   = useState<ConfirmState | null>(null);
  const [refreshStatus,   setRefreshStatus]  = useState(initialRefreshStatus);
  const [isPending,       startTransition]   = useTransition();
  const [isRefreshing,    setIsRefreshing]   = useState(false);
  const isFree = planTier === 'free';

  // ── Polling when running ─────────────────────────────────────────────────────

  useEffect(() => {
    if (refreshStatus !== 'running') return;
    const id = setInterval(async () => {
      const status = await getEngagementStatus();
      if (!status) return;
      if (status.refresh_status !== 'running') {
        setRefreshStatus(status.refresh_status);
        router.refresh();
      }
    }, 5_000);
    return () => clearInterval(id);
  }, [refreshStatus, router]);

  // ── Refresh trigger ──────────────────────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    const result = await triggerRefresh();
    setIsRefreshing(false);

    if (result.status === 'started') {
      setRefreshStatus('running');
      toast.success('Analysis started — this takes about 90 seconds.');
    } else if (result.status === 'already_running') {
      setRefreshStatus('running');
      toast.info('Analysis is already in progress.');
    } else if (result.status === 'already_fresh') {
      toast.info('Your data is already up to date.');
    } else {
      toast.error(result.error ?? 'Could not start analysis.');
    }
  }, []);

  // ── Filtered senders ─────────────────────────────────────────────────────────

  const filteredSenders = activeCategory === 'all'
    ? initialSenders
    : activeCategory === 'still_receiving'
      ? initialSenders.filter(isStillReceiving)
      : initialSenders.filter((s) => s.category === activeCategory);

  // ── Selection helpers ────────────────────────────────────────────────────────

  const allFilteredSelected =
    filteredSenders.length > 0 &&
    filteredSenders.every((s) => selected.has(s.sender_email));

  function toggleAll() {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredSenders.forEach((s) => next.delete(s.sender_email));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredSenders.forEach((s) => next.add(s.sender_email));
        return next;
      });
    }
  }

  function toggleRow(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  // ── Execute action ───────────────────────────────────────────────────────────

  function openConfirm(action: string, targetSenders: SenderRow[], deleteExisting = false) {
    if (isFree && targetSenders.length > 1) {
      toast.error('Bulk actions require a Pro plan. Select one sender at a time on the free plan.');
      return;
    }
    const needsConfirm = ['bulk_delete', 'unsubscribe', 'auto_archive', 'ignore', 'clean_never_engage'].includes(action);
    if (needsConfirm) {
      setConfirmState({ action, senders: targetSenders, deleteExisting });
    } else {
      executeAction(action, targetSenders, deleteExisting);
    }
  }

  function openCleanNeverEngage() {
    const neverSenders = initialSenders.filter((s) => s.category === 'never_engage');
    if (neverSenders.length === 0) {
      toast.info('No Never Open senders to clean up.');
      return;
    }
    if (isFree && neverSenders.length > 1) {
      toast.error('Bulk actions require a Pro plan.', {
        action: { label: 'Upgrade', onClick: () => router.push('/billing') },
      });
      return;
    }
    setConfirmState({ action: 'clean_never_engage', senders: neverSenders, deleteExisting: true });
  }

  function executeAction(action: string, targetSenders: SenderRow[], deleteExisting = false) {
    startTransition(async () => {
      let succeeded = 0, failed = 0;

      if (action === 'clean_never_engage') {
        // Two sequential calls: unsubscribe those with headers, delete emails from all
        const withHeaders    = targetSenders.filter((s) => s.has_unsubscribe_header);
        const withoutHeaders = targetSenders.filter((s) => !s.has_unsubscribe_header);

        if (withHeaders.length > 0) {
          const r = await executeBulkAction('unsubscribe', withHeaders.map((s) => s.sender_email), true);
          if (r.error && r.upgrade) {
            toast.error(r.error, { action: { label: 'Upgrade', onClick: () => router.push('/billing') } });
            return;
          }
          succeeded += r.succeeded; failed += r.failed;
        }
        if (withoutHeaders.length > 0) {
          const r = await executeBulkAction('bulk_delete', withoutHeaders.map((s) => s.sender_email), false);
          succeeded += r.succeeded; failed += r.failed;
        }
      } else {
        const emails = targetSenders.map((s) => s.sender_email);
        const result = await executeBulkAction(action, emails, deleteExisting);

        if (result.error) {
          if (result.upgrade) {
            toast.error(result.error, { action: { label: 'Upgrade', onClick: () => router.push('/billing') } });
          } else {
            toast.error(result.error);
          }
          return;
        }
        succeeded = result.succeeded; failed = result.failed;
      }

      setSelected(new Set());
      setConfirmState(null);

      const msg = succeeded > 0
        ? `Done — ${succeeded} sender${succeeded > 1 ? 's' : ''} updated.`
        : 'No changes made.';
      if (failed > 0) toast.warning(`${msg} ${failed} failed.`);
      else toast.success(msg);

      router.refresh();
    });
  }

  // ── Count for each category tab ──────────────────────────────────────────────

  function categoryCount(key: string) {
    if (key === 'all')             return initialSenders.length;
    if (key === 'still_receiving') return initialSenders.filter(isStillReceiving).length;
    return initialSenders.filter((s) => s.category === key).length;
  }

  // ── Selected senders list ────────────────────────────────────────────────────

  const selectedSenders = initialSenders.filter((s) => selected.has(s.sender_email));

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Never-initialized empty state ────────────────────────────────────────────
  if (refreshStatus === 'never' && initialSenders.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center max-w-sm px-4">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Inbox className="w-8 h-8 text-primary" />
              </div>
            </div>
            <h2 className="text-lg font-semibold mb-2">Discover your inbox noise</h2>
            <p className="text-muted-foreground text-sm mb-6">
              Analyze the last {summary.period_days} days of email to see which senders you
              actually engage with — and which ones are just noise. Takes about 90 seconds.
            </p>
            <Button onClick={handleRefresh} disabled={isRefreshing} size="lg">
              {isRefreshing
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting…</>
                : <><Inbox className="w-4 h-4 mr-2" /> Analyze Inbox Noise</>
              }
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Initializing / running state (first run, no data yet) ────────────────────
  if (refreshStatus === 'running' && initialSenders.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center max-w-sm px-4">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            </div>
            <h2 className="text-lg font-semibold mb-2">Analyzing your inbox…</h2>
            <p className="text-muted-foreground text-sm">
              We&apos;re scanning the last {summary.period_days} days of email.
              This usually takes about 90 seconds. The page will update automatically.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-xl font-semibold">Sender Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Inbox noise analysis for the last {summary.period_days} days
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh status */}
          {refreshStatus === 'running' && (
            <span className="flex items-center gap-1.5 text-sm text-amber-600">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Analyzing…
            </span>
          )}
          {refreshStatus === 'completed' && lastRefreshed && (
            <span className="text-xs text-muted-foreground mr-1">
              Updated {formatRelative(lastRefreshed)}
            </span>
          )}

          {/* CSV export */}
          {initialSenders.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => exportSendersAsCSV(filteredSenders)}
              title="Export current view as CSV"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export
            </Button>
          )}

          {/* Clean Never Engage */}
          {summary.never_engage_count > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={openCleanNeverEngage}
              disabled={isPending}
              className="border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Clean Never Engage
            </Button>
          )}

          {/* Refresh button */}
          {isFree && refreshStatus === 'completed' ? (
            <Button variant="outline" size="sm" onClick={() => router.push('/billing')}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Refresh
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">Pro</Badge>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing || refreshStatus === 'running'}
            >
              <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', (isRefreshing || refreshStatus === 'running') && 'animate-spin')} />
              Refresh
            </Button>
          )}
        </div>
      </div>

      {/* ── Running banner (when data exists but a refresh is in progress) ──── */}
      {refreshStatus === 'running' && initialSenders.length > 0 && (
        <div className="flex items-center gap-2 px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm shrink-0">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          Refresh in progress — results below are from your last analysis. Page will update automatically.
        </div>
      )}

      {/* ── Error banner ────────────────────────────────────────────────────── */}
      {queryError && (
        <div className="flex items-center gap-2 px-6 py-2.5 bg-red-50 border-b border-red-200 text-red-800 text-sm shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Failed to load sender data: {queryError}
        </div>
      )}

      {/* ── Summary cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 py-4 shrink-0">
        <StatCard
          title="Total Senders"
          value={summary.total_senders.toLocaleString()}
          sub={`last ${summary.period_days} days`}
        />
        <StatCard
          title="Noise Emails"
          value={`${summary.noise_percentage}%`}
          sub={`${summary.total_noise_emails.toLocaleString()} of ${summary.total_emails_analyzed.toLocaleString()} emails`}
          valueClass={summary.noise_percentage >= 50 ? 'text-red-600' : summary.noise_percentage >= 25 ? 'text-amber-600' : 'text-foreground'}
        />
        <StatCard
          title="Never Open"
          value={summary.never_engage_count.toLocaleString()}
          sub="senders you ignore"
          valueClass={summary.never_engage_count > 0 ? 'text-red-600' : 'text-foreground'}
        />
        <StatCard
          title="Rarely Open"
          value={summary.rarely_engage_count.toLocaleString()}
          sub="low-engagement senders"
          valueClass={summary.rarely_engage_count > 0 ? 'text-amber-600' : 'text-foreground'}
        />
      </div>

      {/* ── Category tabs ───────────────────────────────────────────────────── */}
      <div className="flex gap-1 px-6 pb-3 overflow-x-auto shrink-0">
        {CATEGORIES.map(({ key, label }) => {
          const count  = categoryCount(key);
          const active = activeCategory === key;
          return (
            <button
              key={key}
              onClick={() => { setActiveCategory(key); setSelected(new Set()); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {label}
              <span className={cn(
                'text-xs px-1.5 py-0.5 rounded-full',
                active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground',
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Bulk action bar ─────────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-6 py-2.5 bg-primary/5 border-y border-primary/20 shrink-0">
          <span className="text-sm font-medium text-primary">
            {selected.size} sender{selected.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => openConfirm('unsubscribe', selectedSenders.filter((s) => s.has_unsubscribe_header))}
              disabled={isPending || !selectedSenders.some((s) => s.has_unsubscribe_header)}
            >
              <MailX className="w-3.5 h-3.5 mr-1.5" />
              Unsubscribe
              {isFree && selected.size > 1 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">Pro</Badge>}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openConfirm('auto_archive', selectedSenders.filter((s) => !s.auto_archive_enabled))}
              disabled={isPending || !selectedSenders.some((s) => !s.auto_archive_enabled)}
            >
              <Archive className="w-3.5 h-3.5 mr-1.5" />
              Auto-archive
              {isFree && selected.size > 1 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">Pro</Badge>}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openConfirm('ignore', selectedSenders)}
              disabled={isPending}
            >
              <BellOff className="w-3.5 h-3.5 mr-1.5" />
              Hide
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => openConfirm('bulk_delete', selectedSenders)}
              disabled={isPending}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete Emails
              {isFree && selected.size > 1 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">Pro</Badge>}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* ── Sender table ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card border-b border-border">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAll}
                  className="rounded border-gray-300 cursor-pointer"
                  title="Select all"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Sender</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Category</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground hidden lg:table-cell">Emails</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground hidden lg:table-cell">Engagement</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden xl:table-cell">Last Email</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden xl:table-cell">Status</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredSenders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-muted-foreground text-sm">
                  No senders in this category.
                </td>
              </tr>
            ) : (
              filteredSenders.map((sender) => (
                <SenderTableRow
                  key={sender.sender_email}
                  sender={sender}
                  isSelected={selected.has(sender.sender_email)}
                  onToggle={() => toggleRow(sender.sender_email)}
                  onAction={(action) => openConfirm(action, [sender])}
                  isPending={isPending}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Confirmation modal ───────────────────────────────────────────────── */}
      {confirmState && (
        <ConfirmModal
          state={confirmState}
          isPending={isPending}
          onConfirm={() => executeAction(confirmState.action, confirmState.senders, confirmState.deleteExisting ?? false)}
          onClose={() => setConfirmState(null)}
          onToggleDeleteExisting={(v) => setConfirmState((prev) => prev ? { ...prev, deleteExisting: v } : prev)}
        />
      )}
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({
  title, value, sub, valueClass,
}: {
  title:       string;
  value:       string;
  sub:         string;
  valueClass?: string;
}) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 px-4">
        <div className={cn('text-2xl font-bold', valueClass)}>{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
      </CardContent>
    </Card>
  );
}

// ── PageHeader (used by empty states) ─────────────────────────────────────────

function PageHeader() {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
      <div>
        <h1 className="text-xl font-semibold">Sender Intelligence</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Understand and reduce inbox noise</p>
      </div>
    </div>
  );
}

// ── SenderTableRow ─────────────────────────────────────────────────────────────

function SenderTableRow({
  sender,
  isSelected,
  onToggle,
  onAction,
  isPending,
}: {
  sender:     SenderRow;
  isSelected: boolean;
  onToggle:   () => void;
  onAction:   (action: string) => void;
  isPending:  boolean;
}) {
  const engRate = Math.round((sender.engagement_rate ?? 0) * 100);

  return (
    <tr className={cn('hover:bg-muted/30 transition-colors', isSelected && 'bg-primary/5')}>
      {/* Checkbox */}
      <td className="px-4 py-3 w-10">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          className="rounded border-gray-300 cursor-pointer"
        />
      </td>

      {/* Sender */}
      <td className="px-4 py-3 max-w-xs">
        <div className="flex flex-col">
          <span className="font-medium truncate">
            {sender.sender_name || sender.sender_email}
          </span>
          {sender.sender_name && (
            <span className="text-xs text-muted-foreground truncate">{sender.sender_email}</span>
          )}
        </div>
        {/* Mobile-only: show category inline */}
        <div className="mt-1 md:hidden">
          <CategoryBadge category={sender.category} />
        </div>
      </td>

      {/* Category */}
      <td className="px-4 py-3 hidden md:table-cell">
        <CategoryBadge category={sender.category} />
      </td>

      {/* Emails */}
      <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">
        {sender.emails_received.toLocaleString()}
      </td>

      {/* Engagement */}
      <td className="px-4 py-3 text-right hidden lg:table-cell">
        <span className={cn('font-medium tabular-nums', engagementColor(sender.engagement_rate ?? 0))}>
          {engRate}%
        </span>
      </td>

      {/* Last Email */}
      <td className="px-4 py-3 text-muted-foreground hidden xl:table-cell">
        {formatDate(sender.last_email_date)}
      </td>

      {/* Status badges */}
      <td className="px-4 py-3 hidden xl:table-cell">
        <div className="flex items-center gap-1 flex-wrap">
          {sender.unsubscribe_status === 'unsubscribed' && !isStillReceiving(sender) && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 border border-green-200">
              <CheckCircle2 className="w-3 h-3" />
              Unsubscribed
            </span>
          )}
          {isStillReceiving(sender) && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700 border border-orange-200" title="Still receiving emails despite unsubscribing — consider marking as spam">
              <TriangleAlert className="w-3 h-3" />
              Still receiving
            </span>
          )}
          {sender.auto_archive_enabled && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 border border-blue-200">
              <Archive className="w-3 h-3" />
              Auto-archived
            </span>
          )}
        </div>
      </td>

      {/* Actions dropdown */}
      <td className="px-4 py-3 w-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={isPending}>
              <ChevronDown className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {/* Unsubscribe */}
            {sender.has_unsubscribe_header && sender.unsubscribe_status !== 'unsubscribed' && (
              <DropdownMenuItem onClick={() => onAction('unsubscribe')}>
                <MailX className="w-3.5 h-3.5 mr-2" />
                Unsubscribe
              </DropdownMenuItem>
            )}

            {/* Resubscribe */}
            {sender.unsubscribe_status === 'unsubscribed' && (
              <DropdownMenuItem onClick={() => onAction('resubscribe')}>
                <Undo2 className="w-3.5 h-3.5 mr-2" />
                Resubscribe
              </DropdownMenuItem>
            )}

            {/* Auto-archive / remove */}
            {!sender.auto_archive_enabled && (
              <DropdownMenuItem onClick={() => onAction('auto_archive')}>
                <Archive className="w-3.5 h-3.5 mr-2" />
                Auto-archive
              </DropdownMenuItem>
            )}
            {sender.auto_archive_enabled && (
              <DropdownMenuItem onClick={() => onAction('remove_auto_archive')}>
                <Filter className="w-3.5 h-3.5 mr-2" />
                Remove Auto-archive
              </DropdownMenuItem>
            )}

            {/* Ignore */}
            <DropdownMenuItem onClick={() => onAction('ignore')}>
              <BellOff className="w-3.5 h-3.5 mr-2" />
              Hide from Report
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Bulk delete */}
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onClick={() => onAction('bulk_delete')}
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              Delete All Emails
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}
