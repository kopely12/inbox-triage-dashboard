'use client';

import { useTransition } from 'react';
import {
  markCommitmentDone, dismissCommitment,
  reopenCommitment,  restoreCommitment,
} from '@/app/actions/commitments';
import { Button }  from '@/components/ui/button';
import { toast }   from 'sonner';
import {
  CheckCircle2, X, RotateCcw, Loader2, ExternalLink, StickyNote,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Commitment } from './commitments-client';

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

function gmailUrl(threadId: string | null) {
  if (!threadId || threadId.startsWith('compose_') || threadId.startsWith('manual_')) return null;
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}

function fmtShortDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  commitment:          Commitment;
  todayStr:            string;
  selected:            boolean;
  optimisticDone:      boolean;
  optimisticDismissed: boolean;
  onSelect:            (checked: boolean) => void;
  onOpenDetail:        () => void;
  onOptimisticDone:    (id: string) => void;
  onOptimisticDismiss: (id: string) => void;
  onUndoOptimistic:    (id: string) => void;
}

// ── CommitmentRow ─────────────────────────────────────────────────────────────

export function CommitmentRow({
  commitment: c, todayStr, selected,
  optimisticDone, optimisticDismissed,
  onSelect, onOpenDetail,
  onOptimisticDone, onOptimisticDismiss, onUndoOptimistic,
}: Props) {
  const [pending, startTransition] = useTransition();

  const isDone      = c.status === 'done'      || optimisticDone;
  const isDismissed = c.status === 'dismissed' || optimisticDismissed;
  const isOverdue   = c.status === 'open' && !optimisticDone && !!c.due_date && c.due_date < todayStr;
  const counterparty = c.counterparty || c.counterparty_email || null;
  const gmail        = gmailUrl(c.thread_id);

  function handleDone() {
    onOptimisticDone(c.id);
    startTransition(async () => {
      const result = await markCommitmentDone(c.id);
      if (result?.error) { onUndoOptimistic(c.id); toast.error(result.error); }
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
      if (result?.error) { onUndoOptimistic(c.id); toast.error(result.error); }
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreCommitment(c.id);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <div className={cn(
      'flex items-start gap-3 px-4 py-3 transition-colors',
      isOverdue
        ? 'border-l-2 border-l-red-400 dark:border-l-red-600'
        : 'border-l-2 border-l-transparent',
      isDone || isDismissed
        ? 'opacity-60'
        : 'hover:bg-muted/30',
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

      {/* Direction badge */}
      <div className="mt-0.5 shrink-0">
        <span className={cn(
          'text-[10px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap',
          c.direction === 'outgoing'
            ? 'text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/40'
            : 'text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/40',
        )}>
          {c.direction === 'outgoing' ? '↑ My promise' : '↓ Assigned'}
        </span>
      </div>

      {/* Main content — click opens detail */}
      <button
        className="flex-1 min-w-0 text-left space-y-1"
        onClick={onOpenDetail}
      >
        <p className={cn(
          'text-sm leading-snug',
          isDone ? 'line-through text-muted-foreground' : '',
        )}>
          {c.description}
        </p>

        <div className="flex items-center gap-2.5 flex-wrap text-xs text-muted-foreground">
          {counterparty && (
            <span>
              {c.direction === 'outgoing' ? 'To' : 'From'}{' '}
              <span className="font-medium text-foreground">{counterparty}</span>
            </span>
          )}
          <span>{fmtDate(c.scanned_at)}</span>
          {c.due_date && (
            <span className={cn(
              'font-medium',
              isOverdue ? 'text-red-600 dark:text-red-400' : 'text-foreground',
            )}>
              Due {fmtShortDate(c.due_date)}{isOverdue ? ' · Overdue' : ''}
            </span>
          )}
          {isDone && c.resolved_at && (
            <span>
              Done {new Date(c.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          {c.note && (
            <span className="flex items-center gap-0.5 italic">
              <StickyNote className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[180px]">{c.note}</span>
            </span>
          )}
        </div>
      </button>

      {/* Priority badge */}
      {c.priority && (
        <span className={cn(
          'mt-0.5 shrink-0 text-[10px] px-1.5 py-0.5 rounded border font-medium',
          PRIORITY_CLS[c.priority],
        )}>
          {PRIORITY_LABEL[c.priority]}
        </span>
      )}

      {/* Gmail link */}
      {gmail && (
        <Button asChild variant="ghost" size="icon-sm" title="View in Gmail" className="mt-0.5 shrink-0">
          <a href={gmail} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="w-3 h-3" />
          </a>
        </Button>
      )}

      {/* Actions — always visible */}
      <div className="flex items-center gap-1 shrink-0 mt-0.5">
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
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              disabled={pending}
              onClick={handleDismiss}
              title="Dismiss — not a real commitment"
            >
              <X className="w-3 h-3" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
