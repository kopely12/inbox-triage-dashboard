'use client';

import { useState, useEffect, useCallback, useTransition, useMemo, useRef } from 'react';
import { useRouter }        from 'next/navigation';
import { useSession }       from 'next-auth/react';
import { toast }            from 'sonner';
import {
  Inbox, Trash2, Archive, BellOff, Undo2,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Loader2,
  MailX, Filter, Download, Sparkles, TriangleAlert,
  Layers, Info, ExternalLink, History, X, RotateCcw, MoreHorizontal,
  Zap, Shield, ListChecks, SlidersHorizontal, Package, Search, ArrowUpDown,
  Activity,
} from 'lucide-react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
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
  getActionHistory, undoAction, getNoiseBriefing,
  getInboxHealth,
  type ActionResult, type ActionHistoryItem,
  type CleanupJob, type NoiseBriefing, type OptOutSender, type EmailTypeStat,
  type InboxHealthData,
} from '@/app/actions/engagement';
import { addSendersToBundle } from '@/app/actions/bundle';
import { InboxHealthClient } from '@/components/inbox-health/inbox-health-client';
import type { InboxAlert } from '@/app/actions/protection';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { StorageTab }        from './storage-tab';
import { DeepCleanPanel } from './deep-clean-panel';
import { ScreenerTab }       from './screener-tab';
import { AutomationTab }            from './automation-tab';
import { CadenceSuggestionsPanel } from './cadence-suggestions-panel';
import { NewSenderDigest }        from './new-sender-digest';
import { RecommendationsButton }  from './recommendations-feed';
import { ActiveJobBanner, JobsPanel } from './jobs-panel';
import { SafetyScanModal }  from './safety-scan-modal';
import { isDormant } from './dormant-senders-tab';
import { BundleContentsTab }           from '@/components/bundle/bundle-contents-tab';
import { SendersTable, type FullSenderRow } from '@/components/senders/senders-table';
import Link from 'next/link';
import { Users, Pin, EyeOff } from 'lucide-react';

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
  recent_engagement_rate: number | null;
  last_email_date:       string | null;
  has_unsubscribe_header: boolean;
  unsubscribe_status:    string | null;
  unsubscribed_at:       string | null;
  auto_archive_enabled:  boolean;
  auto_archive_filter_id: string | null;
  ignored:               boolean;
  period_days:           number;
  updated_at:            string | null;
  emails_forwarded:      number;
  engagement_score:      number | null;
  opt_out_replied_at:    string | null;
  ai_description:        string | null;
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
  senders:          SenderRow[];
  summary:          Summary;
  refreshStatus:    string;
  lastRefreshed:    string | null;
  planTier:         string;
  queryError:       string | null;
  contacts:         FullSenderRow[];
  domainRulesCount: number;
  optOutSenders:    OptOutSender[];
  screenerQueue?:        import('@/app/actions/engagement').ScreenerSender[];
  screenerEnabled?:      boolean;
  typeStatsBySender?:    Record<string, EmailTypeStat[]>;
  triageBySender?:       Record<string, { reply_count: number; dismiss_count: number }>;
  recentUnsubscribes?:   RecentUnsubscribe[];
  userDomain?:           string | null;
  failedUnsubscribes?:   FailedUnsub[];
  health?:               InboxHealthData | null;
  initialAlerts?:        InboxAlert[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; color: string; bg: string }> = {
  never_engage:   { label: 'Never Open',    color: 'text-red-700',    bg: 'bg-red-100 text-red-700 border-red-200' },
  rarely_engage:  { label: 'Rarely Open',   color: 'text-amber-700',  bg: 'bg-amber-100 text-amber-700 border-amber-200' },
  regular:        { label: 'Regular',       color: 'text-blue-700',   bg: 'bg-blue-100 text-blue-700 border-blue-200' },
  known_contact:  { label: 'Known Contact', color: 'text-green-700',  bg: 'bg-green-100 text-green-700 border-green-200' },
  personal:       { label: 'Known Contact', color: 'text-green-700',  bg: 'bg-green-100 text-green-700 border-green-200' },
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

function groupByDomain(
  senders: SenderRow[],
  sortKey: 'volume' | 'open_rate' | 'last_email' | 'name' | 'trashed' = 'volume',
  sortDir: 'asc' | 'desc' = 'desc',
): DomainGroup[] {
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
      senders:          group,
      totalEmails:      group.reduce((n, s) => n + s.emails_received, 0),
      maxEngagement:    Math.max(...group.map((s) => s.engagement_rate ?? 0)),
      category:         worst,
      hasTransactional: group.some((s) => s.category === 'transactional'),
    };
  }).sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'open_rate':  return dir * (a.maxEngagement - b.maxEngagement);
      case 'trashed': {
        const aRate = Math.max(...a.senders.map((s) => (s.emails_deleted ?? 0) / Math.max(s.emails_received, 1)));
        const bRate = Math.max(...b.senders.map((s) => (s.emails_deleted ?? 0) / Math.max(s.emails_received, 1)));
        return dir * (aRate - bRate);
      }
      case 'last_email': {
        const at = Math.max(...a.senders.map((s) => s.last_email_date ? new Date(s.last_email_date).getTime() : 0));
        const bt = Math.max(...b.senders.map((s) => s.last_email_date ? new Date(s.last_email_date).getTime() : 0));
        return dir * (at - bt);
      }
      case 'name':   return dir * a.domain.localeCompare(b.domain);
      default:       return dir * (a.totalEmails - b.totalEmails); // volume
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// 14-day grace period — legitimate platforms can take up to 2 weeks to process.
const UNSUB_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

/** Returns true when a sender is still sending after being unsubscribed (14-day grace). */
function isStillReceiving(s: SenderRow): boolean {
  if (s.unsubscribe_status !== 'unsubscribed' || !s.unsubscribed_at || !s.last_email_date) return false;
  return new Date(s.last_email_date).getTime() > new Date(s.unsubscribed_at).getTime() + UNSUB_GRACE_MS;
}

/** Returns true when a sender belongs to the user's own company domain. */
function isInternal(s: SenderRow, domain: string | null | undefined): boolean {
  if (!domain) return false;
  return (
    s.sender_domain === domain ||
    s.sender_email.toLowerCase().endsWith('@' + domain)
  );
}

/**
 * Returns true for senders where the user used to engage but recently stopped.
 * Signal: 90-day overall rate > 20% BUT 30-day recent rate < 5%.
 * Filters out senders with too few recent emails (< 3) to avoid false positives.
 */
function isLapsed(s: SenderRow): boolean {
  if (s.recent_engagement_rate === null || s.recent_engagement_rate === undefined) return false;
  return (s.engagement_rate ?? 0) > 0.20 && s.recent_engagement_rate < 0.05;
}

// ── Unsubscribe outcome tracking ──────────────────────────────────────────────

export type RecentUnsubscribe = {
  sender_email:    string;
  sender_name:     string | null;
  sender_domain:   string | null;
  unsubscribed_at: string;
  last_email_date: string | null;
  emails_received: number;
};

export type FailedUnsub = {
  sender_email:    string;
  sender_name:     string | null;
  sender_domain:   string | null;
  category:        string;
  emails_received: number;
  last_email_date: string | null;
};

type UnsubOutcome = 'confirmed_quiet' | 'still_sending' | 'pending';

function computeUnsubOutcome(s: RecentUnsubscribe): UnsubOutcome {
  const unsubTime = new Date(s.unsubscribed_at).getTime();
  // Within grace period — too early to judge
  if (Date.now() - unsubTime < UNSUB_GRACE_MS) return 'pending';
  // Grace period passed; check for emails after it
  if (s.last_email_date) {
    const lastTime = new Date(s.last_email_date).getTime();
    if (lastTime > unsubTime + UNSUB_GRACE_MS) return 'still_sending';
  }
  return 'confirmed_quiet';
}

function exportSendersAsCSV(senders: SenderRow[]) {
  const headers = [
    'Sender Email', 'Sender Name', 'Category', 'Emails Received',
    'Emails Opened', 'Open Rate %', 'Last Email', 'Unsubscribe Status',
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
  protectedContacts,
}: {
  state:                    ConfirmState;
  isPending:                boolean;
  onConfirm:                () => void;
  onClose:                  () => void;
  onToggleDeleteExisting?:  (v: boolean) => void;
  onChangeOlderThanDays?:   (v: number | null) => void;
  protectedContacts?:       Map<string, number>;
}) {
  const meta         = ACTION_META[state.action] ?? ACTION_META['ignore'];
  const totalEmails  = state.senders.reduce((s, r) => s + r.emails_received, 0);
  const senderCount  = state.senders.length;
  const plural       = senderCount > 1 ? 'senders' : 'sender';

  // Senders in this batch that have open commitments — warn before bulk-delete / archive
  const atRiskSenders = protectedContacts
    ? state.senders.filter((s) => (protectedContacts.get(s.sender_email) ?? 0) > 0)
    : [];

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
            {state.action === 'clean_never_engage' && (() => {
              const withLink    = state.senders.filter((s) => s.has_unsubscribe_header).length;
              const withoutLink = senderCount - withLink;
              return (
                <>
                  <strong>{senderCount} Never Open {plural}</strong> will be cleaned up:
                  <ul className="mt-2 space-y-1 list-none">
                    {withLink > 0 && (
                      <li className="flex items-start gap-1.5">
                        <span className="mt-0.5 text-muted-foreground">•</span>
                        <span><strong>{withLink}</strong> with unsubscribe links — will be unsubscribed and their emails deleted</span>
                      </li>
                    )}
                    {withoutLink > 0 && (
                      <li className="flex items-start gap-1.5">
                        <span className="mt-0.5 text-muted-foreground">•</span>
                        <span><strong>{withoutLink}</strong> without unsubscribe links — emails deleted only</span>
                      </li>
                    )}
                  </ul>
                </>
              );
            })()}
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

        {/* Sender list — shown when multiple senders are targeted */}
        {senderCount > 1 && (
          <div className="rounded-md border border-border bg-muted/30 overflow-hidden">
            <div className="max-h-40 overflow-y-auto divide-y divide-border">
              {state.senders.map((s) => (
                <div key={s.sender_email} className="flex items-center justify-between px-3 py-1.5 gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-medium truncate block">
                      {s.sender_name || s.sender_email}
                    </span>
                    {s.sender_name && (
                      <span className="text-[11px] text-muted-foreground truncate block">{s.sender_email}</span>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                    {s.emails_received.toLocaleString()} emails
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Protected contact warning — shown when any targeted sender has open commitments */}
        {atRiskSenders.length > 0 && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800 mt-1">
            <Pin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
            <div className="flex-1 min-w-0">
              <span className="font-medium">
                {atRiskSenders.length === 1
                  ? `${atRiskSenders[0].sender_name || atRiskSenders[0].sender_email} has open commitments.`
                  : `${atRiskSenders.length} senders have open commitments.`}
              </span>
              {' '}Make sure any pending replies are handled before taking this action.
            </div>
          </div>
        )}

        {/* Advanced options — collapsed by default to reduce decision fatigue.
            "Also delete" and "delete scope" are power-user controls; most users
            should just confirm with the defaults. */}
        {((state.action === 'unsubscribe' && onToggleDeleteExisting) ||
          (onChangeOlderThanDays && (
            state.action === 'bulk_delete' ||
            state.action === 'clean_never_engage' ||
            (state.action === 'unsubscribe' && state.deleteExisting)
          ))) && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1">
              <ChevronDown className="w-3.5 h-3.5 transition-transform [[open]_&]:rotate-180" />
              More options
            </summary>

            <div className="mt-2 pl-1 space-y-3 border-l-2 border-border ml-1 pl-3">
              {/* "Also delete emails" checkbox — unsubscribe only */}
              {state.action === 'unsubscribe' && onToggleDeleteExisting && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={state.deleteExisting ?? false}
                    onChange={(e) => onToggleDeleteExisting(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span>Also move existing emails from {senderCount > 1 ? 'these senders' : 'this sender'} to trash</span>
                </label>
              )}

              {/* Delete scope — bulk_delete, clean_never_engage, or unsubscribe+deleteExisting */}
              {onChangeOlderThanDays && (
                state.action === 'bulk_delete' ||
                state.action === 'clean_never_engage' ||
                (state.action === 'unsubscribe' && state.deleteExisting)
              ) && (
                <div className="space-y-1.5">
                  <p className="font-medium text-foreground">Which emails to delete:</p>
                  <label className="flex items-center gap-2 cursor-pointer">
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
                  <label className="flex items-center gap-2 cursor-pointer">
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
            </div>
          </details>
        )}

        {/* Sender list (capped at 5) */}
        {senderCount <= 8 && (
          <ul className="mt-1 space-y-1 text-sm text-muted-foreground max-h-40 overflow-y-auto">
            {state.senders.map((s, i) => (
              <li key={`${s.sender_email}-${i}`} className="flex items-center justify-between gap-2">
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
  { key: 'never_engage',     label: 'Never Open' },
  { key: 'rarely_engage',    label: 'Rarely Open' },
  { key: 'lapsed',           label: '📉 Lapsed' },
  { key: 'regular',          label: 'Regular' },
  { key: 'known_contact',    label: 'Known Contact' },
  { key: 'transactional',    label: 'Transactional' },
  { key: 'still_receiving',  label: 'Still Receiving' },
  { key: 'high_delete_rate', label: '🗑 High delete rate' },
  { key: 'all',              label: 'All' },
] as const;


// ── Main Component ─────────────────────────────────────────────────────────────

export function SenderIntelligenceClient({
  senders: initialSenders,
  summary,
  refreshStatus: initialRefreshStatus,
  lastRefreshed,
  planTier,
  queryError,
  contacts,
  domainRulesCount,
  optOutSenders,
  screenerQueue        = [],
  screenerEnabled      = false,
  typeStatsBySender    = {},
  triageBySender       = {},
  recentUnsubscribes   = [],
  userDomain           = null,
  failedUnsubscribes   = [] as FailedUnsub[],
  health               = null,
  initialAlerts        = [],
}: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  const gmailAcct = session?.user?.email ? encodeURIComponent(session.user.email) : '0';

  // Top-level navigation
  // Read initial tab from URL param so recommendation links within Noise Score work
  type TopTab = 'noise_score' | 'senders' | 'deep_clean' | 'screener' | 'bundle' | 'automation';
  const VALID_TOP_TABS: TopTab[] = ['noise_score', 'senders', 'deep_clean', 'screener', 'bundle', 'automation'];
  const [activeTab, setActiveTab] = useState<TopTab>(() => {
    if (typeof window === 'undefined') return 'noise_score';
    const p = new URLSearchParams(window.location.search).get('tab') as TopTab | null;
    return (p && VALID_TOP_TABS.includes(p)) ? p : 'noise_score';
  });
  const [deepCleanSubTab, setDeepCleanSubTab] = useState<'bulk' | 'storage'>('bulk');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Local state
  const [activeCategory,  setActiveCategory]  = useState<string>('never_engage');
  const [selected,         setSelected]        = useState<Set<string>>(new Set());
  const [confirmState,     setConfirmState]    = useState<ConfirmState | null>(null);
  const [refreshStatus,    setRefreshStatus]   = useState(initialRefreshStatus);
  const [isPending,        startTransition]    = useTransition();
  const [isRefreshing,     setIsRefreshing]    = useState(false);
  const [groupByDomainOn,  setGroupByDomainOn] = useState(true);
  const [expandedDomains,  setExpandedDomains] = useState<Set<string>>(new Set());
  const [searchQuery,      setSearchQuery]      = useState('');
  const [sortKey,          setSortKey]          = useState<'volume' | 'open_rate' | 'last_email' | 'name' | 'trashed'>('volume');
  const [sortDir,          setSortDir]          = useState<'asc' | 'desc'>('desc');
  const [noiseBaseline, setNoiseBaseline] = useState<{
    noise_percentage:   number;
    total_noise_emails: number;
    timestamp:          string;
  } | null>(null);
  const [cleanupBannerDismissed, setCleanupBannerDismissed] = useState(false);
  const [showHistory,      setShowHistory]     = useState(false);
  const [history,          setHistory]         = useState<ActionHistoryItem[]>([]);
  const [historyLoading,   setHistoryLoading]  = useState(false);
  const [aiDescriptions,    setAiDescriptions]   = useState<Record<string, string>>({});
  const [briefing,         setBriefing]        = useState<NoiseBriefing | null>(null);
  const [scanState,        setScanState]       = useState<{ senders: SenderRow[]; action: string; deleteExisting: boolean; olderThanDays: number | null } | null>(null);
  const [preActionScore,   setPreActionScore]  = useState<number | null>(null);
  const isFree = planTier === 'free';

  // ── Protected contacts: senders with open commitments ────────────────────────
  // Used to show a warning badge on the Senders tab and in the confirm dialog,
  // so users don't accidentally archive someone they have active threads with.
  const protectedContacts = useMemo(() => {
    const map = new Map<string, number>(); // email → open commitment count
    for (const c of contacts) {
      if (c.open > 0) map.set(c.email, c.open);
    }
    return map;
  }, [contacts]);

  // ── Load noise baseline from localStorage on mount ───────────────────────────

  useEffect(() => {
    try {
      const stored = localStorage.getItem('inbox-triage:noise-baseline');
      if (stored) setNoiseBaseline(JSON.parse(stored));
    } catch {}
  }, []);

  // ── Auto-analyze: on first visit OR when data is stale (>1 h) ───────────────

  const autoAnalyzeFired = useRef(false);
  useEffect(() => {
    if (isFree || autoAnalyzeFired.current) return;
    const isNever  = refreshStatus === 'never';
    const isStale  = refreshStatus === 'completed' && lastRefreshed !== null &&
                     Date.now() - new Date(lastRefreshed).getTime() > 60 * 60 * 1000;
    if (isNever || isStale) {
      autoAnalyzeFired.current = true;
      handleRefresh(true); // silent — no toast on automatic refresh
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load briefing + current health score on mount ────────────────────────────

  useEffect(() => {
    getNoiseBriefing().then(({ briefing: b }) => { if (b) setBriefing(b); });
    // Fetch score silently so we can compare after a cleanup action
    getInboxHealth().then(({ health }) => {
      if (health?.score !== null && health?.score !== undefined) {
        setPreActionScore(health.score);
      }
    });
  }, []);

  // ── AI descriptions — pre-generated during refresh, loaded from initialSenders ──
  // Descriptions are populated by batchDescribeSenders() at the end of each
  // engagement refresh run and stored in sender_engagement.ai_description.
  // We hydrate the local state once from the server-rendered sender list.
  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const s of initialSenders) {
      if (s.ai_description) initial[s.sender_email] = s.ai_description;
    }
    if (Object.keys(initial).length) setAiDescriptions(initial);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Failed-sender retry state ─────────────────────────────────────────────────
  // Stores senders that failed the last bulk action so the user can retry them.
  const [failedSendersForRetry, setFailedSendersForRetry] = useState<SenderRow[]>([]);

  // ── Polling when running ─────────────────────────────────────────────────────

  useEffect(() => {
    if (refreshStatus !== 'running') return;
    const id = setInterval(async () => {
      const status = await getEngagementStatus();
      if (!status) return;
      if (status.refresh_status !== 'running') {
        const wasFirstRun = noiseBaseline === null;
        setRefreshStatus(status.refresh_status);
        if (status.refresh_status === 'completed_with_errors') {
          toast.warning('Refresh completed with write errors — some sender data may be incomplete. Try refreshing again.');
        } else if (status.refresh_status === 'completed' && wasFirstRun) {
          toast.success('Inbox scanned — sender rules are active to handle future noise.', {
            duration: 6000,
            description: 'We enabled a default rule that removes senders you consistently ignore.',
          });
        }
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


  // ── Since last cleanup banner dismiss ───────────────────────────────────────

  const dismissCleanupBanner = useCallback(() => {
    setCleanupBannerDismissed(true);
    const newBaseline = {
      noise_percentage:   summary.noise_percentage,
      total_noise_emails: summary.total_noise_emails,
      timestamp:          new Date().toISOString(),
    };
    try { localStorage.setItem('inbox-triage:noise-baseline', JSON.stringify(newBaseline)); } catch {}
  }, [summary]);

  // ── Refresh trigger ──────────────────────────────────────────────────────────

  const handleRefresh = useCallback(async (silent = false) => {
    setIsRefreshing(true);
    const result = await triggerRefresh();
    setIsRefreshing(false);

    if (result.status === 'started') {
      setRefreshStatus('running');
      if (!silent) toast.success('Analysis started — this takes about 90 seconds.');
    } else if (result.status === 'already_running') {
      setRefreshStatus('running');
    } else if (result.status === 'already_fresh') {
      if (!silent) toast.info('Your data is already up to date.');
    } else {
      if (!silent) toast.error(result.error ?? 'Could not start analysis.');
    }
  }, []);

  // ── Filtered senders ─────────────────────────────────────────────────────────

  const NOISE_CATEGORIES = new Set(['never_engage', 'rarely_engage']);

  const categoryFiltered = activeCategory === 'all'
    ? initialSenders  // "All" means all senders — noise-only was a bug
    : activeCategory === 'still_receiving'
      ? initialSenders.filter(isStillReceiving)
      : activeCategory === 'lapsed'
        ? initialSenders.filter(isLapsed)
        : activeCategory === 'known_contact'
          ? initialSenders.filter((s) => s.category === 'known_contact' || s.category === 'personal')
          : activeCategory === 'high_delete_rate'
            ? initialSenders.filter((s) => {
                const trashRate = (s.emails_deleted ?? 0) / Math.max(s.emails_received, 1);
                return trashRate >= 0.5 && s.emails_received >= 5 &&
                  s.category !== 'transactional' && s.category !== 'known_contact';
              })
            : initialSenders.filter((s) => s.category === activeCategory);

  const searchFiltered = searchQuery.trim()
    ? (() => {
        const q = searchQuery.toLowerCase().trim();
        return categoryFiltered.filter((s) =>
          (s.sender_name  ?? '').toLowerCase().includes(q) ||
          s.sender_email.toLowerCase().includes(q) ||
          (s.sender_domain ?? '').toLowerCase().includes(q),
        );
      })()
    : categoryFiltered;

  const filteredSenders = [...searchFiltered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'open_rate':  return dir * ((a.engagement_rate ?? 0) - (b.engagement_rate ?? 0));
      case 'trashed': {
        const aRate = (a.emails_deleted ?? 0) / Math.max(a.emails_received, 1);
        const bRate = (b.emails_deleted ?? 0) / Math.max(b.emails_received, 1);
        return dir * (aRate - bRate);
      }
      case 'last_email': {
        const at = a.last_email_date ? new Date(a.last_email_date).getTime() : 0;
        const bt = b.last_email_date ? new Date(b.last_email_date).getTime() : 0;
        return dir * (at - bt);
      }
      case 'name': {
        const an = (a.sender_name || a.sender_email).toLowerCase();
        const bn = (b.sender_name || b.sender_email).toLowerCase();
        return dir * an.localeCompare(bn);
      }
      default: return dir * (a.emails_received - b.emails_received); // volume
    }
  });

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
    // Add to Bundle — fire directly, no confirm modal needed
    if (action === 'add_to_bundle') {
      startTransition(async () => {
        const emails = targetSenders.map((s) => s.sender_email);
        const { error } = await addSendersToBundle(emails);
        setSelected(new Set());
        if (error) {
          if (error.includes('not enabled') || error.includes('enable')) {
            toast.error('Enable bundling first — go to the Bundle tab to set it up.', {
              action: { label: 'Bundle tab', onClick: () => setActiveTab('bundle') },
            });
          } else {
            toast.error(error);
          }
        } else {
          toast.success(`${emails.length} sender${emails.length !== 1 ? 's' : ''} added to bundle.`);
          router.refresh();
        }
      });
      return;
    }

    if (isFree && targetSenders.length > 1) {
      toast.error('Bulk actions require a Pro plan. Select one sender at a time on the free plan.');
      return;
    }
    const needsConfirm = ['bulk_delete', 'unsubscribe', 'auto_archive', 'ignore', 'clean_never_engage'].includes(action);
    const defaultOlderThan = ['bulk_delete'].includes(action) ? 90 : null;
    if (needsConfirm) {
      setConfirmState({ action, senders: targetSenders, deleteExisting, olderThanDays: defaultOlderThan });
    } else {
      executeAction(action, targetSenders, deleteExisting, null);
    }
  }

  // Called when the user clicks Confirm in ConfirmModal for a delete action —
  // shows the safety scan before actually executing.
  function handleConfirmWithScan() {
    if (!confirmState) return;
    const isDelete = confirmState.action === 'bulk_delete' || confirmState.action === 'clean_never_engage' ||
      (confirmState.action === 'unsubscribe' && confirmState.deleteExisting);
    if (isDelete && confirmState.senders.length > 1) {
      setScanState({
        senders:       confirmState.senders,
        action:        confirmState.action,
        deleteExisting: confirmState.deleteExisting ?? false,
        olderThanDays:  confirmState.olderThanDays ?? null,
      });
      setConfirmState(null);
    } else {
      executeAction(
        confirmState.action,
        confirmState.senders,
        confirmState.deleteExisting ?? false,
        confirmState.olderThanDays ?? null,
      );
    }
  }

  function openCleanNeverEngage() {
    const neverSenders = initialSenders.filter(
      (s) => s.category === 'never_engage' && !isInternal(s, userDomain),
    );
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
    // Capture pre-action noise state so we can show improvement after page refresh.
    const noiseActions = ['unsubscribe', 'bulk_delete', 'auto_archive', 'clean_never_engage', 'report_spam'];
    if (noiseActions.includes(action)) {
      const snapshot = {
        noise_percentage:   summary.noise_percentage,
        total_noise_emails: summary.total_noise_emails,
        timestamp:          new Date().toISOString(),
      };
      try { localStorage.setItem('inbox-triage:noise-baseline', JSON.stringify(snapshot)); } catch {}
      setNoiseBaseline(snapshot);
      setCleanupBannerDismissed(false);
    }

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
        ? `${succeeded} sender${succeeded > 1 ? 's' : ''} updated successfully.`
        : 'No changes made.';

      const REVERSIBLE = new Set(['unsubscribe', 'auto_archive', 'mark_never_engage']);
      const canUndo    = REVERSIBLE.has(action) && succeeded > 0;

      if (failed > 0) {
        // Identify which senders failed by process of elimination.
        // (API doesn't return per-sender failure details so we approximate:
        //  the last `failed` senders in the batch are assumed to have failed.)
        const failedRows = targetSenders.slice(targetSenders.length - failed);
        setFailedSendersForRetry(failedRows);

        const failedNames = failedRows.slice(0, 3).map((s) => s.sender_name || s.sender_email);
        const failedLabel = failedRows.length > 3
          ? `${failedNames.join(', ')} +${failedRows.length - 3} more`
          : failedNames.join(', ');

        toast.warning(`${msg} ${failed} sender${failed > 1 ? 's' : ''} failed: ${failedLabel}`, {
          duration: 10000,
          action: failedRows.length > 0 ? {
            label: 'Retry failed',
            onClick: () => {
              openConfirm(action, failedRows);
            },
          } : undefined,
        });
      } else if (canUndo) {
        // Offer undo by fetching the just-created action IDs from history
        toast.success(msg, {
          duration: 8000,
          action: {
            label: 'Undo',
            onClick: async () => {
              const { actions: hist } = await getActionHistory();
              const toUndo = (hist ?? [])
                .filter((a: ActionHistoryItem) => a.action_type === action && a.status !== 'undone')
                .slice(0, targetSenders.length);
              if (!toUndo.length) { toast.error('Nothing to undo.'); return; }
              await Promise.all(toUndo.map((a: ActionHistoryItem) => undoAction(a.id)));
              toast.success(`Undone — ${toUndo.length} action${toUndo.length > 1 ? 's' : ''} reversed.`);
              router.refresh();
            },
          },
        });
      } else {
        toast.success(msg);
      }

      // ── Post-cleanup health score celebration ─────────────────────────────
      if (succeeded > 0 && preActionScore !== null) {
        try {
          const { health: newHealth } = await getInboxHealth();
          const newScore = newHealth?.score;
          if (newScore !== null && newScore !== undefined && newScore > preActionScore) {
            const gain = newScore - preActionScore;
            const emoji = gain >= 5 ? '🎉' : '✨';
            const newGrade = newScore >= 90 ? 'A+' : newScore >= 80 ? 'A' : newScore >= 70 ? 'B' : newScore >= 55 ? 'C' : newScore >= 40 ? 'D' : 'F';
            toast.success(`${emoji} Inbox Health improved!`, {
              description: `${preActionScore} → ${newScore} pts (+${gain})  ·  Grade ${newGrade}`,
              duration: 7000,
              action: { label: 'View report', onClick: () => router.push('/inbox-health') },
            });
            setPreActionScore(newScore);
          }
        } catch {
          // Non-critical — swallow silently
        }
      }

      router.refresh();
    });
  }

  // ── Count for each category tab ──────────────────────────────────────────────

  function categoryCount(key: string) {
    if (key === 'all')             return initialSenders.length;
    if (key === 'still_receiving') return initialSenders.filter(isStillReceiving).length;
    if (key === 'lapsed')          return initialSenders.filter(isLapsed).length;
    if (key === 'known_contact')   return initialSenders.filter((s) => s.category === 'known_contact' || s.category === 'personal').length;
    if (key === 'opt_outs')        return optOutSenders.length + recentUnsubscribes.length;
    if (key === 'high_delete_rate') return initialSenders.filter((s) => {
      const trashRate = (s.emails_deleted ?? 0) / Math.max(s.emails_received, 1);
      return trashRate >= 0.5 && s.emails_received >= 5 &&
        s.category !== 'transactional' && s.category !== 'known_contact';
    }).length;
    return initialSenders.filter((s) => s.category === key).length;
  }

  // ── Selected senders list ────────────────────────────────────────────────────

  const selectedSenders = initialSenders.filter((s) => selected.has(s.sender_email));

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  // ── First-run scanning state — auto-started, no data yet ────────────────────
  if ((refreshStatus === 'never' || refreshStatus === 'running') && initialSenders.length === 0) {
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
            <h2 className="text-lg font-semibold mb-2">Analyzing your last {summary.period_days} days of email…</h2>
            <p className="text-muted-foreground text-sm">
              Finding senders you never open, newsletters you could bundle, and noise you can clean up.
              This takes about 90 seconds.
            </p>
            <p className="text-xs text-muted-foreground mt-4">
              You can navigate away — we&apos;ll keep analyzing in the background.
              The page will update automatically when done.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Want to check email while you wait?{' '}
              <a
                href={`https://mail.google.com/mail/u/${gmailAcct}/`}
                target="_blank"
                rel="noopener"
                className="text-primary underline-offset-2 hover:underline"
              >
                Open Gmail →
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Top-level tab definitions ────────────────────────────────────────────────

  const stillSendingCount = optOutSenders.filter((s) => s.resolution === 'still_sending').length;

  const PRIMARY_TABS = [
    { key: 'noise_score' as const, label: 'Noise Score', icon: Activity,          badge: null },
    { key: 'senders'     as const, label: 'Senders',     icon: Inbox,             badge: null },
    { key: 'deep_clean'  as const, label: 'Deep Clean',  icon: Zap,               badge: null },
    { key: 'screener'    as const, label: 'Screener',    icon: Shield,            badge: null },
    { key: 'automation'  as const, label: 'Automation',  icon: SlidersHorizontal, badge: null },
    { key: 'bundle'      as const, label: 'Bundle',      icon: Package,           badge: null },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-5 shrink-0">
        <div>
          <h2 className="text-lg font-semibold">Tune</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Last {summary.period_days} days</span>
            {summary.total_senders > 0 && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <button
                  onClick={() => { setActiveTab('senders'); setActiveCategory('never_engage'); }}
                  className={cn(
                    'text-sm font-semibold underline underline-offset-2 decoration-dotted hover:opacity-75 transition-opacity cursor-pointer',
                    summary.noise_percentage >= 50 ? 'text-red-600'
                      : summary.noise_percentage >= 25 ? 'text-amber-600'
                      : 'text-foreground',
                  )}
                  title="Click to view Never Open senders"
                >
                  {summary.noise_percentage}% noise
                </button>
                <span className="text-xs text-muted-foreground">
                  ({summary.total_noise_emails.toLocaleString()} emails)
                </span>
              </>
            )}
          </div>
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
            {(refreshStatus === 'completed' || refreshStatus === 'completed_with_errors') && lastRefreshed && (
              <button
                suppressHydrationWarning
                onClick={() => handleRefresh()}
                disabled={isRefreshing}
                className={cn(
                  'text-xs mr-1 hover:underline underline-offset-2 transition-colors disabled:opacity-50',
                  refreshStatus === 'completed_with_errors' ? 'text-amber-600' : 'text-muted-foreground hover:text-foreground',
                )}
                title="Click to re-analyze"
              >
                {refreshStatus === 'completed_with_errors' ? '⚠ Partial update · re-analyze?' : `Updated ${formatRelative(lastRefreshed)}`}
              </button>
            )}
            <Button variant="ghost" size="sm" onClick={handleOpenHistory} aria-label="View action history" className="gap-1.5 px-2 text-xs text-muted-foreground">
              <History className="w-3.5 h-3.5" />
              History
            </Button>
            {initialSenders.length > 0 && (
              <Button
                variant={groupByDomainOn ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setGroupByDomainOn((v) => !v)}
                aria-label={groupByDomainOn ? 'Ungroup senders' : 'Group by domain'}
                className="gap-1.5 px-2 text-xs text-muted-foreground"
              >
                <Layers className="w-3.5 h-3.5" />
                {groupByDomainOn ? 'Grouped' : 'Group'}
              </Button>
            )}
            {initialSenders.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => exportSendersAsCSV(filteredSenders)}
                aria-label="Export current view as CSV"
                className="gap-1.5 px-2 text-xs text-muted-foreground"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </Button>
            )}

            <RecommendationsButton
              senders={initialSenders}
              typeStatsBySender={typeStatsBySender}
              onAction={(action, senders) => openConfirm(action, senders)}
              onCleanNeverEngage={openCleanNeverEngage}
              isFree={isFree}
              userDomain={userDomain}
            />
          </div>
        )}
      </div>

      {/* ── Since last cleanup improvement banner ───────────────────────────── */}
      {!cleanupBannerDismissed &&
       noiseBaseline !== null &&
       summary.noise_percentage < noiseBaseline.noise_percentage && (
        <div className="flex items-center gap-2 px-6 py-2 bg-green-50 border-b border-green-200 text-green-800 text-sm shrink-0">
          <Sparkles className="w-3.5 h-3.5 shrink-0 text-green-600" />
          <span className="flex-1 min-w-0">
            <strong>Since your last cleanup:</strong>{' '}
            noise down from {noiseBaseline.noise_percentage}% to {summary.noise_percentage}%
            {summary.total_noise_emails < noiseBaseline.total_noise_emails && (
              <> · {(noiseBaseline.total_noise_emails - summary.total_noise_emails).toLocaleString()} fewer noise emails</>
            )}
            {noiseBaseline.timestamp && (
              <span suppressHydrationWarning> · {formatRelative(noiseBaseline.timestamp)}</span>
            )}
          </span>
          <button
            onClick={dismissCleanupBanner}
            className="shrink-0 ml-2 text-green-700 hover:text-green-900 transition-colors"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Active job banner (shown on all tabs when a job is running) ──────── */}
      {activeJobId && (
        <ActiveJobBanner
          jobId={activeJobId}
          onComplete={() => setActiveJobId(null)}
        />
      )}

      {/* ── Top-level tab bar ────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border">
      <div className="flex items-center gap-0 px-6 pt-0 pb-0 overflow-x-auto">
        {PRIMARY_TABS.map(({ key, label, icon: Icon, badge }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px',
              activeTab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {badge !== null && badge > 0 && (
              <span className={cn(
                'ml-0.5 inline-flex items-center justify-center rounded-full text-[10px] font-semibold min-w-[18px] h-[18px] px-1',
                activeTab === key
                  ? 'bg-primary/15 text-primary'
                  : 'bg-amber-100 text-amber-700',
              )}>
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>
      </div>{/* end tab bar */}

      {/* ── Senders tab header ───────────────────────────────────────────────── */}
      {activeTab === 'senders' && (
        <div className="flex items-start gap-3 px-6 py-4 border-b border-border shrink-0">
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-primary/10">
            <Inbox className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Senders</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Senders from the past {summary.period_days} days, ranked by how often you open their email.
              Target <strong className="font-medium text-red-600">Never Open</strong> and{' '}
              <strong className="font-medium text-amber-600">Rarely Open</strong> senders to unsubscribe
              or auto-archive and reduce inbox noise.
            </p>
          </div>
        </div>
      )}

      {/* ── Senders category filter ──────────────────────────────────────────── */}
      {activeTab === 'senders' && (() => {
        const PRIMARY_CATS_NAV = [
          { key: 'all',           label: 'All'           },
          { key: 'never_engage',  label: 'Never Open',   colorCount: 'text-red-600'   },
          { key: 'rarely_engage', label: 'Rarely Open',  colorCount: 'text-amber-600' },
          { key: 'opt_outs',      label: 'Opt-outs'      },
        ];
        return (
          <div className="flex items-center gap-2 px-6 py-2 border-b border-border shrink-0 overflow-x-auto">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-muted flex-shrink-0">
              {PRIMARY_CATS_NAV.map(({ key, label, colorCount }) => {
                const count  = categoryCount(key);
                const active = activeCategory === key;
                const urgency = key === 'opt_outs' && stillSendingCount > 0;
                return (
                  <button
                    key={key}
                    onClick={() => { setActiveCategory(key); setSelected(new Set()); }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap',
                      active
                        ? 'bg-background text-foreground shadow-sm font-medium'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                    {/* Main count */}
                    <span className={cn(
                      'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                      active ? 'bg-muted text-muted-foreground' : '',
                      !active && colorCount ? colorCount : '',
                    )}>
                      {count}
                    </span>
                    {/* Amber "still sending" urgency badge */}
                    {urgency && (
                      <span className={cn(
                        'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                        active
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-amber-100 text-amber-700',
                      )}>
                        {stillSendingCount} still sending
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Search */}
            <div className="relative flex-shrink-0 ml-auto">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search senders…"
                className="h-8 pl-8 pr-3 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary w-48"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

          </div>
        );
      })()}

      {/* ── Tab panels ──────────────────────────────────────────────────────── */}

      {/* Noise Score */}
      {activeTab === 'noise_score' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-start gap-3 px-6 py-4 border-b border-border shrink-0">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-primary/10">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Noise Score</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                A holistic view of how well your inbox noise is managed — scored across engagement, hygiene, and subscription debt.
              </p>
            </div>
          </div>
          <div className="flex-1 overflow-auto px-6 py-6">
            <InboxHealthClient health={health ?? null} initialAlerts={initialAlerts} hideHeader />
          </div>
        </div>
      )}

      {/* Deep Clean */}
      {activeTab === 'deep_clean' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Header */}
          <div className="flex items-start gap-3 px-6 py-4 border-b border-border shrink-0">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-primary/10">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Deep Clean</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Bulk delete emails from low-engagement senders and reclaim storage.
              </p>
            </div>
          </div>
          {/* Sub-tab bar */}
          <div className="flex items-center gap-3 px-6 py-3 border-b border-border shrink-0">
            <div className="flex rounded-md overflow-hidden border border-border text-xs">
              {([['bulk', 'Bulk Cleanup'], ['storage', 'Storage Analysis']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setDeepCleanSubTab(key)}
                  className={cn(
                    'px-3 py-1 transition-colors',
                    deepCleanSubTab === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {deepCleanSubTab === 'bulk' && (
            <div className="flex-1 overflow-auto">
              <DeepCleanPanel
                onJobCreated={(job: CleanupJob) => {
                  setActiveJobId(job.id);
                }}
              />
            </div>
          )}
          {deepCleanSubTab === 'storage' && (
            <div className="flex flex-col flex-1 overflow-hidden">
              <StorageTab />
            </div>
          )}
        </div>
      )}

      {/* Screener */}
      {activeTab === 'screener' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <ScreenerTab />
        </div>
      )}

      {/* Bundle */}
      {activeTab === 'bundle' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <BundleContentsTab />
        </div>
      )}

      {/* Automation */}
      {activeTab === 'automation' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <AutomationTab />
        </div>
      )}

      {/* Filters */}

      {/* Opt-outs — rendered inside Senders tab when activeCategory === 'opt_outs' */}
      {activeTab === 'senders' && activeCategory === 'opt_outs' && (
        <div className="flex-1 overflow-auto px-6 py-6">
          <div className="space-y-6">

            {/* ── Aggregate metrics ─────────────────────────────────────────── */}
            {(recentUnsubscribes.length > 0 || optOutSenders.length > 0 || failedUnsubscribes.length > 0) && (() => {
              const allOutcomes = recentUnsubscribes.map(computeUnsubOutcome);
              const quietCount       = allOutcomes.filter((o) => o === 'confirmed_quiet').length;
              const stillSendingAuto = allOutcomes.filter((o) => o === 'still_sending').length;
              const stillSendingOpts = optOutSenders.filter((s) => s.resolution === 'still_sending').length;
              const totalSent        = recentUnsubscribes.length + optOutSenders.length;
              return (
                <div suppressHydrationWarning className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Unsubscribes sent',  value: totalSent,                          color: '' },
                    { label: 'Confirmed quiet',     value: quietCount,                         color: 'text-green-600' },
                    { label: 'Still sending',       value: stillSendingAuto + stillSendingOpts, color: stillSendingAuto + stillSendingOpts > 0 ? 'text-red-600' : '' },
                    { label: 'Link not found',      value: failedUnsubscribes.length,          color: failedUnsubscribes.length > 0 ? 'text-amber-600' : '' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-lg border border-border bg-card px-4 py-3">
                      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* ── Failed unsubscribes ───────────────────────────────────────── */}
            {failedUnsubscribes.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    No unsubscribe link found ({failedUnsubscribes.length})
                  </CardTitle>
                  <CardDescription>
                    These senders don&apos;t include a standard unsubscribe header. Auto-archive
                    creates a Gmail filter that silently skips future emails — a safer alternative
                    to spam-reporting legitimate senders.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 p-0">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted/30">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Sender</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground hidden md:table-cell">Emails</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden lg:table-cell">Last received</th>
                        <th className="px-4 py-2.5 w-36" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {failedUnsubscribes.map((s) => (
                        <tr key={s.sender_email} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col">
                              <span className="font-medium truncate">{s.sender_name || s.sender_email}</span>
                              {s.sender_name && <span className="text-xs text-muted-foreground truncate">{s.sender_email}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                            {s.emails_received.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground hidden lg:table-cell">
                            {s.last_email_date ? formatDate(s.last_email_date) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => openConfirm('auto_archive', [failedUnsubToSenderRow(s)])}
                            >
                              <Archive className="w-3 h-3 mr-1.5" />
                              Auto-archive
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {/* ── Monitoring: recent automated unsubscribes ─────────────────── */}
            {recentUnsubscribes.length > 0 && (() => {
              const withOutcome = recentUnsubscribes.map((s) => ({
                ...s, outcome: computeUnsubOutcome(s),
              }));
              const quiet   = withOutcome.filter((s) => s.outcome === 'confirmed_quiet');
              const sending = withOutcome.filter((s) => s.outcome === 'still_sending');
              const pending = withOutcome.filter((s) => s.outcome === 'pending');
              return (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                      Monitoring recent unsubscribes
                    </CardTitle>
                    <div className="flex flex-wrap gap-3 text-xs mt-1">
                      {quiet.length > 0 && (
                        <span className="flex items-center gap-1 text-green-700">
                          <CheckCircle2 className="w-3 h-3" />
                          <strong>{quiet.length}</strong> confirmed quiet
                        </span>
                      )}
                      {sending.length > 0 && (
                        <span className="flex items-center gap-1 text-red-600">
                          <AlertTriangle className="w-3 h-3" />
                          <strong>{sending.length}</strong> still sending
                        </span>
                      )}
                      {pending.length > 0 && (
                        <span className="flex items-center gap-1 text-amber-600" title="Most senders process unsubscribe requests within 14 days. If you keep receiving emails after that, use Block instead.">
                          <Loader2 className="w-3 h-3" />
                          <strong>{pending.length}</strong> pending — allow up to 14 days
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 p-0">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border bg-muted/30">
                        <tr>
                          <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Sender</th>
                          <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">Unsubscribed</th>
                          <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Outcome</th>
                          <th className="px-4 py-2.5 w-36" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {[...withOutcome].sort((a, b) => {
                          const order: Record<UnsubOutcome, number> = { still_sending: 0, pending: 1, confirmed_quiet: 2 };
                          return order[a.outcome] - order[b.outcome];
                        }).map((s, i) => {
                          const daysSince = Math.floor((Date.now() - new Date(s.unsubscribed_at).getTime()) / 86_400_000);
                          const daysLeft  = Math.max(0, 14 - daysSince);
                          return (
                            <tr key={`${s.sender_email}-${i}`} className="hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-2.5">
                                <div className="flex flex-col">
                                  <span className="font-medium truncate">{s.sender_name || s.sender_email}</span>
                                  {s.sender_name && <span className="text-xs text-muted-foreground truncate">{s.sender_email}</span>}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">
                                {formatDate(s.unsubscribed_at)}
                              </td>
                              <td className="px-4 py-2.5" suppressHydrationWarning>
                                {s.outcome === 'confirmed_quiet' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 border border-green-200">
                                    <CheckCircle2 className="w-3 h-3" /> Confirmed quiet
                                  </span>
                                )}
                                {s.outcome === 'still_sending' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 border border-red-200">
                                    <AlertTriangle className="w-3 h-3" /> Still sending
                                  </span>
                                )}
                                {s.outcome === 'pending' && (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 border border-amber-200"
                                    title="Most senders process unsubscribe requests within 14 days. If you keep receiving emails after that, use Block instead."
                                  >
                                    <Loader2 className="w-3 h-3" /> Pending — {daysLeft}d left (14-day grace)
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                {s.outcome === 'still_sending' && (() => {
                                  const fakeRow: SenderRow = {
                                    id: s.sender_email, sender_email: s.sender_email,
                                    sender_name: s.sender_name, sender_domain: s.sender_domain,
                                    category: 'never_engage', emails_received: s.emails_received,
                                    emails_opened: 0, emails_starred: 0, emails_replied: 0,
                                    emails_deleted: 0, engagement_rate: 0,
                                    recent_engagement_rate: null,
                                    last_email_date: s.last_email_date,
                                    has_unsubscribe_header: false,
                                    unsubscribe_status: 'unsubscribed',
                                    unsubscribed_at: s.unsubscribed_at,
                                    auto_archive_enabled: false, auto_archive_filter_id: null,
                                    ignored: false, period_days: 90, updated_at: null,
                                    emails_forwarded: 0, engagement_score: null, opt_out_replied_at: null,
                                    ai_description: null,
                                  };
                                  return (
                                    <div className="flex items-center justify-end gap-1.5">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs"
                                        onClick={() => openConfirm('auto_archive', [fakeRow])}
                                        title="Auto-archive future emails via Gmail filter"
                                      >
                                        <Archive className="w-3 h-3 mr-1" />
                                        Archive
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        className="h-7 text-xs"
                                        onClick={() => openConfirm('report_spam', [fakeRow])}
                                      >
                                        <AlertTriangle className="w-3 h-3 mr-1" />
                                        Spam
                                      </Button>
                                    </div>
                                  );
                                })()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              );
            })()}

            {/* ── Manual opt-out replies ────────────────────────────────────── */}
            {optOutSenders.length === 0 && recentUnsubscribes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center rounded-xl border border-border bg-card">
                <MailX className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm font-medium">No opt-out activity on record</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Unsubscribe actions you take here are monitored automatically.
                  Manual replies asking senders to stop will also appear here.
                </p>
              </div>
            ) : optOutSenders.length === 0 ? null : (
              <>
                {/* Summary chips */}
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <MailX className="w-3.5 h-3.5" />
                    <span>
                      <strong className="text-foreground">{optOutSenders.length}</strong>{' '}
                      opt-out {optOutSenders.length !== 1 ? 'requests' : 'request'} sent
                    </span>
                  </div>
                  {stillSendingCount > 0 && (
                    <div className="flex items-center gap-1.5 text-red-600">
                      <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                      <strong>{stillSendingCount}</strong>
                      {' '}still sending
                    </div>
                  )}
                  {optOutSenders.filter((s) => s.resolution === 'went_quiet').length > 0 && (
                    <div className="flex items-center gap-1.5 text-amber-600">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      <strong>{optOutSenders.filter((s) => s.resolution === 'went_quiet').length}</strong>
                      {' '}went quiet
                    </div>
                  )}
                  {optOutSenders.filter((s) => s.resolution === 'unsubscribed').length > 0 && (
                    <div className="flex items-center gap-1.5 text-green-600">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <strong>{optOutSenders.filter((s) => s.resolution === 'unsubscribed').length}</strong>
                      {' '}formally unsubscribed
                    </div>
                  )}
                </div>

                {/* Opt-out table */}
                <Card>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border bg-muted/30 rounded-t-lg">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">Sender</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Asked to stop</th>
                          <th className="px-4 py-3 text-right font-medium text-muted-foreground hidden lg:table-cell">Emails since</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                          <th className="px-4 py-3 w-36" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {[...optOutSenders]
                          .sort((a, b) => {
                            const order = { still_sending: 0, went_quiet: 1, unsubscribed: 2 };
                            return (order[a.resolution ?? 'went_quiet'] ?? 1) - (order[b.resolution ?? 'went_quiet'] ?? 1);
                          })
                          .map((sender, i) => (
                            <OptOutRow
                              key={`${sender.sender_email}-${i}`}
                              sender={sender}
                              onUnsubscribe={() => openConfirm('unsubscribe', [optOutToSenderRow(sender)])}
                              onAutoArchive={() => openConfirm('auto_archive', [optOutToSenderRow(sender)])}
                              isPending={isPending}
                            />
                          ))
                        }
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                <p className="text-xs text-muted-foreground">
                  &ldquo;Went quiet&rdquo; means no emails received after your opt-out reply.
                  &ldquo;Still sending&rdquo; means emails arrived after you asked them to stop.
                </p>
              </>
            )}
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

          {/* AI-generated weekly noise briefing — only shown when available */}
          {briefing && (
            <NoiseBriefingCard
              briefing={briefing}
              totalTrashed={initialSenders
                .filter((s) => NOISE_CATEGORIES.has(s.category))
                .reduce((n, s) => n + (s.emails_deleted ?? 0), 0)}
              onAction={() => setActiveCategory('never_engage')}
            />
          )}

          {/* New sender digest (screener) */}
          {screenerEnabled && screenerQueue.length > 0 && (
            <div className="px-6 pt-3">
              <NewSenderDigest
                initialQueue={screenerQueue}
                screenerEnabled={screenerEnabled}
              />
            </div>
          )}


          {/* Secondary filter chips — category cross-cuts */}
          {activeCategory !== 'opt_outs' && (() => {
            const SECONDARY_CATS = [
              { key: 'lapsed',           label: '📉 Lapsed'          },
              { key: 'still_receiving',  label: 'Still Receiving'     },
              { key: 'high_delete_rate', label: '🗑 High delete rate' },
            ];
            const hasCats = SECONDARY_CATS.some(({ key }) => categoryCount(key) > 0);
            if (!hasCats) return null;
            return (
              <div className="px-6 pb-2 shrink-0 flex gap-1 flex-wrap">
                {SECONDARY_CATS.map(({ key, label }) => {
                  const count  = categoryCount(key);
                  if (count === 0) return null;
                  const active = activeCategory === key;
                  return (
                    <button
                      key={key}
                      onClick={() => { setActiveCategory(key); setSelected(new Set()); }}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border',
                        active
                          ? 'bg-primary/10 text-primary border-primary/30'
                          : 'text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground',
                      )}
                    >
                      {label}
                      <span className={cn('text-[10px] px-1 py-0.5 rounded-full', active ? 'bg-primary/20' : 'bg-muted')}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })()}


          {/* Sender table — hidden when Opt-outs is selected */}
          {activeCategory !== 'opt_outs' && <div className="flex-1 overflow-auto">
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
                  {(() => {
                    function SortTh({ col, label, align = 'right', className }: { col: typeof sortKey; label: string; align?: 'left' | 'right'; className?: string }) {
                      const active = sortKey === col;
                      function handleClick() {
                        if (active) setSortDir((d) => d === 'desc' ? 'asc' : 'desc');
                        else { setSortKey(col); setSortDir('desc'); }
                      }
                      return (
                        <th
                          className={cn('px-4 py-3 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors', align === 'right' ? 'text-right' : 'text-left', className)}
                          onClick={handleClick}
                        >
                          <span className="inline-flex items-center gap-1" style={{ justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
                            {label}
                            {active
                              ? (sortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)
                              : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                          </span>
                        </th>
                      );
                    }
                    return (
                      <>
                        <SortTh col="name"       label="Sender"    align="left" />
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Category</th>
                        <SortTh col="volume"     label="Emails"                 className="hidden lg:table-cell" />
                        <SortTh col="trashed"    label="Trashed"                className="hidden lg:table-cell" />
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground hidden lg:table-cell">Replies</th>
                        <SortTh col="open_rate"  label="Open rate"              className="hidden lg:table-cell" />
                        <SortTh col="last_email" label="Last Email" align="left" className="hidden xl:table-cell" />
                      </>
                    );
                  })()}
                  <th className="px-4 py-3 w-32" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredSenders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center text-muted-foreground text-sm">
                      No senders in this category.
                    </td>
                  </tr>
                ) : groupByDomainOn ? (
                  groupByDomain(filteredSenders, sortKey, sortDir).map((group) => {
                    // Single-sender domain — no grouping chrome needed, render flat
                    if (group.senders.length === 1) {
                      const s = group.senders[0];
                      return (
                        <SenderTableRow
                          key={s.id}
                          sender={s}
                          isSelected={selected.has(s.sender_email)}
                          onToggle={() => toggleRow(s.sender_email)}
                          onAction={(action) => openConfirm(action, [s])}
                          typeStats={typeStatsBySender[s.sender_email]}
                          isPending={isPending}
                          aiDescription={aiDescriptions[s.sender_email]}
                          triageActivity={triageBySender[s.sender_email]}
                          openCommitments={protectedContacts.get(s.sender_email)}
                          userDomain={userDomain}
                        />
                      );
                    }
                    return (
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
                        typeStatsBySender={typeStatsBySender}
                        isPending={isPending}
                        protectedContacts={protectedContacts}
                        userDomain={userDomain}
                      />
                    );
                  })
                ) : (
                  filteredSenders.map((sender) => (
                    <SenderTableRow
                      key={sender.id}
                      sender={sender}
                      isSelected={selected.has(sender.sender_email)}
                      onToggle={() => toggleRow(sender.sender_email)}
                      onAction={(action) => openConfirm(action, [sender])}
                      typeStats={typeStatsBySender[sender.sender_email]}
                      isPending={isPending}
                      aiDescription={aiDescriptions[sender.sender_email]}
                      triageActivity={triageBySender[sender.sender_email]}
                      openCommitments={protectedContacts.get(sender.sender_email)}
                      userDomain={userDomain}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>}

          {/* Confirmation modal */}
          {confirmState && (
            <ConfirmModal
              state={confirmState}
              isPending={isPending}
              onConfirm={handleConfirmWithScan}
              onClose={() => setConfirmState(null)}
              onToggleDeleteExisting={(v) => setConfirmState((prev) =>
                prev ? { ...prev, deleteExisting: v, olderThanDays: v ? (prev.olderThanDays ?? 90) : null } : prev
              )}
              onChangeOlderThanDays={(v) => setConfirmState((prev) => prev ? { ...prev, olderThanDays: v } : prev)}
              protectedContacts={protectedContacts}
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

          {/* Safety scan modal (bulk delete with multiple senders) */}
          {scanState && (
            <SafetyScanModal
              senderEmails={scanState.senders.map((s) => s.sender_email)}
              olderThanDays={scanState.olderThanDays}
              emailCount={scanState.senders.reduce((n, s) => n + s.emails_received, 0)}
              onConfirm={() => {
                const { senders, action, deleteExisting, olderThanDays } = scanState;
                setScanState(null);
                executeAction(action, senders, deleteExisting, olderThanDays);
              }}
              onClose={() => setScanState(null)}
            />
          )}
        </>
      )}

      {/* ── Floating bulk action bar ─────────────────────────────────────────── */}
      {selected.size > 0 && activeTab === 'senders' && (
        <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center gap-3 px-6 py-3 bg-card border-t border-border shadow-2xl">
          <span className="text-sm font-semibold tabular-nums shrink-0">
            {selected.size} sender{selected.size !== 1 ? 's' : ''} selected
          </span>
          <div className="w-px h-5 bg-border shrink-0" />
          <div className="flex items-center gap-2 flex-1 flex-wrap">
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
              Delete emails
              {isFree && selected.size > 1 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">Pro</Badge>}
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
            className="shrink-0 ml-auto"
            aria-label="Clear selection"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ── DomainGroupRow ────────────────────────────────────────────────────────────

function DomainGroupRow({
  group, isExpanded, onToggleExpand, selected, onToggleRow, onAction, typeStatsBySender, isPending,
  protectedContacts, userDomain,
}: {
  group:               DomainGroup;
  isExpanded:          boolean;
  onToggleExpand:      () => void;
  selected:            Set<string>;
  onToggleRow:         (email: string) => void;
  onAction:            (action: string, senders: SenderRow[]) => void;
  typeStatsBySender?:  Record<string, EmailTypeStat[]>;
  isPending:           boolean;
  protectedContacts?:  Map<string, number>;
  userDomain?:         string | null;
}) {
  const { data: session } = useSession();
  const gmailAcct = session?.user?.email ? encodeURIComponent(session.user.email) : '0';
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
            <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0', isExpanded && 'rotate-180')} />
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
        <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">
          {(() => {
            const totalDeleted = group.senders.reduce((n, s) => n + (s.emails_deleted ?? 0), 0);
            const pct = group.totalEmails > 0 ? Math.round((totalDeleted / group.totalEmails) * 100) : 0;
            if (totalDeleted === 0) return <span className="text-muted-foreground">—</span>;
            return (
              <span className={cn('tabular-nums', pct >= 50 ? 'text-red-500' : pct >= 20 ? 'text-amber-500' : 'text-muted-foreground')}>
                {totalDeleted.toLocaleString()}
                <span className="text-xs ml-1">({pct}%)</span>
              </span>
            );
          })()}
        </td>
        <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">
          {(() => {
            const totalReplied = group.senders.reduce((n, s) => n + (s.emails_replied ?? 0), 0);
            if (totalReplied === 0) return <span className="text-muted-foreground">—</span>;
            return <span className="text-green-600 font-medium">{totalReplied.toLocaleString()}</span>;
          })()}
        </td>
        <td className="px-4 py-3 text-right hidden lg:table-cell">
          <span className={cn('font-medium tabular-nums', engagementColor(group.maxEngagement))}>
            {Math.round(group.maxEngagement * 100)}%
          </span>
        </td>
        <td className="hidden xl:table-cell" />
        {/* Bulk action for the whole domain (non-transactional only) */}
        <td className="px-4 py-3 w-32">
          {nonTransact.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={isPending} aria-label={`Actions for ${group.domain}`}>
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
        <tr key={sender.id} className={cn('hover:bg-muted/20 transition-colors border-l-2 border-primary/20', selected.has(sender.sender_email) && 'bg-primary/5')}>
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
              {(protectedContacts?.get(sender.sender_email) ?? 0) > 0 && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-0.5 w-fit"
                  title={`${protectedContacts!.get(sender.sender_email)} open commitment${protectedContacts!.get(sender.sender_email) !== 1 ? 's' : ''} — take care before archiving`}
                >
                  <Pin className="w-2.5 h-2.5" />
                  {protectedContacts!.get(sender.sender_email)} open
                </span>
              )}
            </div>
          </td>
          <td className="px-4 py-2.5 hidden md:table-cell">
            <CategoryBadge category={sender.category} />
            {sender.category === 'transactional' && (
              <span className="ml-1 text-xs text-muted-foreground" title="Protected from bulk actions">🔒</span>
            )}
            {isInternal(sender, userDomain) && (
              <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200">
                Internal
              </span>
            )}
          </td>
          <td className="px-4 py-2.5 text-right tabular-nums text-sm hidden lg:table-cell">
            {sender.emails_received.toLocaleString()}
          </td>
          <td className="px-4 py-2.5 text-right tabular-nums text-sm hidden lg:table-cell">
            {(() => {
              const d = sender.emails_deleted ?? 0;
              const pct = sender.emails_received > 0 ? Math.round((d / sender.emails_received) * 100) : 0;
              if (d === 0) return <span className="text-muted-foreground">—</span>;
              return (
                <span className={pct >= 50 ? 'text-red-500' : pct >= 20 ? 'text-amber-500' : 'text-muted-foreground'}>
                  {d.toLocaleString()}
                  <span className="text-xs ml-1">({pct}%)</span>
                </span>
              );
            })()}
          </td>
          <td className="px-4 py-2.5 text-right tabular-nums text-sm hidden lg:table-cell">
            {(sender.emails_replied ?? 0) === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className="text-green-600 font-medium">{sender.emails_replied.toLocaleString()}</span>
            )}
          </td>
          <td className="px-4 py-2.5 text-right hidden lg:table-cell">
            <div className={cn('text-sm font-medium tabular-nums', engagementColor(sender.engagement_rate ?? 0))}>
              {Math.round((sender.engagement_rate ?? 0) * 100)}%
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {sender.emails_opened.toLocaleString()} of {sender.emails_received.toLocaleString()}
            </div>
          </td>
          <td className="px-4 py-2.5 text-muted-foreground text-sm hidden xl:table-cell">
            {formatDate(sender.last_email_date)}
          </td>
          <td className="px-4 py-2.5 w-32">
            <div className="flex items-center gap-1">
              <SenderTypeHoverCard sender={sender} typeStats={typeStatsBySender?.[sender.sender_email]} size="sm" />
              <a
                href={`https://mail.google.com/mail/u/${gmailAcct}/#search/from:${encodeURIComponent(sender.sender_email)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="View in Gmail"
                aria-label="View in Gmail"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={isPending} title="More actions" aria-label="More actions">
                    <MoreHorizontal className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {sender.has_unsubscribe_header && sender.unsubscribe_status !== 'unsubscribed' && (
                    <DropdownMenuItem onClick={() => onAction('unsubscribe', [sender])}>
                      <MailX className="w-3.5 h-3.5 mr-2" />
                      Unsubscribe
                    </DropdownMenuItem>
                  )}
                  {sender.unsubscribe_status === 'unsubscribed' && (
                    <DropdownMenuItem onClick={() => onAction('resubscribe', [sender])}>
                      <Undo2 className="w-3.5 h-3.5 mr-2" />
                      Resubscribe
                    </DropdownMenuItem>
                  )}
                  {!sender.auto_archive_enabled ? (
                    <DropdownMenuItem onClick={() => onAction('auto_archive', [sender])}>
                      <Archive className="w-3.5 h-3.5 mr-2" />
                      Auto-archive
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => onAction('remove_auto_archive', [sender])}>
                      <Filter className="w-3.5 h-3.5 mr-2" />
                      Remove Auto-archive
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onAction('ignore', [sender])}>
                    <BellOff className="w-3.5 h-3.5 mr-2" />
                    Hide from Report
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600"
                    onClick={() => onAction('bulk_delete', [sender])}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    Delete All Emails
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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

// ── SenderTypeHoverCard ───────────────────────────────────────────────────────

const TYPE_META: Record<string, { icon: string; label: string }> = {
  receipt:    { icon: '📦', label: 'Receipts'    },
  newsletter: { icon: '📰', label: 'Newsletters' },
  promotion:  { icon: '🔥', label: 'Promotions'  },
  alert:      { icon: '🔔', label: 'Alerts'      },
  social:     { icon: '👥', label: 'Social'      },
  update:     { icon: '🔄', label: 'Updates'     },
  personal:   { icon: '👤', label: 'Personal'    },
};

function SenderTypeHoverCard({ sender, typeStats, size = 'md' }: {
  sender:     SenderRow;
  typeStats?: EmailTypeStat[];
  size?:      'sm' | 'md';
}) {
  const dim = size === 'sm' ? 'h-6 w-6' : 'h-7 w-7';
  const icon = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  const deleted  = sender.emails_deleted ?? 0;
  const received = sender.emails_received || 1;
  const openPct  = Math.round((sender.engagement_rate ?? 0) * 100);
  const trashPct = Math.round((deleted / received) * 100);
  const sorted   = typeStats ? [...typeStats].sort((a, b) => b.email_count - a.email_count) : [];

  return (
    <HoverCard openDelay={250} closeDelay={100}>
      <HoverCardTrigger asChild>
        <Button
          variant="ghost" size="sm"
          className={cn(dim, 'p-0 text-muted-foreground hover:text-foreground')}
          aria-label="Sender details"
        >
          <Info className={icon} />
        </Button>
      </HoverCardTrigger>
      <HoverCardContent className="w-60 p-3" side="left" align="center">
        <div className="space-y-2.5">
          {/* Stats row */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span><span className="font-medium text-foreground">{sender.emails_received.toLocaleString()}</span> emails</span>
            <span><span className={cn('font-medium', openPct >= 30 ? 'text-green-600' : openPct >= 10 ? 'text-amber-600' : 'text-red-500')}>{openPct}%</span> open</span>
            {deleted > 0 && (
              <span><span className="font-medium text-amber-600">{trashPct}%</span> trashed</span>
            )}
          </div>
          {/* Type breakdown */}
          {sorted.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-border">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Email types</p>
              {sorted.map((stat) => {
                const meta    = TYPE_META[stat.email_type] ?? { icon: '📧', label: stat.email_type };
                const openPct = stat.email_count > 0 ? Math.round((stat.open_count / stat.email_count) * 100) : 0;
                const isNoisy = openPct < 10;
                const isKept  = openPct >= 50;
                return (
                  <div key={stat.email_type} className="flex items-center gap-2 text-xs">
                    <span className="w-4 shrink-0 text-center">{meta.icon}</span>
                    <span className="flex-1 text-foreground">{meta.label}</span>
                    <span className="tabular-nums text-muted-foreground shrink-0">{stat.email_count}</span>
                    <span className={cn(
                      'tabular-nums shrink-0 w-10 text-right',
                      isKept ? 'text-green-600' : isNoisy ? 'text-red-500' : 'text-amber-600',
                    )}>
                      {openPct}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

// ── OptOutRow helpers ─────────────────────────────────────────────────────────

/** Builds a minimal SenderRow from an OptOutSender so we can reuse the confirm modal. */
function optOutToSenderRow(s: OptOutSender): SenderRow {
  return {
    id:                      s.sender_email,
    sender_email:            s.sender_email,
    sender_name:             s.sender_name,
    sender_domain:           s.sender_domain,
    category:                s.category,
    emails_received:         0,
    emails_opened:           0,
    emails_starred:          0,
    emails_replied:          0,
    emails_deleted:          0,
    engagement_rate:         0,
    recent_engagement_rate:  null,
    last_email_date:         s.last_email_date,
    has_unsubscribe_header:  s.has_unsubscribe_header,
    unsubscribe_status:      s.unsubscribe_status,
    unsubscribed_at:         null,
    auto_archive_enabled:    false,
    auto_archive_filter_id:  null,
    ignored:                 false,
    period_days:             30,
    updated_at:              null,
    emails_forwarded:        0,
    engagement_score:        null,
    opt_out_replied_at:      s.opt_out_replied_at,
    ai_description:          null,
  };
}

/** Builds a minimal SenderRow from a FailedUnsub so we can reuse the confirm modal. */
function failedUnsubToSenderRow(s: FailedUnsub): SenderRow {
  return {
    id:                      s.sender_email,
    sender_email:            s.sender_email,
    sender_name:             s.sender_name,
    sender_domain:           s.sender_domain,
    category:                s.category,
    emails_received:         s.emails_received,
    emails_opened:           0,
    emails_starred:          0,
    emails_replied:          0,
    emails_deleted:          0,
    engagement_rate:         0,
    recent_engagement_rate:  null,
    last_email_date:         s.last_email_date,
    has_unsubscribe_header:  false,
    unsubscribe_status:      'failed',
    unsubscribed_at:         null,
    auto_archive_enabled:    false,
    auto_archive_filter_id:  null,
    ignored:                 false,
    period_days:             30,
    updated_at:              null,
    emails_forwarded:        0,
    engagement_score:        null,
    opt_out_replied_at:      null,
    ai_description:          null,
  };
}

// ── OptOutRow ─────────────────────────────────────────────────────────────────

function OptOutRow({
  sender,
  onUnsubscribe,
  onAutoArchive,
  isPending,
}: {
  sender:         OptOutSender;
  onUnsubscribe:  () => void;
  onAutoArchive:  () => void;
  isPending:      boolean;
}) {
  const resolution = sender.resolution ?? 'went_quiet';

  const resolutionBadge =
    resolution === 'still_sending' ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 border border-red-200">
        <TriangleAlert className="w-3 h-3" />
        Still sending
      </span>
    ) : resolution === 'unsubscribed' ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 border border-green-200">
        <CheckCircle2 className="w-3 h-3" />
        Unsubscribed
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 border border-amber-200">
        <CheckCircle2 className="w-3 h-3" />
        Went quiet
      </span>
    );

  return (
    <tr className="hover:bg-muted/30 transition-colors">
      {/* Sender */}
      <td className="px-4 py-3 max-w-xs">
        <div className="flex flex-col">
          <span className="font-medium truncate">{sender.sender_name || sender.sender_email}</span>
          {sender.sender_name && (
            <span className="text-xs text-muted-foreground truncate">{sender.sender_email}</span>
          )}
        </div>
      </td>

      {/* Date asked to stop */}
      <td className="px-4 py-3 text-muted-foreground text-sm hidden md:table-cell">
        {formatDate(sender.opt_out_replied_at)}
      </td>

      {/* Emails received since opt-out */}
      <td className="px-4 py-3 text-right hidden lg:table-cell">
        {sender.emails_since_optout > 0 ? (
          <span className="text-red-600 font-medium tabular-nums">
            {sender.emails_since_optout.toLocaleString()}
          </span>
        ) : (
          <span className="text-muted-foreground tabular-nums">0</span>
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-3">{resolutionBadge}</td>

      {/* Action */}
      <td className="px-4 py-3">
        {resolution === 'still_sending' && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {sender.has_unsubscribe_header && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300"
                onClick={onUnsubscribe}
                disabled={isPending}
              >
                <MailX className="w-3 h-3 mr-1.5" />
                Unsubscribe
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={onAutoArchive}
              disabled={isPending}
              title="Create a Gmail filter to auto-archive future emails from this sender"
            >
              <Archive className="w-3 h-3 mr-1.5" />
              Auto-archive
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}


// ── PageHeader (used by empty states) ─────────────────────────────────────────

function PageHeader() {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
      <div>
        <h1 className="text-xl font-semibold">Inbox Cleaner</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Understand and reduce inbox noise</p>
      </div>
    </div>
  );
}

// ── NoiseBriefingCard ─────────────────────────────────────────────────────────

function NoiseBriefingCard({
  briefing,
  totalTrashed,
  onAction,
}: {
  briefing:      NoiseBriefing;
  totalTrashed?: number;
  onAction:      () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const age = briefing.generated_at ? formatRelative(briefing.generated_at) : null;

  return (
    <div className="mx-6 mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4 shrink-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold">{briefing.headline}</p>
              {age && <span suppressHydrationWarning className="text-xs text-muted-foreground">{age}</span>}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{briefing.summary}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
              <span>
                <strong className="text-foreground">{briefing.stats.recent_noise_senders}</strong> noise senders
              </span>
              <span>
                <strong className="text-foreground">{briefing.stats.recent_noise_emails.toLocaleString()}</strong> noise emails
              </span>
              {briefing.stats.can_unsubscribe > 0 && (
                <span>
                  <strong className="text-foreground">{briefing.stats.can_unsubscribe}</strong> can unsubscribe
                </span>
              )}
              {(totalTrashed ?? 0) > 0 && (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
                  <Trash2 className="w-3 h-3" />
                  <strong>{totalTrashed!.toLocaleString()}</strong> already trashed
                </span>
              )}
            </div>
            {briefing.proposed_action && (
              <p className="text-xs text-muted-foreground mt-1.5 italic">{briefing.proposed_action}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" onClick={onAction} className="h-7 text-xs">
            <Zap className="w-3 h-3 mr-1.5" />
            Clean Now
          </Button>
          <button
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss briefing"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
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
  typeStats,
  isPending,
  aiDescription,
  triageActivity,
  openCommitments,
  userDomain,
}: {
  sender:           SenderRow;
  isSelected:       boolean;
  onToggle:         () => void;
  onAction:         (action: string) => void;
  typeStats?:       EmailTypeStat[];
  isPending:        boolean;
  aiDescription?:   string;
  triageActivity?:  { reply_count: number; dismiss_count: number };
  openCommitments?: number;
  userDomain?:      string | null;
}) {
  const { data: session } = useSession();
  const gmailAcct = session?.user?.email ? encodeURIComponent(session.user.email) : '0';
  const engRate    = Math.round((sender.engagement_rate ?? 0) * 100);
  const deleted    = sender.emails_deleted ?? 0;
  const received   = sender.emails_received || 1;
  const deleteRate = deleted / received;
  const trashColor = deleteRate >= 0.50
    ? 'text-red-500'
    : deleteRate >= 0.20
      ? 'text-amber-500'
      : 'text-muted-foreground';

  return (
    <>
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
          {aiDescription && (
            <span className="text-xs text-muted-foreground/70 italic truncate mt-0.5">{aiDescription}</span>
          )}
          {openCommitments && openCommitments > 0 && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-0.5 w-fit"
              title={`${openCommitments} open commitment${openCommitments !== 1 ? 's' : ''} — take care before archiving`}
            >
              <Pin className="w-2.5 h-2.5" />
              {openCommitments} open
            </span>
          )}
          {triageActivity && triageActivity.reply_count > 0 && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 mt-0.5 w-fit"
              title={`Replied ${triageActivity.reply_count}× in Gmail triage`}
            >
              <ListChecks className="w-2.5 h-2.5" />
              replied {triageActivity.reply_count}×
            </span>
          )}
          {isStillReceiving(sender) && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5 mt-0.5 w-fit"
              title="Still receiving emails after unsubscribing — consider marking as spam"
            >
              <TriangleAlert className="w-2.5 h-2.5" />
              still sending
            </span>
          )}
          {sender.unsubscribe_status === 'unsubscribed' && !isStillReceiving(sender) && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5 mt-0.5 w-fit"
            >
              <CheckCircle2 className="w-2.5 h-2.5" />
              unsubscribed
            </span>
          )}
        </div>
        {/* Mobile-only: show category inline */}
        <div className="mt-1 md:hidden flex items-center gap-1 flex-wrap">
          <CategoryBadge category={sender.category} />
          {isInternal(sender, userDomain) && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200">
              Internal
            </span>
          )}
        </div>
      </td>

      {/* Category */}
      <td className="px-4 py-3 hidden md:table-cell">
        <CategoryBadge category={sender.category} />
        {isInternal(sender, userDomain) && (
          <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200">
            Internal
          </span>
        )}
      </td>

      {/* Emails */}
      <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">
        {sender.emails_received.toLocaleString()}
      </td>

      {/* Trashed */}
      <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">
        {deleted === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span
            className={cn('tabular-nums', trashColor)}
            title={`${Math.round(deleteRate * 100)}% of emails trashed`}
          >
            {deleted.toLocaleString()}
            <span className="text-xs ml-1">({Math.round(deleteRate * 100)}%)</span>
          </span>
        )}
      </td>

      {/* Replies */}
      <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">
        {(sender.emails_replied ?? 0) === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="text-green-600 font-medium tabular-nums" title="Emails you've replied to from this sender">
            {sender.emails_replied.toLocaleString()}
          </span>
        )}
      </td>

      {/* Engagement */}
      <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">
        {sender.emails_opened === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={cn('tabular-nums', engagementColor(sender.engagement_rate ?? 0))}>
            {sender.emails_opened.toLocaleString()}
            <span className="text-xs ml-1">({engRate}%)</span>
          </span>
        )}
      </td>

      {/* Last Email */}
      <td className="px-4 py-3 text-muted-foreground hidden xl:table-cell">
        {formatDate(sender.last_email_date)}
      </td>


      {/* Actions */}
      <td className="px-4 py-3 w-32">
        <div className="flex items-center gap-1">
          <SenderTypeHoverCard sender={sender} typeStats={typeStats} size="md" />
          <a
            href={`https://mail.google.com/mail/u/${gmailAcct}/#search/from:${encodeURIComponent(sender.sender_email)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="View in Gmail"
            aria-label="View in Gmail"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={isPending} title="More actions" aria-label="More actions">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {sender.has_unsubscribe_header && sender.unsubscribe_status !== 'unsubscribed' && (
                <DropdownMenuItem onClick={() => onAction('unsubscribe')}>
                  <MailX className="w-3.5 h-3.5 mr-2" />
                  Unsubscribe
                </DropdownMenuItem>
              )}
              {sender.unsubscribe_status === 'unsubscribed' && (
                <DropdownMenuItem onClick={() => onAction('resubscribe')}>
                  <Undo2 className="w-3.5 h-3.5 mr-2" />
                  Resubscribe
                </DropdownMenuItem>
              )}
              {!sender.auto_archive_enabled ? (
                <DropdownMenuItem onClick={() => onAction('auto_archive')}>
                  <Archive className="w-3.5 h-3.5 mr-2" />
                  Auto-archive
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => onAction('remove_auto_archive')}>
                  <Filter className="w-3.5 h-3.5 mr-2" />
                  Remove Auto-archive
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onAction('add_to_bundle')}>
                <Package className="w-3.5 h-3.5 mr-2" />
                Add to Bundle
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAction('ignore')}>
                <BellOff className="w-3.5 h-3.5 mr-2" />
                Hide from Report
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                onClick={() => onAction('bulk_delete')}
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" />
                Delete All Emails
              </DropdownMenuItem>
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

    </>
  );
}
