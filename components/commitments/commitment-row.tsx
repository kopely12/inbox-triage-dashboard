'use client';

import { useState, useTransition } from 'react';
import {
  markCommitmentDone, dismissCommitment,
  reopenCommitment, restoreCommitment,
  updateCommitmentDueDate, updateCommitmentBlocked,
} from '@/app/actions/commitments';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  CheckCircle2, X, RotateCcw, Loader2, ExternalLink, StickyNote,
  MoreHorizontal, Clock, Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Commitment } from './commitments-client';
import type { ColumnId } from './column-config';

// ── Constants ──────────────────────────────────────────────────────────────────

type Priority = 'high' | 'medium' | 'low' | null;

const PRIORITY_LABEL: Record<NonNullable<Priority>, string> = {
  high: 'High', medium: 'Med', low: 'Low',
};
const PRIORITY_CLS: Record<NonNullable<Priority>, string> = {
  high:   'text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40',
  medium: 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40',
  low:    'text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40',
};

function gmailUrl(threadId: string | null, userEmail?: string | null) {
  if (!threadId || threadId.startsWith('compose_') || threadId.startsWith('manual_')) return null;
  const account = userEmail ? encodeURIComponent(userEmail) : '0';
  return `https://mail.google.com/mail/u/${account}/#all/${threadId}`;
}

function fmtShortDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  commitment:          Commitment;
  todayStr:            string;
  userEmail:           string | null;
  /** Ordered list of draggable column IDs — controls which columns show and in what order. */
  columnOrder:         ColumnId[];
  selected:            boolean;
  optimisticDone:      boolean;
  optimisticDismissed: boolean;
  focused:             boolean;
  onSelect:            (checked: boolean) => void;
  onOpenDetail:        () => void;
  onOptimisticDone:    (id: string) => void;
  onOptimisticDismiss: (id: string) => void;
  onUndoOptimistic:    (id: string) => void;
}

// ── CommitmentRow ─────────────────────────────────────────────────────────────

export function CommitmentRow({
  commitment: c, todayStr, userEmail, columnOrder, selected,
  optimisticDone, optimisticDismissed, focused,
  onSelect, onOpenDetail,
  onOptimisticDone, onOptimisticDismiss, onUndoOptimistic,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [optimisticBlocked, setOptimisticBlocked] = useState(c.blocked ?? false);

  const isDone      = c.status === 'done'      || optimisticDone;
  const isDismissed = c.status === 'dismissed' || optimisticDismissed;
  const isOverdue   = c.status === 'open' && !optimisticDone && !!c.due_date && c.due_date < todayStr;
  const isOpen      = !isDone && !isDismissed;
  const gmail       = gmailUrl(c.thread_id, userEmail);

  // ── Action handlers ───────────────────────────────────────────────────────────

  function handleDone() {
    onOptimisticDone(c.id);
    startTransition(async () => {
      const result = await markCommitmentDone(c.id);
      if (result?.error) {
        onUndoOptimistic(c.id);
        toast.error(result.error);
      } else {
        toast.success('Marked done', {
          duration: 6000,
          action: {
            label: 'Undo',
            onClick: async () => {
              onUndoOptimistic(c.id);
              await reopenCommitment(c.id);
            },
          },
        });
      }
    });
  }

  function handleReopen() {
    startTransition(async () => {
      const result = await reopenCommitment(c.id);
      if (result?.error) toast.error(result.error);
    });
  }

  function handleDismiss() {
    onOptimisticDismiss(c.id);
    startTransition(async () => {
      const result = await dismissCommitment(c.id);
      if (result?.error) {
        onUndoOptimistic(c.id);
        toast.error(result.error);
      } else {
        toast.success('Dismissed', {
          duration: 6000,
          action: {
            label: 'Undo',
            onClick: async () => {
              onUndoOptimistic(c.id);
              await restoreCommitment(c.id);
            },
          },
        });
      }
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreCommitment(c.id);
      if (result?.error) toast.error(result.error);
    });
  }

  function handleSnooze(offset: 'tomorrow' | 'next-week' | string) {
    let dateStr: string;
    if (offset === 'tomorrow') {
      const d = new Date(); d.setDate(d.getDate() + 1);
      dateStr = d.toISOString().slice(0, 10);
    } else if (offset === 'next-week') {
      const d = new Date(); d.setDate(d.getDate() + 7);
      dateStr = d.toISOString().slice(0, 10);
    } else {
      dateStr = offset;
    }
    startTransition(async () => {
      const result = await updateCommitmentDueDate(c.id, dateStr);
      if (result?.error) {
        toast.error(result.error);
      } else {
        const label = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
        });
        toast.success(`Snoozed until ${label}`);
      }
    });
  }

  function handleToggleBlocked() {
    const next = !optimisticBlocked;
    setOptimisticBlocked(next);
    startTransition(async () => {
      const result = await updateCommitmentBlocked(c.id, next);
      if (result?.error) {
        setOptimisticBlocked(!next);
        toast.error(result.error);
      }
    });
  }

  // ── Column cell renderer ───────────────────────────────────────────────────────
  // Widths here must match the corresponding header widths in commitments-client.tsx
  // and the COL_WIDTH values in column-config.ts.

  function renderColumn(colId: ColumnId) {
    switch (colId) {
      case 'direction':
        return (
          <div key="direction" className="w-28 shrink-0 flex items-center">
            <span className={cn(
              'text-[10px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap',
              c.direction === 'outgoing'
                ? 'text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/40'
                : 'text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/40',
            )}>
              {c.direction === 'outgoing' ? 'My Promise' : 'Assigned to me'}
            </span>
          </div>
        );
      case 'counterparty': {
        const name  = c.counterparty || null;
        const email = c.counterparty_email || null;
        return (
          <div key="counterparty" className="w-48 shrink-0 text-xs min-w-0">
            {(name || email) ? (
              <>
                <span className="font-medium text-foreground block truncate" title={name ?? email ?? undefined}>
                  {name ?? email}
                </span>
                {name && email && (
                  <span className="text-muted-foreground block truncate" title={email}>{email}</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground/30">—</span>
            )}
          </div>
        );
      }
      case 'created':
        return (
          <div key="created" className="w-20 shrink-0 text-xs text-muted-foreground">
            {new Date(c.scanned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        );
      case 'due':
        return (
          <div key="due" className="w-20 shrink-0 text-xs leading-tight">
            {c.due_date ? (
              <>
                <span className={cn(
                  'font-medium',
                  isOverdue ? 'text-red-600 dark:text-red-400' : 'text-foreground',
                )}>
                  {fmtShortDate(c.due_date)}
                </span>
                {isOverdue && (
                  <span className="block text-[10px] text-red-500 dark:text-red-400">Overdue</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground/30">—</span>
            )}
          </div>
        );
      case 'priority':
        return (
          <div key="priority" className="w-20 shrink-0 flex items-center gap-1.5">
            {c.priority
              ? <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded border font-medium whitespace-nowrap',
                  PRIORITY_CLS[c.priority],
                )}>
                  {PRIORITY_LABEL[c.priority]}
                </span>
              : !optimisticBlocked || !isOpen
              ? <span className="text-muted-foreground/30 text-xs">—</span>
              : null}
            {optimisticBlocked && isOpen && (
              <span title="Blocked" className="flex items-center">
                <Ban className="w-3 h-3 text-orange-500 dark:text-orange-400 shrink-0" />
              </span>
            )}
          </div>
        );
      default:
        return null;
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <div className={cn(
      'flex items-start gap-3 px-4 py-3 transition-colors',
      isOverdue
        ? 'border-l-2 border-l-red-400 dark:border-l-red-600'
        : optimisticBlocked && isOpen
        ? 'border-l-2 border-l-orange-400 dark:border-l-orange-600'
        : 'border-l-2 border-l-transparent',
      isDone || isDismissed
        ? 'opacity-60'
        : 'hover:bg-muted/30',
      focused ? 'ring-1 ring-inset ring-primary/50 bg-primary/5' : '',
    )}>

      {/* Checkbox */}
      <div className="mt-1 shrink-0">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="w-3.5 h-3.5 rounded cursor-pointer accent-primary"
          aria-label="Select commitment"
        />
      </div>

      {/* Main content — click opens detail */}
      <button
        className="flex-1 min-w-0 text-left space-y-0.5"
        onClick={onOpenDetail}
      >
        <p className={cn(
          'text-sm leading-snug',
          isDone ? 'line-through text-muted-foreground' : '',
        )}>
          {c.description}
        </p>

        {/* Email subject — shown when available and the row isn't from a manual entry */}
        {c.email_subject && (
          <p className="text-[11px] text-muted-foreground/60 truncate" title={c.email_subject}>
            {c.email_subject}
          </p>
        )}

        {/* Metadata line — only rendered when there's content to show */}
        {(isDone || (optimisticBlocked && isOpen) || c.note) && (
          <div className="flex items-center gap-2.5 flex-wrap text-xs text-muted-foreground">
            {isDone && c.resolved_at && (
              <span>
                Done {new Date(c.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
            {optimisticBlocked && isOpen && (
              <span className="flex items-center gap-0.5 text-orange-600 dark:text-orange-400 font-medium">
                <Ban className="w-3 h-3 shrink-0" /> Blocked
              </span>
            )}
            {c.note && (
              <span className="flex items-center gap-0.5 italic">
                <StickyNote className="w-3 h-3 shrink-0" />
                <span className="truncate max-w-[200px]">{c.note}</span>
              </span>
            )}
          </div>
        )}
      </button>

      {/* Right panel — draggable columns + fixed gmail + fixed actions */}
      <div className="flex items-center gap-2 shrink-0 mt-0.5">

        {/* Draggable columns rendered in user-defined order */}
        {columnOrder.map(renderColumn)}

        {/* Gmail — fixed position (not draggable) */}
        <div className="w-7 flex items-center justify-center">
          {gmail && (
            <Button asChild variant="ghost" size="icon-sm" title="View in Gmail">
              <a href={gmail} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3 h-3" />
              </a>
            </Button>
          )}
        </div>

        {/* Actions — fixed position, fixed width keeps panel width stable */}
        <div className="w-[88px] flex items-center justify-end gap-1">
        {isDismissed ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1 text-muted-foreground"
            disabled={pending}
            onClick={handleRestore}
            title="Restore to open"
          >
            {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            Restore
          </Button>
        ) : isDone ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1 text-muted-foreground"
            disabled={pending}
            onClick={handleReopen}
            title="Reopen"
          >
            {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            Reopen
          </Button>
        ) : (
          <>
            {/* Primary: Done */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
              disabled={pending}
              onClick={handleDone}
              title="Mark done"
            >
              {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Done
            </Button>

            {/* ⋯ menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground"
                  disabled={pending}
                  title="More actions"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Snooze until
                </div>
                <DropdownMenuItem onClick={() => handleSnooze('tomorrow')}>
                  <Clock className="w-3.5 h-3.5 mr-2 shrink-0" />
                  Tomorrow
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSnooze('next-week')}>
                  <Clock className="w-3.5 h-3.5 mr-2 shrink-0" />
                  Next week
                </DropdownMenuItem>
                <div className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                  <p className="text-xs text-muted-foreground mb-1.5">Custom date:</p>
                  <input
                    type="date"
                    min={todayStr}
                    className="h-6 w-full text-xs rounded border border-input bg-background px-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                    onChange={(e) => { if (e.target.value) handleSnooze(e.target.value); }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleToggleBlocked}>
                  <Ban className="w-3.5 h-3.5 mr-2 shrink-0" />
                  {optimisticBlocked ? 'Remove blocked flag' : 'Mark as blocked'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleDismiss}
                  className="text-muted-foreground focus:text-destructive focus:bg-destructive/10"
                >
                  <X className="w-3.5 h-3.5 mr-2 shrink-0" />
                  Dismiss
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        </div>{/* end actions */}

      </div>{/* end right panel */}
    </div>
  );
}
