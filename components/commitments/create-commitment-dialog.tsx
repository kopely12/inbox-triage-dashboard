'use client';

import { useState, useTransition } from 'react';

// ── Natural-language date parser ───────────────────────────────────────────────

function parseNaturalDate(input: string): string | null {
  const s = input.toLowerCase().trim();
  if (!s) return null;

  // Direct ISO date
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  if (s === 'today')       return fmt(today);
  if (s === 'tomorrow')    { const d = new Date(today); d.setDate(d.getDate() + 1); return fmt(d); }
  if (s === 'next week')   { const d = new Date(today); d.setDate(d.getDate() + 7); return fmt(d); }
  if (s === 'next month')  { const d = new Date(today); d.setMonth(d.getMonth() + 1); return fmt(d); }
  if (s === 'end of month') {
    const d = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return fmt(d);
  }

  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  if (s.startsWith('next ')) {
    const dayName = s.slice(5);
    const dayIdx  = DAYS.indexOf(dayName);
    if (dayIdx !== -1) {
      const d    = new Date(today);
      const diff = (dayIdx - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return fmt(d);
    }
  }
  // Plain day name (e.g. "Friday" = this Friday or next if today is Friday)
  const plainDay = DAYS.indexOf(s);
  if (plainDay !== -1) {
    const d    = new Date(today);
    const diff = (plainDay - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return fmt(d);
  }

  // "in N days/weeks"
  const inMatch = s.match(/^in (\d+)\s*(day|days|week|weeks|month|months)$/);
  if (inMatch) {
    const n    = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    const d    = new Date(today);
    if (unit.startsWith('month')) d.setMonth(d.getMonth() + n);
    else if (unit.startsWith('week')) d.setDate(d.getDate() + n * 7);
    else d.setDate(d.getDate() + n);
    return fmt(d);
  }

  return null;
}
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast }    from 'sonner';
import { Loader2 }  from 'lucide-react';
import { createCommitment } from '@/app/actions/commitments';
import { cn } from '@/lib/utils';

type Direction = 'outgoing' | 'assigned';
type Priority  = 'high' | 'medium' | 'low' | null;

interface Props {
  open:    boolean;
  onClose: () => void;
}

const PRIORITY_OPTIONS: { value: Priority; label: string; activeCls: string }[] = [
  { value: null,     label: 'None', activeCls: 'border-border bg-muted text-foreground' },
  { value: 'low',    label: 'Low',  activeCls: 'border-blue-300   bg-blue-50   text-blue-600   dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
  { value: 'medium', label: 'Med',  activeCls: 'border-amber-300  bg-amber-50  text-amber-600  dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
  { value: 'high',   label: 'High', activeCls: 'border-red-300    bg-red-50    text-red-600    dark:border-red-700 dark:bg-red-950/40 dark:text-red-400' },
];

export function CreateCommitmentDialog({ open, onClose }: Props) {
  const [description,   setDescription]   = useState('');
  const [direction,     setDirection]     = useState<Direction>('outgoing');
  const [counterparty,  setCounterparty]  = useState('');
  const [note,          setNote]          = useState('');
  const [dueDateInput,  setDueDateInput]  = useState('');
  const [parsedDate,    setParsedDate]    = useState<string | null>(null);
  const [priority,      setPriority]      = useState<Priority>(null);
  const [pending,       startTransition]  = useTransition();

  // Compute effective due date from the raw input
  const dueDate = parsedDate;

  function handleDueDateChange(val: string) {
    setDueDateInput(val);
    const p = parseNaturalDate(val);
    setParsedDate(p);
  }

  function reset() {
    setDescription('');
    setDirection('outgoing');
    setCounterparty('');
    setNote('');
    setDueDateInput('');
    setParsedDate(null);
    setPriority(null);
  }

  function handleClose() {
    if (!pending) { reset(); onClose(); }
  }

  function handleSubmit() {
    const trimmed = description.trim();
    if (!trimmed) { toast.error('Description is required.'); return; }

    startTransition(async () => {
      const result = await createCommitment({
        description: trimmed,
        direction,
        counterparty: counterparty.trim() || null,
        due_date:     dueDate || null,
        priority,
        note:         note.trim() || null,
      });
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success('Commitment added');
        reset();
        onClose();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add commitment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Direction toggle */}
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <div className="flex gap-1 p-1 rounded-lg bg-muted">
              {(['outgoing', 'assigned'] as Direction[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  disabled={pending}
                  className={cn(
                    'flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
                    direction === d
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {d === 'outgoing' ? '↑ My promise' : '↓ Assigned to me'}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="cc-description" className="text-xs">
              Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="cc-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
              }}
              placeholder={
                direction === 'outgoing'
                  ? 'e.g. Send the Q2 report to Alice by Friday'
                  : 'e.g. Review the contract John sent over'
              }
              rows={3}
              disabled={pending}
              className="text-sm"
            />
          </div>

          {/* Counterparty */}
          <div className="space-y-1.5">
            <Label htmlFor="cc-counterparty" className="text-xs">
              {direction === 'outgoing' ? 'To' : 'From'}
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </Label>
            <Input
              id="cc-counterparty"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder="e.g. Alice Smith"
              className="h-8 text-sm"
              disabled={pending}
            />
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label htmlFor="cc-note" className="text-xs">
              Note
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </Label>
            <Input
              id="cc-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any additional context…"
              className="h-8 text-sm"
              disabled={pending}
              maxLength={500}
            />
          </div>

          {/* Due date + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cc-due-date" className="text-xs">
                Due date
                <span className="text-muted-foreground font-normal ml-1">(optional)</span>
              </Label>
              <Input
                id="cc-due-date"
                value={dueDateInput}
                onChange={(e) => handleDueDateChange(e.target.value)}
                placeholder="tomorrow, next Friday, in 3 days…"
                disabled={pending}
                className="h-8 text-xs"
              />
              {dueDateInput && parsedDate && (
                <p className="text-[11px] text-muted-foreground">
                  → {new Date(parsedDate + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric',
                  })}
                </p>
              )}
              {dueDateInput && !parsedDate && (
                <p className="text-[11px] text-amber-600">
                  Try: "tomorrow", "next Friday", "in 3 days", or YYYY-MM-DD
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Priority
                <span className="text-muted-foreground font-normal ml-1">(optional)</span>
              </Label>
              <div className="flex gap-1">
                {PRIORITY_OPTIONS.map(({ value, label, activeCls }) => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => setPriority(value)}
                    disabled={pending}
                    className={cn(
                      'flex-1 py-1.5 text-xs rounded border font-medium transition-colors',
                      priority === value
                        ? activeCls
                        : 'border-border text-muted-foreground hover:text-foreground hover:border-input',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={pending || !description.trim()}
          >
            {pending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            {pending ? 'Adding…' : 'Add commitment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
