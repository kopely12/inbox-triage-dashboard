'use client';

import { useState, useTransition, useEffect, useRef, useMemo } from 'react';
import Link             from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  Search, Plus, CheckCheck, X, Loader2,
  Download, Clock, MoreHorizontal, CheckCircle2,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react';
import {
  bulkMarkDone, bulkDismiss, bulkSnooze,
  reopenCommitment, restoreCommitment,
  bulkMarkDoneWhere, bulkDismissWhere, bulkSnoozeWhere,
} from '@/app/actions/commitments';
import { CommitmentRow }         from './commitment-row';
import { CommitmentDetailDialog } from './commitment-detail-dialog';
import { CreateCommitmentDialog } from './create-commitment-dialog';
import {
  COL_WIDTH, COL_LABEL, DEFAULT_COLUMN_ORDER,
  type ColumnId,
} from './column-config';
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
  email_subject:      string | null;
};

export type StatusFilter    = 'open' | 'overdue' | 'done' | 'dismissed';
export type DirectionFilter = 'all' | 'outgoing' | 'assigned';
export type SortOption      = 'newest' | 'due' | 'counterparty';

/** All columns that support click-to-sort, including the non-draggable description column. */
type SortableColId = ColumnId | 'description';

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
  userEmail:      string | null;
}

// ── CommitmentsClient ─────────────────────────────────────────────────────────

export function CommitmentsClient({
  commitments, queryError, counts, totalCount, pageNum, totalPages,
  validStatus, validDirection, validSort, todayStr, userEmail,
}: Props) {
  const searchParams = useSearchParams();
  const router       = useRouter();

  const [query,               setQuery]              = useState(() => searchParams.get('q') ?? '');
  const [selected,            setSelected]           = useState<Set<string>>(new Set());
  const [selectAllPages,      setSelectAllPages]     = useState(false);
  const [optimisticDone,      setOptimisticDone]     = useState<Set<string>>(new Set());
  const [optimisticDismissed, setOptimisticDismissed] = useState<Set<string>>(new Set());
  const [detailItem,          setDetailItem]         = useState<Commitment | null>(null);
  const [showCreate,          setShowCreate]         = useState(false);
  const [showSnooze,          setShowSnooze]         = useState(false);
  const [bulkPending,         startBulkTransition]   = useTransition();
  const [snoozePending,       startSnoozeTransition] = useTransition();

  // ── Column order (draggable) + client-side sort ───────────────────────────────

  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(DEFAULT_COLUMN_ORDER);
  const [sortCol,     setSortCol]     = useState<SortableColId | null>(null);
  const [sortDir,     setSortDir]     = useState<'asc' | 'desc'>('asc');
  const [dragOver,    setDragOver]    = useState<ColumnId | null>(null);
  const dragColRef = useRef<ColumnId | null>(null);

  // ── Keyboard navigation (J/K to move, Enter to open) ─────────────────────────
  const [focusedIdx,  setFocusedIdx]  = useState<number | null>(null);
  const rowRefs     = useRef<(HTMLDivElement | null)[]>([]);
  const focusedRef  = useRef<number | null>(null);
  useEffect(() => { focusedRef.current = focusedIdx; }, [focusedIdx]);

  // Restore saved column order from localStorage (after mount, to avoid SSR mismatch)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('it_col_order');
      if (saved) {
        const parsed = JSON.parse(saved) as ColumnId[];
        if (
          Array.isArray(parsed) &&
          parsed.length === DEFAULT_COLUMN_ORDER.length &&
          DEFAULT_COLUMN_ORDER.every((id) => parsed.includes(id))
        ) {
          setColumnOrder(parsed);
        }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist column order whenever it changes
  useEffect(() => {
    try { localStorage.setItem('it_col_order', JSON.stringify(columnOrder)); } catch {}
  }, [columnOrder]);

  // Reset keyboard focus when the data or search changes
  useEffect(() => {
    setFocusedIdx(null);
    rowRefs.current = [];
  }, [commitments, query]);

  // Scroll focused row into view
  useEffect(() => {
    if (focusedIdx !== null) {
      rowRefs.current[focusedIdx]?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIdx]);

  // ── Debounced search → push URL (skip on initial mount) ──────────────────────
  const isFirstSearch = useRef(true);
  useEffect(() => {
    if (isFirstSearch.current) { isFirstSearch.current = false; return; }
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        status:    validStatus,
        direction: validDirection,
        sort:      validSort,
        page:      '1',
      });
      if (query.trim()) params.set('q', query.trim());
      router.push(`/track?${params}`);
    }, 350);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // ── URL builder ───────────────────────────────────────────────────────────────
  function buildUrl(overrides: Partial<Record<'status' | 'direction' | 'sort' | 'page' | 'q', string>>) {
    const currentQ = searchParams.get('q') ?? '';
    return `/track?${new URLSearchParams({
      status:    validStatus,
      direction: validDirection,
      sort:      validSort,
      ...(currentQ ? { q: currentQ } : {}),
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
  const filtered = commitments.filter((c) => {
    if (optimisticDone.has(c.id)      && validStatus !== 'done')      return false;
    if (optimisticDismissed.has(c.id) && validStatus !== 'dismissed') return false;
    if (!q) return true;
    return (
      c.description.toLowerCase().includes(q) ||
      (c.counterparty       ?? '').toLowerCase().includes(q) ||
      (c.counterparty_email ?? '').toLowerCase().includes(q) ||
      (c.note               ?? '').toLowerCase().includes(q) ||
      (c.email_subject      ?? '').toLowerCase().includes(q)
    );
  });

  // ── Client-side sort (current page only) ─────────────────────────────────────
  const visible = useMemo<Commitment[]>(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'description') {
        cmp = a.description.localeCompare(b.description);
      } else if (sortCol === 'direction') {
        // My Promise (outgoing) sorts before Assigned to me in ascending order
        const da = a.direction === 'outgoing' ? 0 : 1;
        const db = b.direction === 'outgoing' ? 0 : 1;
        cmp = da - db;
      } else if (sortCol === 'counterparty') {
        const an = a.counterparty || a.counterparty_email || '';
        const bn = b.counterparty || b.counterparty_email || '';
        cmp = an.localeCompare(bn);
      } else if (sortCol === 'created') {
        cmp = a.scanned_at.localeCompare(b.scanned_at);
      } else if (sortCol === 'due') {
        cmp = (a.due_date ?? '9999-99-99').localeCompare(b.due_date ?? '9999-99-99');
      } else if (sortCol === 'priority') {
        const P: Record<string, number> = { high: 0, medium: 1, low: 2 };
        cmp = (P[a.priority ?? ''] ?? 3) - (P[b.priority ?? ''] ?? 3);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir]);

  // ── Keyboard navigation: J/K to move rows, Enter to open, Esc to clear ───────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        setFocusedIdx((prev) => Math.min((prev ?? -1) + 1, visible.length - 1));
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setFocusedIdx((prev) => Math.max((prev ?? 1) - 1, 0));
      } else if (e.key === 'Enter') {
        const idx = focusedRef.current;
        if (idx !== null && visible[idx]) {
          e.preventDefault();
          setDetailItem(visible[idx]);
        }
      } else if (e.key === 'Escape') {
        setFocusedIdx(null);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [visible]);

  // ── Sort handler ──────────────────────────────────────────────────────────────
  function handleSort(colId: SortableColId) {
    if (sortCol === colId) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(colId);
      setSortDir('asc');
    }
  }

  /** Returns the appropriate sort indicator icon for a given column. */
  function sortIcon(colId: SortableColId) {
    if (sortCol === colId) {
      return sortDir === 'asc'
        ? <ChevronUp className="w-2.5 h-2.5 shrink-0" />
        : <ChevronDown className="w-2.5 h-2.5 shrink-0" />;
    }
    return <ChevronsUpDown className="w-2.5 h-2.5 shrink-0 opacity-40" />;
  }

  // ── Drag-and-drop column reorder ──────────────────────────────────────────────
  function handleDragStart(colId: ColumnId) {
    dragColRef.current = colId;
  }
  function handleDragOver(e: React.DragEvent, colId: ColumnId) {
    e.preventDefault();
    setDragOver(colId);
  }
  function handleDrop(e: React.DragEvent, targetId: ColumnId) {
    e.preventDefault();
    const srcId = dragColRef.current;
    dragColRef.current = null;
    setDragOver(null);
    if (!srcId || srcId === targetId) return;
    setColumnOrder((prev) => {
      const next = [...prev];
      const from = next.indexOf(srcId);
      const to   = next.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      next.splice(from, 1);
      next.splice(to, 0, srcId);
      return next;
    });
  }
  function handleDragEnd() {
    dragColRef.current = null;
    setDragOver(null);
  }

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
  const selectedIds        = [...selected];
  const allVisibleIds      = visible.map((c) => c.id);
  const allVisibleSelected = visible.length > 0 && allVisibleIds.every((id) => selected.has(id));
  const activeQ            = searchParams.get('q') ?? '';

  function toggleAll() {
    if (allVisibleSelected) {
      setSelected(new Set());
      setSelectAllPages(false);
    } else {
      setSelected(new Set(allVisibleIds));
    }
  }

  function handleBulkDone() {
    if (!selectAllPages && selectedIds.length === 0) return;

    if (selectAllPages) {
      startBulkTransition(async () => {
        const result = await bulkMarkDoneWhere({
          status: validStatus, direction: validDirection, q: activeQ, todayStr,
        });
        if (result?.error) {
          toast.error(result.error);
        } else {
          setSelectAllPages(false);
          setSelected(new Set());
          toast.success(`Marked all ${totalCount} done`);
        }
      });
      return;
    }

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
        toast.success(`Marked ${snapshot.length} done`, {
          duration: 6000,
          action: {
            label: 'Undo',
            onClick: async () => {
              setOptimisticDone((prev) => {
                const rolled = new Set(prev);
                snapshot.forEach((id) => rolled.delete(id));
                return rolled;
              });
              await Promise.all(snapshot.map((id) => reopenCommitment(id)));
              toast.success('Undone');
            },
          },
        });
      }
    });
  }

  function handleBulkDismiss() {
    if (!selectAllPages && selectedIds.length === 0) return;

    if (selectAllPages) {
      startBulkTransition(async () => {
        const result = await bulkDismissWhere({
          status: validStatus, direction: validDirection, q: activeQ, todayStr,
        });
        if (result?.error) {
          toast.error(result.error);
        } else {
          setSelectAllPages(false);
          setSelected(new Set());
          toast.success(`Dismissed all ${totalCount}`);
        }
      });
      return;
    }

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
        toast.success(`Dismissed ${snapshot.length}`, {
          duration: 6000,
          action: {
            label: 'Undo',
            onClick: async () => {
              setOptimisticDismissed((prev) => {
                const rolled = new Set(prev);
                snapshot.forEach((id) => rolled.delete(id));
                return rolled;
              });
              await Promise.all(snapshot.map((id) => restoreCommitment(id)));
              toast.success('Undone');
            },
          },
        });
      }
    });
  }

  function handleBulkSnooze(dateVal: string) {
    if ((!selectAllPages && selectedIds.length === 0) || !dateVal) return;
    setShowSnooze(false);

    const label = new Date(dateVal + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });

    if (selectAllPages) {
      startSnoozeTransition(async () => {
        const result = await bulkSnoozeWhere({
          status: validStatus, direction: validDirection, q: activeQ, todayStr, dueDate: dateVal,
        });
        if (result?.error) {
          toast.error(result.error);
        } else {
          setSelectAllPages(false);
          setSelected(new Set());
          toast.success(`Snoozed all ${totalCount} until ${label}`);
        }
      });
      return;
    }

    const snapshot = [...selectedIds];
    setSelected(new Set());

    startSnoozeTransition(async () => {
      const result = await bulkSnooze(snapshot, dateVal);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(`Snoozed ${snapshot.length} until ${label}`);
      }
    });
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────────
  const primaryTabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'open',    label: 'Open',    count: counts.open    },
    { key: 'overdue', label: 'Overdue', count: counts.overdue },
    { key: 'done',    label: 'Done',    count: counts.done    },
  ];

  const from = (pageNum - 1) * 50;
  const to   = Math.min(from + 50, totalCount);

  const hasSelection = selectAllPages || selectedIds.length > 0;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Track</h2>
          <p className="text-sm text-muted-foreground">
            Promises and tasks tracked from your inbox.
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* ⋯ menu (CSV export + future actions) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                title="More options"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem asChild>
                <Link
                  href={`/api/commitments/export?${new URLSearchParams({
                    status:    validStatus,
                    direction: validDirection,
                  })}`}
                  className="flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export as CSV
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Status tabs + dismissed secondary link */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-muted">
            {primaryTabs.map(({ key, label, count }) => (
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

          {/* Dismissed as a secondary de-emphasised link */}
          <Link
            href={tabHref('dismissed')}
            className={cn(
              'text-xs transition-colors',
              validStatus === 'dismissed'
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Dismissed ({counts.dismissed})
          </Link>
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

        </div>
      </div>

      {/* Search + bulk actions */}
      <div className="flex items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search commitments…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        {hasSelection && (
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {selectAllPages ? `All ${totalCount} selected` : `${selectedIds.length} selected`}
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
      {showSnooze && hasSelection && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-muted/50 text-sm">
          <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {selectAllPages ? `Snooze all ${totalCount} until:` : `Snooze ${selectedIds.length} until:`}
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
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            {validStatus === 'overdue' && (
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-950/50 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            )}
            <p className="text-sm font-medium">
              {validStatus === 'open'      ? 'No open commitments'   :
               validStatus === 'overdue'   ? 'All caught up!'        :
               validStatus === 'done'      ? 'No completed items'    :
               'No dismissed items'}
            </p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {validStatus === 'open'
                ? 'Run a scan in the extension to detect promises from your emails, or add one manually.'
                : validStatus === 'overdue'
                ? "Nothing overdue — you're on top of all your commitments."
                : validStatus === 'done'
                ? 'Mark commitments done as you clear them — they\'ll be archived here.'
                : 'Dismissed commitments appear here and can be restored to open at any time.'}
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
        ) : visible.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <p className="text-sm font-medium">No results for &ldquo;{query}&rdquo;</p>
            <p className="text-xs text-muted-foreground">Try a different keyword or clear the search.</p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
          <div className="divide-y divide-border">

            {/* ── Column header row ── */}
            {visible.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2 bg-muted/30">

                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAll}
                  className="w-3.5 h-3.5 shrink-0 rounded cursor-pointer accent-primary"
                  aria-label="Select all visible"
                />

                {/* Description column header + count info (flex-1 matches description button) */}
                <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
                  <button
                    onClick={() => handleSort('description')}
                    className={cn(
                      'flex items-center justify-start gap-1 shrink-0 select-none transition-colors',
                      'text-[10px] font-semibold uppercase tracking-wide',
                      sortCol === 'description'
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span>Description</span>
                    <span className="shrink-0 flex items-center">{sortIcon('description')}</span>
                  </button>
                  <span className="text-muted-foreground/40 shrink-0 text-xs select-none">·</span>
                  <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                    {selectAllPages
                      ? `All ${totalCount} selected`
                      : q
                      ? `${visible.length} result${visible.length !== 1 ? 's' : ''}`
                      : `${totalCount} total`}
                  </span>
                  {allVisibleSelected && totalPages > 1 && !selectAllPages && (
                    <button
                      onClick={() => setSelectAllPages(true)}
                      className="text-xs text-primary hover:underline underline-offset-2 whitespace-nowrap"
                    >
                      Select all {totalCount} across all pages
                    </button>
                  )}
                  {selectAllPages && (
                    <button
                      onClick={() => { setSelectAllPages(false); setSelected(new Set()); }}
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-2 whitespace-nowrap"
                    >
                      ✕ Clear all-pages selection
                    </button>
                  )}
                </div>

                {/* Draggable column headers — mirror the right panel in CommitmentRow */}
                <div className="flex items-center gap-2 shrink-0">
                  {columnOrder.map((colId) => {
                    const isActive  = sortCol === colId;
                    const isTarget  = dragOver === colId;
                    return (
                      <div
                        key={colId}
                        role="button"
                        tabIndex={0}
                        draggable
                        onClick={() => handleSort(colId)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSort(colId)}
                        onDragStart={() => handleDragStart(colId)}
                        onDragOver={(e) => handleDragOver(e, colId)}
                        onDrop={(e) => handleDrop(e, colId)}
                        onDragEnd={handleDragEnd}
                        className={cn(
                          COL_WIDTH[colId],
                          'shrink-0 flex items-center justify-start gap-1 select-none transition-colors overflow-hidden',
                          'text-[10px] font-semibold uppercase tracking-wide',
                          'cursor-grab active:cursor-grabbing rounded',
                          isActive
                            ? 'text-foreground'
                            : 'text-muted-foreground hover:text-foreground',
                          isTarget
                            ? 'ring-1 ring-primary/40 bg-primary/5'
                            : 'hover:bg-muted/60',
                        )}
                        title={`Sort by ${COL_LABEL[colId]} · Drag to reorder`}
                      >
                        <span className="min-w-0 truncate">{COL_LABEL[colId]}</span>
                        <span className="shrink-0 flex items-center">{sortIcon(colId)}</span>
                      </div>
                    );
                  })}
                  {/* Gmail spacer — matches w-7 in the row */}
                  <div className="w-7 shrink-0" />
                  {/* Actions spacer — matches w-[88px] in the row */}
                  <div className="w-[88px] shrink-0" />
                </div>
              </div>
            )}

            {/* Rows */}
            {visible.map((c, idx) => (
              <div key={c.id} ref={(el) => { rowRefs.current[idx] = el; }}>
              <CommitmentRow
                commitment={c}
                todayStr={todayStr}
                userEmail={userEmail}
                columnOrder={columnOrder}
                selected={selected.has(c.id)}
                optimisticDone={optimisticDone.has(c.id)}
                optimisticDismissed={optimisticDismissed.has(c.id)}
                focused={focusedIdx === idx}
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
              </div>
            ))}
          </div>
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
        userEmail={userEmail}
        onClose={() => setDetailItem(null)}
      />
      <CreateCommitmentDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </div>
  );
}
