'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { useRouter }        from 'next/navigation';
import { toast }            from 'sonner';
import {
  RefreshCw, Inbox, Trash2, Archive, BellOff, Undo2,
  ChevronDown, AlertTriangle, CheckCircle2, Loader2,
  MailX, Filter, Download, Sparkles, TriangleAlert,
  Layers, Eye, History, X, RotateCcw,
  HardDrive, Zap, Shield, ListChecks,
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
  triggerRefresh, getEngagementStatus, executeBulkAction,
  getActionHistory, undoAction, getSenderPreview,
  type ActionResult, type ActionHistoryItem, type SenderPreview,
  type CleanupJob,
} from '@/app/actions/engagement';
import { StorageTab }     from './storage-tab';
import { DeepCleanPanel } from './deep-clean-panel';
import { ScreenerTab }    from './screener-tab';
import { ActiveJobBanner, JobsPanel } from './jobs-panel';

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
  unsubscribe:         { label: 'Unsubscribe',           description: 'Send an unsubscribe request to this sender.',                                 destructive: false },
  bulk_delete:         { label: 'Delete All Emails',     description: 'Move all emails from this sender to trash.',                                  destructive: true  },
  auto_archive:        { label: 'Auto-archive',          description: 'New emails from this sender will skip your inbox.',                           destructive: false },
  remove_auto_archive: { label: 'Remove Auto-archive',   description: 'Stop auto-archiving emails from this sender.',                               destructive: false },
  resubscribe:         { label: 'Resubscribe',           description: 'Mark as resubscribed and clear auto-archive if active.',                     destructive: false },
  ignore:              { label: 'Hide from Report',      description: 'Remove this sender from your inbox noise report.',                            destructive: false },
  clean_never_engage:  { label: 'Clean Never Engage',    description: 'Unsubscribe + delete emails from all Never Open senders.',                   destructive: true  },
  report_spam:         { label: 'Report as Spam',        description: 'Move all emails to spam. Use when sender ignores your unsubscribe request.',  destructive: true  },
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

// ── Domain grouping helpers ───────────────────────────────────────────────────

type DomainGroup = {
  domain:        string;
  senders:       SenderRow[];
  totalEmails:   number;
  maxEngagement: number;
  category:      string; // worst category in group
  hasTransactional: boolean;
};

const CATEGORY_SEVERITY: Record<string, number> = {
  never_engage: 0, rarely_engage: 1, regular: 2, transactional: 3, known_contact: 4,
};

function groupByDomain(senders: SenderRow[]): DomainGroup[] {
  const map = new Map<string, SenderRow[]>();
  for (const s of senders) {
    const domain = s.sender_domain || s.sender_email.split('@')[1] || s.sender_email;
    if (!map.has(domain)) map.set(domain, []);
    map.get(domain)!.push(s);
  }
  return Array.from(map.entries()).map(([domain, group]) => {
    const worst = group.reduce((best, s) => {
      const sev = CATEGORY_SEVERITY[s.category] ?? 2;
      return sev < (CATEGORY_SEVERITY[best] ?? 2) ? s.category : best;
    }, group[0].category);
    return {
      domain,
      senders:        group,
      totalEmails:    group.reduce((n, s) => n + s.emails_received, 0),
      maxEngagement:  Math.max(...group.map((s) => s.engagement_rate ?? 0)),
      category:       worst,
      hasTransactional: group.some((s) => s.category === 'transactional'),
    };
  }).sort((a, b) => b.totalEmails - a.totalEmails);
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
  // null = delete all; number = only emails older than N days
  olderThanDays?:  number | null;
}

function ConfirmModal({
  state,
  isPending,
  onConfirm,
  onClose,
  onToggleDeleteExisting,
  onChangeOlderThanDays,
}: {
  state:                    ConfirmState;
  isPending:                boolean;
  onConfirm:                () => void;
  onClose:                  () => void;
  onToggleDeleteExisting?:  (v: boolean) => void;
  onChangeOlderThanDays?:   (v: number | null) => void;
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
            {state.action === 'report_spam' && (
              <>
                Move all emails from <strong>{senderCount} {plural}</strong> to spam.
                Use this when a sender continues emailing after you unsubscribed.
                This is stronger than unsubscribing — Gmail will learn to block their emails.
              </>
            )}
            {!['bulk_delete', 'unsubscribe', 'auto_archive', 'ignore', 'clean_never_engage', 'report_spam'].includes(state.action) && (
              <>{meta.description} Applies to <strong>{senderCount} {plural}</strong>.</>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* "Also delete emails" checkbox — shown for unsubscribe actions */}
        {(state.action === 'unsubscribe') && onToggleDeleteExisting && (
          <label className="flex items-center gap-2 text-sm cursor-pointer mt-1">
            <input
              type="checkbox"
              checked={state.deleteExisting ?? false}
              onChange={(e) => onToggleDeleteExisting(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span>Also move existing emails from {senderCount > 1 ? 'these senders' : 'this sender'} to trash</span>
          </label>
        )}

        {/* Delete scope — shown for bulk_delete, clean_never_engage, or unsubscribe+deleteExisting */}
        {onChangeOlderThanDays && (
          (state.action === 'bulk_delete' ||
           state.action === 'clean_never_engage' ||
           (state.action === 'unsubscribe' && state.deleteExisting))
        ) && (
          <div className="mt-3 space-y-2">
            <p className="text-sm font-medium">Which emails to delete:</p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="delete-scope"
                checked={state.olderThanDays !== null && state.olderThanDays !== undefined}
                onChange={() => onChangeOlderThanDays(state.olderThanDays ?? 90)}
                className="text-primary"
              />
              <span>Older than</span>
              <input
                type="number"
                min={1}
                max={3650}
                value={state.olderThanDays ?? 90}
                onChange={(e) => onChangeOlderThanDays(Math.max(1, parseInt(e.target.value) || 90))}
                onClick={() => onChangeOlderThanDays(state.olderThanDays ?? 90)}
                className="w-16 px-2 py-0.5 text-sm border border-border rounded text-center"
              />
              <span>days <span className="text-muted-foreground">(recommended)</span></span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="delete-scope"
                checked={state.olderThanDays === null}
                onChange={() => onChangeOlderThanDays(null)}
                className="text-primary"
              />
              <span>All emails from {senderCount > 1 ? 'these senders' : 'this sender'}</span>
            </label>
          </div>
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

  // Top-level navigation
  const [activeTab, setActiveTab] = useState<'senders' | 'storage' | 'deep_clean' | 'screener' | 'jobs'>('senders');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Local state
  const [activeCategory,  setActiveCategory]  = useState<string>('all');
  const [selected,         setSelected]        = useState<Set<string>>(new Set());
  const [confirmState,     setConfirmState]    = useState<ConfirmState | null>(null);
  const [refreshStatus,    setRefreshStatus]   = useState(initialRefreshStatus);
  const [isPending,        startTransition]    = useTransition();
  const [isRefreshing,     setIsRefreshing]    = useState(false);
  const [groupByDomainOn,  setGroupByDomainOn] = useState(false);
  const [expandedDomains,  setExpandedDomains] = useState<Set<string>>(new Set());
  const [showHistory,      setShowHistory]     = useState(false);
  const [history,          setHistory]         = useState<ActionHistoryItem[]>([]);
  const [historyLoading,   setHistoryLoading]  = useState(false);
  const [previewSender,    setPreviewSender]   = useState<SenderRow | null>(null);
  const [previewData,      setPreviewData]     = useState<SenderPreview | null>(null);
  const [previewLoading,   setPreviewLoading]  = useState(false);
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

  // ── History loader ───────────────────────────────────────────────────────────

  const handleOpenHistory = useCallback(async () => {
    setShowHistory(true);
    setHistoryLoading(true);
    const { actions } = await getActionHistory();
    setHistory(actions);
    setHistoryLoading(false);
  }, []);

  const handleUndo = useCallback(async (actionId: string) => {
    const result = await undoAction(actionId);
    if (result.success) {
      toast.success('Action undone.');
      setHistory((prev) => prev.map((a) => a.id === actionId ? { ...a, status: 'undone' } : a));
      router.refresh();
    } else {
      toast.error(result.error ?? 'Could not undo this action.');
    }
  }, [router]);

  // ── Preview loader ────────────────────────────────────────────────────────────

  const handleOpenPreview = useCallback(async (sender: SenderRow) => {
    setPreviewSender(sender);
    setPreviewData(null);
    setPreviewLoading(true);
    const { preview } = await getSenderPreview(sender.sender_email);
    setPreviewData(preview);
    setPreviewLoading(false);
  }, []);

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
    // Default olderThanDays to 90 for any delete action
    const defaultOlderThan = ['bulk_delete'].includes(action) ? 90 : null;
    if (needsConfirm) {
      setConfirmState({ action, senders: targetSenders, deleteExisting, olderThanDays: defaultOlderThan });
    } else {
      executeAction(action, targetSenders, deleteExisting, null);
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
    setConfirmState({ action: 'clean_never_engage', senders: neverSenders, deleteExisting: true, olderThanDays: 90 });
  }

  function executeAction(action: string, targetSenders: SenderRow[], deleteExisting = false, olderThanDays: number | null = null) {
    startTransition(async () => {
      let succeeded = 0, failed = 0;

      if (action === 'clean_never_engage') {
        // Two sequential calls: unsubscribe those with headers (+delete), delete rest
        const withHeaders    = targetSenders.filter((s) => s.has_unsubscribe_header);
        const withoutHeaders = targetSenders.filter((s) => !s.has_unsubscribe_header);

        if (withHeaders.length > 0) {
          const r = await executeBulkAction('unsubscribe', withHeaders.map((s) => s.sender_email), true, olderThanDays);
          if (r.error && r.upgrade) {
            toast.error(r.error, { action: { label: 'Upgrade', onClick: () => router.push('/billing') } });
            return;
          }
          succeeded += r.succeeded; failed += r.failed;
        }
        if (withoutHeaders.length > 0) {
          const r = await executeBulkAction('bulk_delete', withoutHeaders.map((s) => s.sender_email), false, olderThanDays);
          succeeded += r.succeeded; failed += r.failed;
        }
      } else {
        const emails = targetSenders.map((s) => s.sender_email);
        const result = await executeBulkAction(action, emails, deleteExisting, olderThanDays);

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

  // ── Top-level tab definitions ────────────────────────────────────────────────

  const TOP_TABS = [
    { key: 'senders'    as const, label: 'Senders',    icon: Inbox      },
    { key: 'storage'    as const, label: 'Storage',    icon: HardDrive  },
    { key: 'deep_clean' as const, label: 'Deep Clean', icon: Zap        },
    { key: 'screener'   as const, label: 'Screener',   icon: Shield     },
    { key: 'jobs'       as const, label: 'Jobs',       icon: ListChecks },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-xl font-semibold">Sender Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Inbox noise analysis for the last {summary.period_days} days
          </p>
        </div>

        {/* Right-side controls — only shown on the Senders tab */}
        {activeTab === 'senders' && (
          <div className="flex items-center gap-2">
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
            <Button variant="ghost" size="sm" onClick={handleOpenHistory} title="View action history">
              <History className="w-3.5 h-3.5 mr-1.5" />
              History
            </Button>
            {initialSenders.length > 0 && (
              <Button
                variant={groupByDomainOn ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setGroupByDomainOn((v) => !v)}
                title="Group senders by domain"
              >
                <Layers className="w-3.5 h-3.5 mr-1.5" />
                {groupByDomainOn ? 'Ungroup' : 'Group by domain'}
              </Button>
            )}
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
        )}
      </div>

      {/* ── Active job banner (shown on all tabs when a job is running) ──────── */}
      {activeJobId && (
        <ActiveJobBanner
          jobId={activeJobId}
          onComplete={() => setActiveJobId(null)}
        />
      )}

      {/* ── Top-level tab bar ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-6 pt-3 pb-0 border-b border-border shrink-0 overflow-x-auto">
        {TOP_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px',
              activeTab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab panels ──────────────────────────────────────────────────────── */}

      {/* Storage */}
      {activeTab === 'storage' && (
        <StorageTab
          onDeleteSender={(email) => {
            const sender = initialSenders.find((s) => s.sender_email === email);
            if (sender) openConfirm('bulk_delete', [sender]);
          }}
        />
      )}

      {/* Deep Clean */}
      {activeTab === 'deep_clean' && (
        <DeepCleanPanel
          onJobCreated={(job: CleanupJob) => {
            setActiveJobId(job.id);
            setActiveTab('jobs');
          }}
        />
      )}

      {/* Screener */}
      {activeTab === 'screener' && <ScreenerTab />}

      {/* Jobs */}
      {activeTab === 'jobs' && (
        <div className="flex-1 overflow-auto px-6 py-6">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-2 mb-6">
              <ListChecks className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Cleanup Jobs</h2>
            </div>
            <JobsPanel />
          </div>
        </div>
      )}

      {/* Senders (default) */}
      {activeTab === 'senders' && (
        <>
          {/* Running banner */}
          {refreshStatus === 'running' && initialSenders.length > 0 && (
            <div className="flex items-center gap-2 px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm shrink-0">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              Refresh in progress — results below are from your last analysis. Page will update automatically.
            </div>
          )}

          {/* Error banner */}
          {queryError && (
            <div className="flex items-center gap-2 px-6 py-2.5 bg-red-50 border-b border-red-200 text-red-800 text-sm shrink-0">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Failed to load sender data: {queryError}
            </div>
          )}

          {/* Summary cards */}
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

          {/* Category tabs */}
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

          {/* Bulk action bar */}
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
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Sender table */}
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
                ) : groupByDomainOn ? (
                  groupByDomain(filteredSenders).map((group) => (
                    <DomainGroupRow
                      key={group.domain}
                      group={group}
                      isExpanded={expandedDomains.has(group.domain)}
                      onToggleExpand={() => setExpandedDomains((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.domain)) next.delete(group.domain);
                        else next.add(group.domain);
                        return next;
                      })}
                      selected={selected}
                      onToggleRow={toggleRow}
                      onAction={(action, senders) => openConfirm(action, senders)}
                      onPreview={(sender) => handleOpenPreview(sender)}
                      isPending={isPending}
                    />
                  ))
                ) : (
                  filteredSenders.map((sender) => (
                    <SenderTableRow
                      key={sender.sender_email}
                      sender={sender}
                      isSelected={selected.has(sender.sender_email)}
                      onToggle={() => toggleRow(sender.sender_email)}
                      onAction={(action) => openConfirm(action, [sender])}
                      onPreview={() => handleOpenPreview(sender)}
                      isPending={isPending}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Confirmation modal */}
          {confirmState && (
            <ConfirmModal
              state={confirmState}
              isPending={isPending}
              onConfirm={() => executeAction(
                confirmState.action,
                confirmState.senders,
                confirmState.deleteExisting ?? false,
                confirmState.olderThanDays ?? null,
              )}
              onClose={() => setConfirmState(null)}
              onToggleDeleteExisting={(v) => setConfirmState((prev) =>
                prev ? { ...prev, deleteExisting: v, olderThanDays: v ? (prev.olderThanDays ?? 90) : null } : prev
              )}
              onChangeOlderThanDays={(v) => setConfirmState((prev) => prev ? { ...prev, olderThanDays: v } : prev)}
            />
          )}

          {/* History modal */}
          {showHistory && (
            <HistoryModal
              history={history}
              loading={historyLoading}
              onUndo={handleUndo}
              onClose={() => setShowHistory(false)}
            />
          )}

          {/* Preview modal */}
          {previewSender && (
            <PreviewModal
              sender={previewSender}
              preview={previewData}
              loading={previewLoading}
              onAction={(action) => {
                setPreviewSender(null);
                openConfirm(action, [previewSender]);
              }}
              onClose={() => { setPreviewSender(null); setPreviewData(null); }}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── DomainGroupRow ────────────────────────────────────────────────────────────

function DomainGroupRow({
  group, isExpanded, onToggleExpand, selected, onToggleRow, onAction, onPreview, isPending,
}: {
  group:           DomainGroup;
  isExpanded:      boolean;
  onToggleExpand:  () => void;
  selected:        Set<string>;
  onToggleRow:     (email: string) => void;
  onAction:        (action: string, senders: SenderRow[]) => void;
  onPreview:       (sender: SenderRow) => void;
  isPending:       boolean;
}) {
  const allSelected    = group.senders.every((s) => selected.has(s.sender_email));
  const nonTransact    = group.senders.filter((s) => s.category !== 'transactional');
  const categoryMeta   = CATEGORY_META[group.category] ?? { label: group.category, bg: 'bg-gray-100 text-gray-600 border-gray-200' };

  return (
    <>
      {/* Domain summary row */}
      <tr className={cn('hover:bg-muted/30 transition-colors bg-muted/10', isExpanded && 'bg-primary/5')}>
        <td className="px-4 py-3 w-10">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => {
              // Select/deselect all non-transactional senders in the group
              const emails = nonTransact.map((s) => s.sender_email);
              emails.forEach((e) => onToggleRow(e));
            }}
            className="rounded border-gray-300 cursor-pointer"
            title="Select all non-transactional senders"
          />
        </td>
        <td className="px-4 py-3 max-w-xs" onClick={onToggleExpand} style={{ cursor: 'pointer' }}>
          <div className="flex items-center gap-2">
            <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0', isExpanded && 'rotate-180')} />
            <div>
              <span className="font-semibold">{group.domain}</span>
              <span className="text-xs text-muted-foreground ml-2">
                {group.senders.length} address{group.senders.length !== 1 ? 'es' : ''}
              </span>
              {group.hasTransactional && (
                <span className="ml-2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded" title="Contains transactional addresses (receipts, orders) — excluded from bulk actions">
                  ⚠ has transactional
                </span>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 hidden md:table-cell">
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', categoryMeta.bg)}>
            {categoryMeta.label}
          </span>
        </td>
        <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell font-medium">
          {group.totalEmails.toLocaleString()}
        </td>
        <td className="px-4 py-3 text-right hidden lg:table-cell">
          <span className={cn('font-medium tabular-nums', engagementColor(group.maxEngagement))}>
            {Math.round(group.maxEngagement * 100)}%
          </span>
        </td>
        <td className="hidden xl:table-cell" />
        <td className="hidden xl:table-cell" />
        {/* Bulk action for the whole domain (non-transactional only) */}
        <td className="px-4 py-3 w-20">
          {nonTransact.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={isPending}>
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {nonTransact.some((s) => s.has_unsubscribe_header && s.unsubscribe_status !== 'unsubscribed') && (
                  <DropdownMenuItem onClick={() => onAction('unsubscribe', nonTransact.filter((s) => s.has_unsubscribe_header && s.unsubscribe_status !== 'unsubscribed'))}>
                    <MailX className="w-3.5 h-3.5 mr-2" />
                    Unsubscribe domain
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onAction('auto_archive', nonTransact.filter((s) => !s.auto_archive_enabled))}>
                  <Archive className="w-3.5 h-3.5 mr-2" />
                  Auto-archive domain
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onClick={() => onAction('bulk_delete', nonTransact)}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Delete (non-transactional)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </td>
      </tr>

      {/* Expanded: individual sender rows */}
      {isExpanded && group.senders.map((sender) => (
        <tr key={sender.sender_email} className={cn('hover:bg-muted/20 transition-colors border-l-2 border-primary/20', selected.has(sender.sender_email) && 'bg-primary/5')}>
          <td className="px-4 py-2.5 w-10 pl-8">
            <input
              type="checkbox"
              checked={selected.has(sender.sender_email)}
              onChange={() => onToggleRow(sender.sender_email)}
              className="rounded border-gray-300 cursor-pointer"
            />
          </td>
          <td className="px-4 py-2.5 max-w-xs pl-10">
            <div className="flex flex-col">
              <span className="text-sm truncate">{sender.sender_name || sender.sender_email}</span>
              {sender.sender_name && <span className="text-xs text-muted-foreground truncate">{sender.sender_email}</span>}
            </div>
          </td>
          <td className="px-4 py-2.5 hidden md:table-cell">
            <CategoryBadge category={sender.category} />
            {sender.category === 'transactional' && (
              <span className="ml-1 text-xs text-muted-foreground" title="Protected from bulk actions">🔒</span>
            )}
          </td>
          <td className="px-4 py-2.5 text-right tabular-nums text-sm hidden lg:table-cell">
            {sender.emails_received.toLocaleString()}
          </td>
          <td className="px-4 py-2.5 text-right hidden lg:table-cell">
            <span className={cn('text-sm font-medium tabular-nums', engagementColor(sender.engagement_rate ?? 0))}>
              {Math.round((sender.engagement_rate ?? 0) * 100)}%
            </span>
          </td>
          <td className="px-4 py-2.5 text-muted-foreground text-sm hidden xl:table-cell">
            {formatDate(sender.last_email_date)}
          </td>
          <td className="hidden xl:table-cell" />
          <td className="px-4 py-2.5 w-20">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost" size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => onPreview(sender)}
                title="Preview latest email"
              >
                <Eye className="w-3 h-3" />
              </Button>
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

// ── HistoryModal ──────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  unsubscribe:          'Unsubscribed',
  bulk_delete:          'Deleted emails',
  auto_archive:         'Auto-archived',
  remove_auto_archive:  'Removed auto-archive',
  resubscribe:          'Resubscribed',
  ignore:               'Hidden from report',
  mark_never_engage:    'Marked as noise',
  revert_never_engage:  'Reverted noise mark',
};

const REVERSIBLE_ACTIONS = new Set(['unsubscribe', 'auto_archive', 'mark_never_engage']);

function HistoryModal({
  history, loading, onUndo, onClose,
}: {
  history:  ActionHistoryItem[];
  loading:  boolean;
  onUndo:   (id: string) => void;
  onClose:  () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Action History
          </DialogTitle>
          <DialogDescription>
            Your last 50 sender actions. Reversible actions can be undone here.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No actions yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {history.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{item.sender_email}</span>
                      {item.status === 'undone' && (
                        <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">undone</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <span>{ACTION_LABELS[item.action_type] ?? item.action_type}</span>
                      {item.emails_affected != null && item.emails_affected > 0 && (
                        <span>· {item.emails_affected.toLocaleString()} emails</span>
                      )}
                      <span>· {formatDate(item.created_at)}</span>
                    </div>
                    {item.status === 'failed' && item.error_message && (
                      <p className="text-xs text-red-600 mt-0.5">{item.error_message}</p>
                    )}
                  </div>
                  {item.status === 'completed' && REVERSIBLE_ACTIONS.has(item.action_type) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 h-7 px-2 text-xs"
                      onClick={() => onUndo(item.id)}
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Undo
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── PreviewModal ──────────────────────────────────────────────────────────────

function PreviewModal({
  sender, preview, loading, onAction, onClose,
}: {
  sender:   SenderRow;
  preview:  SenderPreview | null;
  loading:  boolean;
  onAction: (action: string) => void;
  onClose:  () => void;
}) {
  const categoryMeta = CATEGORY_META[sender.category] ?? { label: sender.category, bg: 'bg-gray-100 text-gray-600 border-gray-200' };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 min-w-0">
            <Eye className="w-4 h-4 shrink-0" />
            <span className="truncate">{sender.sender_name || sender.sender_email}</span>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', categoryMeta.bg)}>
              {categoryMeta.label}
            </span>
            <span>{sender.emails_received.toLocaleString()} emails · {Math.round((sender.engagement_rate ?? 0) * 100)}% open rate</span>
          </DialogDescription>
        </DialogHeader>

        {/* Latest email preview */}
        <div className="rounded-lg border border-border p-4 bg-muted/30 min-h-[120px]">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading latest email…
            </div>
          ) : preview ? (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-tight">{preview.subject || '(no subject)'}</p>
                {preview.date_ts && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(preview.date_ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
              {preview.snippet && (
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
                  {preview.snippet}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No recent emails found from this sender.</p>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          {sender.has_unsubscribe_header && sender.unsubscribe_status !== 'unsubscribed' && (
            <Button size="sm" variant="outline" onClick={() => onAction('unsubscribe')}>
              <MailX className="w-3.5 h-3.5 mr-1.5" />
              Unsubscribe
            </Button>
          )}
          {!sender.auto_archive_enabled && (
            <Button size="sm" variant="outline" onClick={() => onAction('auto_archive')}>
              <Archive className="w-3.5 h-3.5 mr-1.5" />
              Auto-archive
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => onAction('bulk_delete')} className="text-red-600 border-red-200 hover:bg-red-50">
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Delete emails
          </Button>
          {isStillReceiving(sender) && (
            <Button size="sm" variant="destructive" onClick={() => onAction('report_spam')}>
              <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
              Report as spam
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X className="w-3.5 h-3.5 mr-1.5" />
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  onPreview,
  isPending,
}: {
  sender:     SenderRow;
  isSelected: boolean;
  onToggle:   () => void;
  onAction:   (action: string) => void;
  onPreview:  () => void;
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
      <td className="px-4 py-3 w-20">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={onPreview}
            title="Preview latest email"
          >
            <Eye className="w-3.5 h-3.5" />
          </Button>
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

            {/* Report as Spam — only for Still Receiving senders */}
            {isStillReceiving(sender) && (
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                onClick={() => onAction('report_spam')}
              >
                <AlertTriangle className="w-3.5 h-3.5 mr-2" />
                Report as Spam
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}
