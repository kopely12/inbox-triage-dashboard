'use client';

import { useTransition, useState } from 'react';
import { markCommitmentDone, reopenCommitment, updateCommitmentDueDate } from '@/app/actions/commitments';
import { Button }  from '@/components/ui/button';
import { Loader2, CheckCircle2, RotateCcw, Calendar } from 'lucide-react';

// ── Mark done / reopen ────────────────────────────────────────────────────────

export function MarkDoneButton({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition();

  if (status === 'done') {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground gap-1"
        disabled={pending}
        onClick={() => startTransition(() => { reopenCommitment(id); })}
        title="Reopen"
      >
        {pending
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : <RotateCcw className="w-3 h-3" />}
        Reopen
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs gap-1 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
      disabled={pending}
      onClick={() => startTransition(() => { markCommitmentDone(id); })}
      title="Mark done"
    >
      {pending
        ? <Loader2 className="w-3 h-3 animate-spin" />
        : <CheckCircle2 className="w-3 h-3" />}
      Done
    </Button>
  );
}

// ── Inline due-date editor ────────────────────────────────────────────────────

export function DueDateCell({ id, dueDate }: { id: string; dueDate: string | null }) {
  const [editing, setEditing]   = useState(false);
  const [value,   setValue]     = useState(dueDate ?? '');
  const [pending, startTransition] = useTransition();

  if (!editing) {
    const label = dueDate
      ? new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null;

    const today     = new Date(); today.setHours(0, 0, 0, 0);
    const dueDateTs = dueDate ? new Date(dueDate + 'T00:00:00').getTime() : null;
    const overdue   = dueDateTs !== null && dueDateTs < today.getTime();

    return (
      <button
        onClick={() => setEditing(true)}
        className={[
          'flex items-center gap-1 text-xs rounded px-1.5 py-0.5 transition-colors',
          'hover:bg-accent group',
          overdue ? 'text-red-600 dark:text-red-400' : label ? 'text-foreground' : 'text-muted-foreground',
        ].join(' ')}
        title="Edit due date"
      >
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
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        autoFocus
        className="h-6 text-xs rounded border border-input bg-background px-1.5 w-32"
        disabled={pending}
      />
      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={save} disabled={pending}>
        {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
      </Button>
      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs text-muted-foreground" onClick={() => setEditing(false)}>
        ✕
      </Button>
    </div>
  );
}
