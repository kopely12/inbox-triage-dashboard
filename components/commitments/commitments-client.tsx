'use client';

import { useState, useTransition } from 'react';
import Link             from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Search, Plus, ArrowUpDown, CheckCheck, X, Loader2, Check, Download, Clock } from 'lucide-react';
import { bulkMarkDone, bulkDismiss, bulkSnooze } from '@/app/actions/commitments';
import { CommitmentRow }        from './commitment-row';
import { CommitmentDetailDialog } from './commitment-detail-dialog';
import { CreateCommitmentDialog } from './create-commitment-dialog';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

export type Commitment = {
  id:                 string;
  thread_id:          string | null;
  direction:          'outgoing' | 'assigned';
  description:        string;
  status:             string;
  due_date:           string | null;
  scanned_at:         string;
  resolved_at:        string | null;
  counterparty:       string | null;
  counterparty_email: string | null;
  note:               string | null;
  priority:           'high' | 'medium' | 'low' | null;
  blocked:            boolean | null;
};

export type StatusFilter    = 'open' | 'overdue' | 'done' | 'dismissed';
export type DirectionFilter = 'all' | 'outgoing' | 'assigned';
export type SortOption      = 'newest' | 'due' | 'counterparty';

interface Props {
  commitments:    Commitment[];
  queryError:     string | null;
  counts:         { open: number; overdue: number; done: number; dismissed: number };
  totalCount:     number;
  pageNum:        number;
  totalPages:     number;
  validStatus:    StatusFilter;
  validDirection: DirectionFilter;
  validSort:      SortOption;
  todayStr:       string;
}

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: 'newest',      label: 'Newest first' },
  { key: 'due',         label: 'Due date'     },
  { key: 'counterparty', label: 'Counterparty' },
];

// ── CommitmentsClient ─────────────────────────────────────────────────────────

export function CommitmentsClient({
  commitments, queryError, counts, totalCount, pageNum, totalPages,
  validStatus, validDirection, validSort, todayStr,
}: Props) {
  const searchParams = useSearchParams();
  const [query,               setQuery]              = useState(() => searchParams.get('q') ?? '');
  const [selected,            setSelected]           = useState<Set<string>>(new Set());
  const [optimisticDone,      setOptimisticDone]     = useState<Set<string>>(new Set());
  const [optimisticDismissed, setOptimisticDismissed] = useState<Set<string>>(new Set());
  const [detailItem,          setDetailItem]         = useState<Commitment | null>(null);
  const [showCreate,          setShowCreate]         = useState(false);
  const [showSnooze,          setShowSnooze]         = useState(false);
  const [bulkPending,         startBulkTransition]   = useTransition();
  const [snoozePending,       startSnoozeTransition] = useTransition();

  // ── URL builder ───────────────────────────────────────────────────────────────
  function buildUrl(overrides: Partial<Record<'status' | 'direction' | 'sort' | 'page', string>>) {
    return `/commitments?${new URLSearchParams({
      status:    validStatus,
      direction: validDirection,
      sort:      validSort,
      ...overrides,
    })}`;
  }

  // When switching to the overdue tab from the default sort, pivot to due-date order.
  function tabHref(key: StatusFilter) {
    const targetSort = (key === 'overdue' && validSort === 'newest') ? 'due' : validSort;
    return buildUrl({ status: key, sort: targetSort, page: '1' });
  }

  // ── Client-side filtering ─────────────────────────────────────────────────────
  const q = query.toLowerCase().trim();
  const visible = commitments.filter((c) => {
    if (optimisticDone.has(c.id)      && validStatus !== 'done')      return false;
    if (optimisticDismissed.has(c.id) && validStatus !== 'dismissed') return false;
    if (!q) return true;
    return (
      c.description.toLowerCase().includes(q) ||
      (c.counterparty       ?? '').toLowerCase().includes(q) ||
      (c.counterparty_email ?? '').toLowerCase().includes(q) ||
      (c.note               ?? '').toLowerCase().includes(q)
    );
  });

  // ── Optimistic callbacks ──────────────────────────────────────────────────────
  function onOptimisticDone(id: string) {
    setOptimisticDone((prev) => new Set(prev).add(id));
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }
  function onOptimisticDismiss(id: string) {
    setOptimisticDismissed((prev) => new Set(prev).add(id));
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }
  function onUndoOptimistic(id: string) {
    setOptimisticDone((prev)      => { const n = new Set(prev); n.delete(id); return n; });
    setOptimisticDismissed((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────────
  const selectedIds       = [...selected];
  const allVisibleIds     = visible.map((c) => c.id);
  const allVisibleSelected = visible.length > 0 && allVisibleIds.every((id) => selected.has(id));

  function toggleAll() {
    if (allVisibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allVisibleIds));
    }
  }

  function handleBulkDone() {
    if (selectedIds.length === 0) return;
    const snapshot = [...selectedIds];
    const newDone  = new Set(optimisticDone);
    snapshot.forEach((id) => newDone.add(id));
    setOptimisticDone(newDone);
    setSelected(new Set());

    startBulkTransition(async () => {
      const result = await bulkMarkDone(snapshot);
      if (result?.error) {
        setOptimisticDone((prev) => {
          const rolled = new Set(prev);
          snapshot.forEach((id) => rolled.delete(id));
          return rolled;
        });
        toast.error(result.error);
      } else {
        toast.success(`Marked ${snapshot.length} done`);
      }
    });
  }

  function handleBulkDismiss() {
    if (selectedIds.length === 0) return;
    const snapshot     = [...selectedIds];
    const newDismissed = new Set(optimisticDismissed);
    snapshot.forEach((id) => newDismissed.add(id));
    setOptimisticDismissed(newDismissed);
    setSelected(new Set());

    startBulkTransition(async () => {
      const result = await bulkDismiss(snapshot);
      if (result?.error) {
        setOptimisticDismissed((prev) => {
          const rolled = new Set(prev);
          snapshot.forEach((id) => rolled.delete(id));
          return rolled;
        });
        toast.error(result.error);
      } else {
        toast.success(`Dismissed ${snapshot.length}`);
      }
    });
  }

  function handleBulkSnooze(dateVal: string) {
    if (selectedIds.length === 0 || !dateVal) return;
    const snapshot = [...selectedIds];
    setSelected(new Set());
    setShowSnooze(false);

    startSnoozeTransition(async () => {
      const result = await bulkSnooze(snapshot, dateVal);
      if (result?.error) {
        toast.error(result.error);
      } else {
        const label = new Date(dateVal + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
        });
        toast.success(`Snoozed ${snapshot.length} until ${label}`);
      }
    });
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────────
  const tabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'open',      label: 'Open',      count: counts.open      },
    { key: 'overdue',   label: 'Overdue',   count: counts.overdue   },
    { key: 'done',      label: 'Done',      count: counts.done      },
    { key: 'dismissed', label: 'Dismissed', count: counts.dismissed },
  ];

  const from = (pageNum - 1) * 50;
  const to   = Math.min(from + 50, totalCount);

  return (
    <div className="max-w-4xl space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Commitments</h2>
          <p className="text-sm text-muted-foreground">
            Promises and tasks tracked from your inbox.
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            title="Export current view as CSV"
            className="text-muted-foreground"
          >
            <Link
              href={`/api/commitments/export?${new URLSearchParams({
                status:    validStatus,
                direction: validDirection,
              })}`}
            >
              <Download className="w-3.5 h-3.5" />
            </Link>
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Status tabs */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-muted">
          {tabs.map(({ key, label, count }) => (
            <Link
              key={key}
              href={tabHref(key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors',
                validStatus === key
                  ? 'bg-background text-foreground shadow-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
              <span className={cn(
                'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                validStatus === key ? 'bg-muted' : '',
                key === 'overdue' && count > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
              )}>
                {count}
              </span>
            </Link>
          ))}
        </div>

        {/* Direction + Sort */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {(['all', 'outgoing', 'assigned'] as DirectionFilter[]).map((d) => (
              <Link
                key={d}
                href={buildUrl({ direction: d, page: '1' })}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs transition-colors',
                  validDirection === d
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
              >
                {d === 'all' ? 'Both' : d === 'outgoing' ? 'My promises' : 'Assigned to me'}
              </Link>
            ))}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowUpDown className="w-3 h-3" />
                {SORT_OPTIONS.find((o) => o.key === validSort)?.label ?? 'Sort'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SORT_OPTIONS.map(({ key, label }) => (
                <DropdownMenuItem key={key} asChild>
                  <Link href={buildUrl({ sort: key, page: '1' })} className="flex items-center gap-2">
                    <span className="w-3.5 shrink-0 flex items-center">
                      {validSort === key && <Check className="w-3 h-3" />}
                    </span>
                    {label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Search + bulk actions */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search commitments…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        {selectedIds.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {selectedIds.length} selected
            </span>
            {validStatus !== 'done' && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 h-8"
                onClick={handleBulkDone}
                disabled={bulkPending || snoozePending}
              >
                {bulkPending
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <CheckCheck className="w-3 h-3" />}
                Mark done
              </Button>
            )}
            {(validStatus === 'open' || validStatus === 'overdue') && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 h-8 text-muted-foreground"
                onClick={() => setShowSnooze((v) => !v)}
                disabled={bulkPending || snoozePending}
              >
                {snoozePending
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Clock className="w-3 h-3" />}
                Snooze
              </Button>
            )}
            {validStatus !== 'dismissed' && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 h-8 text-muted-foreground"
                onClick={handleBulkDismiss}
                disabled={bulkPending || snoozePending}
              >
                {bulkPending
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <X className="w-3 h-3" />}
                Dismiss
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Inline snooze picker */}
      {showSnooze && selectedIds.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-muted/50 text-sm">
          <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Snooze {selectedIds.length} until:
          </span>
          <input
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            onChange={(e) => {
              if (e.target.value) handleBulkSnooze(e.target.value);
            }}
          />
          <button
            onClick={() => setShowSnooze(false)}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Table */}
      <Card>
        {queryError ? (
          <CardContent className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <p className="text-sm font-medium text-destructive">Failed to load commitments</p>
            <p className="text-xs text-muted-foreground font-mono">{queryError}</p>
          </CardContent>
        ) : visible.length === 0 && !q ? (
          <CardContent className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <p className="text-sm font-medium">
              {validStatus === 'open'      ? 'No open commitments'          :
               validStatus === 'overdue'   ? 'Nothing overdue — great job!' :
               validStatus === 'done'      ? 'No resolved commitments yet'  :
               'No dismissed commitments'}
            </p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {validStatus === 'open'
                ? 'Run a scan in the extension to detect promises from your emails, or add one manually.'
                : validStatus === 'dismissed'
                ? 'Dismissed items appear here and can be restored to open.'
                : 'Commitments appear here as the extension processes your inbox.'}
            </p>
            {validStatus === 'open' && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2 gap-1.5"
                onClick={() => setShowCreate(true)}
              >
                <Plus className="w-3.5 h-3.5" /> Add commitment
              </Button>
            )}
          </CardContent>
        ) : (
          <div className="divide-y divide-border">
            {/* Select-all header row */}
            {visible.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2 bg-muted/30">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAll}
                  className="w-3.5 h-3.5 rounded cursor-pointer accent-primary"
                  aria-label="Select all"
                />
                <span className="text-xs text-muted-foreground">
                  {q
                    ? `${visible.length} result${visible.length !== 1 ? 's' : ''}`
                    : `${totalCount} total`}
                </span>
              </div>
            )}

            {visible.map((c) => (
              <CommitmentRow
                key={c.id}
                commitment={c}
                todayStr={todayStr}
                selected={selected.has(c.id)}
                optimisticDone={optimisticDone.has(c.id)}
                optimisticDismissed={optimisticDismissed.has(c.id)}
                onSelect={(checked) =>
                  setSelected((prev) => {
                    const n = new Set(prev);
                    checked ? n.add(c.id) : n.delete(c.id);
                    return n;
                  })
                }
                onOpenDetail={() => setDetailItem(c)}
                onOptimisticDone={onOptimisticDone}
                onOptimisticDismiss={onOptimisticDismiss}
                onUndoOptimistic={onUndoOptimistic}
              />
            ))}

            {q && visible.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No results for &ldquo;{query}&rdquo;
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{from + 1}–{to} of {totalCount}</span>
          <div className="flex gap-2">
            {pageNum > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={buildUrl({ page: String(pageNum - 1) })}>Previous</Link>
              </Button>
            )}
            {pageNum < totalPages && (
              <Button asChild variant="outline" size="sm">
                <Link href={buildUrl({ page: String(pageNum + 1) })}>Next</Link>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <CommitmentDetailDialog
        commitment={detailItem}
        todayStr={todayStr}
        onClose={() => setDetailItem(null)}
      />
      <CreateCommitmentDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </div>
  );
}
