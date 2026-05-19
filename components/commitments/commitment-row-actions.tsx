'use client';

import { useTransition, useState, useRef, useEffect } from 'react';
import {
  markCommitmentDone, reopenCommitment, updateCommitmentDueDate,
  updateCommitmentPriority, updateCommitmentNote, dismissCommitment,
} from '@/app/actions/commitments';
import { Button } from '@/components/ui/button';
import { cn }     from '@/lib/utils';
import { Loader2, CheckCircle2, RotateCcw, Calendar, X, StickyNote } from 'lucide-react';

// ── Mark done / reopen ────────────────────────────────────────────────────────

export function MarkDoneButton({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition();

  if (status === 'done') {
    return (
      <Button variant="ghost" size="sm"
        className="h-7 px-2 text-xs text-muted-foreground gap-1"
        disabled={pending}
        onClick={() => startTransition(() => { reopenCommitment(id); })}
        title="Reopen">
        {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
        Reopen
      </Button>
    );
  }

  return (
    <Button variant="ghost" size="sm"
      className="h-7 px-2 text-xs gap-1 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
      disabled={pending}
      onClick={() => startTransition(() => { markCommitmentDone(id); })}
      title="Mark done">
      {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
      Done
    </Button>
  );
}

// ── Inline due-date editor ────────────────────────────────────────────────────

export function DueDateCell({ id, dueDate }: { id: string; dueDate: string | null }) {
  const [editing, setEditing]       = useState(false);
  const [value,   setValue]         = useState(dueDate ?? '');
  const [pending, startTransition]  = useTransition();

  if (!editing) {
    const label     = dueDate
      ? new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null;
    const today     = new Date(); today.setHours(0, 0, 0, 0);
    const dueDateTs = dueDate ? new Date(dueDate + 'T00:00:00').getTime() : null;
    const overdue   = dueDateTs !== null && dueDateTs < today.getTime();

    return (
      <button onClick={() => setEditing(true)}
        className={cn(
          'flex items-center gap-1 text-xs rounded px-1.5 py-0.5 transition-colors hover:bg-accent group',
          overdue ? 'text-red-600 dark:text-red-400' : label ? 'text-foreground' : 'text-muted-foreground',
        )}
        title="Edit due date">
        <Calendar className="w-3 h-3 shrink-0 opacity-60 group-hover:opacity-100" />
        {label ?? 'Set date'}
      </button>
    );
  }

  function save() {
    startTransition(async () => {
      await updateCommitmentDueDate(id, value || null);
      setEditing(false);
    });
  }

  return (
    <div className="flex items-center gap-1">
      <input type="date" value={value} onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        autoFocus
        className="h-6 text-xs rounded border border-input bg-background px-1.5 w-32"
        disabled={pending} />
      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={save} disabled={pending}>
        {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
      </Button>
      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs text-muted-foreground"
        onClick={() => setEditing(false)}>✕</Button>
    </div>
  );
}

// ── Priority button (cycles high → medium → low → none) ──────────────────────

type Priority = 'high' | 'medium' | 'low' | null;

const PRIORITY_CYCLE: Priority[] = ['high', 'medium', 'low', null];
const PRIORITY_LABEL: Record<NonNullable<Priority>, string> = {
  high: 'High', medium: 'Med', low: 'Low',
};
const PRIORITY_CLS: Record<NonNullable<Priority>, string> = {
  high:   'text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40',
  medium: 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40',
  low:    'text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40',
};

export function PriorityButton({ id, priority }: { id: string; priority: Priority }) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<Priority>(priority);

  function cycle() {
    const idx  = PRIORITY_CYCLE.indexOf(optimistic);
    const next = PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length];
    setOptimistic(next);
    startTransition(() => { updateCommitmentPriority(id, next); });
  }

  if (!optimistic) {
    return (
      <button onClick={cycle} disabled={pending}
        title="Set priority"
        className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-accent transition-colors">
        {pending ? <Loader2 className="w-3 h-3 animate-spin inline" /> : '— priority'}
      </button>
    );
  }

  return (
    <button onClick={cycle} disabled={pending}
      title={`Priority: ${PRIORITY_LABEL[optimistic]} — click to change`}
      className={cn(
        'text-xs px-1.5 py-0.5 rounded border font-medium transition-colors',
        PRIORITY_CLS[optimistic],
      )}>
      {pending ? <Loader2 className="w-3 h-3 animate-spin inline" /> : PRIORITY_LABEL[optimistic]}
    </button>
  );
}

// ── Inline note editor ────────────────────────────────────────────────────────

export function NoteEditor({ id, note }: { id: string; note: string | null }) {
  const [editing, setEditing]      = useState(false);
  const [value,   setValue]        = useState(note ?? '');
  const [pending, startTransition] = useTransition();
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) taRef.current?.focus();
  }, [editing]);

  function save() {
    startTransition(async () => {
      await updateCommitmentNote(id, value);
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group"
        title={note ? 'Edit note' : 'Add note'}>
        <StickyNote className="w-3 h-3 opacity-50 group-hover:opacity-100 shrink-0" />
        {note
          ? <span className="italic truncate max-w-[240px]">{note}</span>
          : <span className="opacity-0 group-hover:opacity-60">Add note…</span>
        }
      </button>
    );
  }

  return (
    <div className="flex items-start gap-1.5 w-full">
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
          if (e.key === 'Escape') setEditing(false);
        }}
        rows={2}
        placeholder="Add a note…"
        className="flex-1 text-xs rounded border border-input bg-background px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        disabled={pending}
      />
      <div className="flex flex-col gap-1">
        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
        </Button>
        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs text-muted-foreground"
          onClick={() => { setValue(note ?? ''); setEditing(false); }}>✕</Button>
      </div>
    </div>
  );
}

// ── Dismiss button ────────────────────────────────────────────────────────────

export function DismissButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="ghost" size="sm"
      className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
      disabled={pending}
      onClick={() => startTransition(() => { dismissCommitment(id); })}
      title="Dismiss — not a real commitment">
      {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
      Dismiss
    </Button>
  );
}
