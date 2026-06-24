'use client';

import { useTransition } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge }  from '@/components/ui/badge';
import { toast }  from 'sonner';
import { ExternalLink, Clock, Loader2 } from 'lucide-react';
import {
  markCommitmentDone, dismissCommitment,
  reopenCommitment,  restoreCommitment,
} from '@/app/actions/commitments';
import { DueDateCell, NoteEditor, PriorityButton } from './commitment-row-actions';
import { cn } from '@/lib/utils';
import type { Commitment } from './commitments-client';

function gmailUrl(threadId: string | null, userEmail?: string | null) {
  if (!threadId || threadId.startsWith('compose_') || threadId.startsWith('manual_')) return null;
  const account = userEmail ? encodeURIComponent(userEmail) : '0';
  return `https://mail.google.com/mail/u/${account}/#all/${threadId}`;
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  commitment: Commitment | null; // null = closed
  todayStr:   string;
  userEmail:  string | null;
  onClose:    () => void;
}

// ── CommitmentDetailDialog ────────────────────────────────────────────────────

export function CommitmentDetailDialog({ commitment: c, todayStr, userEmail, onClose }: Props) {
  const [pending, startTransition] = useTransition();

  const open = c !== null;

  // Derive state safely even when c is null (Dialog is closed)
  const isDone      = c ? c.status === 'done'      : false;
  const isDismissed = c ? c.status === 'dismissed' : false;
  const isOverdue   = c ? c.status === 'open' && !!c.due_date && c.due_date < todayStr : false;
  const counterparty = c ? c.counterparty || c.counterparty_email || null : null;
  const gmail        = c ? gmailUrl(c.thread_id, userEmail) : null;

  function handleDone() {
    if (!c) return;
    onClose();
    startTransition(async () => {
      const result = await markCommitmentDone(c.id);
      if (result?.error) toast.error(result.error);
    });
  }

  function handleDismiss() {
    if (!c) return;
    onClose();
    startTransition(async () => {
      const result = await dismissCommitment(c.id);
      if (result?.error) toast.error(result.error);
    });
  }

  function handleReopen() {
    if (!c) return;
    onClose();
    startTransition(async () => {
      const result = await reopenCommitment(c.id);
      if (result?.error) toast.error(result.error);
    });
  }

  function handleRestore() {
    if (!c) return;
    onClose();
    startTransition(async () => {
      const result = await restoreCommitment(c.id);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        {c && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={cn(
                  'text-[10px] font-medium px-1.5 py-0.5 rounded border',
                  c.direction === 'outgoing'
                    ? 'text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/40'
                    : 'text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/40',
                )}>
                  {c.direction === 'outgoing' ? '↑ My promise' : '↓ Assigned to me'}
                </span>
                {isOverdue && (
                  <Badge variant="destructive" className="text-[10px] py-0">Overdue</Badge>
                )}
                {isDone && (
                  <Badge variant="secondary" className="text-[10px] py-0">Done</Badge>
                )}
                {isDismissed && (
                  <Badge variant="outline" className="text-[10px] py-0 text-muted-foreground">
                    Dismissed
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-sm font-medium leading-snug pr-6">
                {c.description}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Metadata */}
              <div className="text-xs text-muted-foreground space-y-1">
                {counterparty && (
                  <p>
                    {c.direction === 'outgoing' ? 'To' : 'From'}{' '}
                    <span className="font-medium text-foreground">{counterparty}</span>
                    {c.counterparty_email && c.counterparty !== c.counterparty_email && (
                      <span className="ml-1">({c.counterparty_email})</span>
                    )}
                  </p>
                )}
                <p className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Detected{' '}
                  {new Date(c.scanned_at).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </p>
                {isDone && c.resolved_at && (
                  <p>
                    Resolved{' '}
                    {new Date(c.resolved_at).toLocaleDateString('en-US', {
                      month: 'long', day: 'numeric', year: 'numeric',
                    })}
                  </p>
                )}
              </div>

              {/* Editable fields */}
              <div className="space-y-3 pt-3 border-t border-border">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">Priority</span>
                  <PriorityButton id={c.id} priority={c.priority ?? null} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">Due date</span>
                  <DueDateCell id={c.id} dueDate={c.due_date ?? null} />
                </div>
              </div>

              {/* Note */}
              <div className="space-y-1.5 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">Note</p>
                <NoteEditor id={c.id} note={c.note ?? null} />
              </div>

              {/* Gmail link */}
              {gmail && (
                <div className="pt-3 border-t border-border">
                  <a
                    href={gmail}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View email thread in Gmail
                  </a>
                </div>
              )}
            </div>

            <DialogFooter className="pt-2 border-t border-border">
              {isDismissed ? (
                <Button size="sm" variant="outline" onClick={handleRestore} disabled={pending}>
                  {pending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  Restore to open
                </Button>
              ) : isDone ? (
                <Button size="sm" variant="outline" onClick={handleReopen} disabled={pending}>
                  {pending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  Reopen
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-muted-foreground"
                    onClick={handleDismiss}
                    disabled={pending}
                  >
                    Dismiss
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 bg-green-600 hover:bg-green-700 text-white border-0"
                    onClick={handleDone}
                    disabled={pending}
                  >
                    {pending && <Loader2 className="w-3 h-3 animate-spin" />}
                    Mark done
                  </Button>
                </>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
