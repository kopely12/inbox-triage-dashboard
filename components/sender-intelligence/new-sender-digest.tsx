'use client';

import { useState, useTransition } from 'react';
import { UserPlus, Check, Ban, Clock, Loader2, ChevronDown, ChevronUp, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { reviewScreenerBatch, type ScreenerSender } from '@/app/actions/engagement';

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeDate(iso: string | null) {
  if (!iso) return null;
  const ms   = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Single sender row ─────────────────────────────────────────────────────────

function SenderRow({
  sender,
  onDecision,
  isPending,
}: {
  sender:     ScreenerSender;
  onDecision: (email: string, decision: 'approved' | 'blocked') => void;
  isPending:  boolean;
}) {
  const displayName = sender.sender_name || sender.sender_email;
  const domain      = sender.sender_domain || sender.sender_email.split('@')[1];
  const firstSeen   = relativeDate(sender.first_email_date || sender.created_at);

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-semibold text-muted-foreground uppercase select-none">
        {(sender.sender_name || sender.sender_email)[0]}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{displayName}</span>
          {sender.email_count > 1 && (
            <span className="text-[11px] text-muted-foreground shrink-0">
              {sender.email_count} emails
            </span>
          )}
          {firstSeen && (
            <span className="text-[11px] text-muted-foreground shrink-0">· first seen {firstSeen}</span>
          )}
        </div>
        {sender.sample_subject && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{sender.sample_subject}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          disabled={isPending}
          onClick={() => onDecision(sender.sender_email, 'approved')}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors dark:border-green-800 dark:bg-green-950/40 dark:text-green-400 disabled:opacity-50"
          title="Allow to inbox"
        >
          <Check className="w-3 h-3" />
          Allow
        </button>
        <button
          disabled={isPending}
          onClick={() => onDecision(sender.sender_email, 'blocked')}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors dark:border-red-800 dark:bg-red-950/40 dark:text-red-400 disabled:opacity-50"
          title="Block sender"
        >
          <Ban className="w-3 h-3" />
          Block
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function NewSenderDigest({
  initialQueue,
  screenerEnabled,
}: {
  initialQueue:    ScreenerSender[];
  screenerEnabled: boolean;
}) {
  const [queue,    setQueue]    = useState<ScreenerSender[]>(initialQueue);
  const [expanded, setExpanded] = useState(initialQueue.length > 0);
  const [isPending, startTransition] = useTransition();

  if (!screenerEnabled || queue.length === 0) return null;

  async function handleDecision(email: string, decision: 'approved' | 'blocked') {
    startTransition(async () => {
      const { error } = await reviewScreenerBatch([email], decision);
      if (error) { toast.error('Could not process decision'); return; }
      setQueue((prev) => prev.filter((s) => s.sender_email !== email));
      toast.success(decision === 'approved' ? 'Sender approved — emails moved to inbox.' : 'Sender blocked.');
    });
  }

  async function handleApproveAll() {
    const emails = queue.map((s) => s.sender_email);
    startTransition(async () => {
      const { error } = await reviewScreenerBatch(emails, 'approved');
      if (error) { toast.error('Could not approve all senders'); return; }
      setQueue([]);
      toast.success(`${emails.length} senders approved.`);
    });
  }

  async function handleBlockAll() {
    const emails = queue.map((s) => s.sender_email);
    startTransition(async () => {
      const { error } = await reviewScreenerBatch(emails, 'blocked');
      if (error) { toast.error('Could not block all senders'); return; }
      setQueue([]);
      toast.success(`${emails.length} senders blocked.`);
    });
  }

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30 overflow-hidden mb-4">
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
            {queue.length} new sender{queue.length !== 1 ? 's' : ''} pending review
          </span>
          <span className="text-xs text-blue-600/70 dark:text-blue-400/70 ml-2">
            intercepted by Screener
          </span>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-blue-500 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-blue-500 shrink-0" />
        }
      </button>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-3 border-t border-blue-200 dark:border-blue-800">
          <p className="text-xs text-blue-700/80 dark:text-blue-300/70 py-2.5">
            These first-time senders were held back from your inbox.
            Approve to deliver them; block to prevent future emails.
          </p>

          {/* Sender rows */}
          <div>
            {queue.map((sender) => (
              <SenderRow
                key={sender.id}
                sender={sender}
                onDecision={handleDecision}
                isPending={isPending}
              />
            ))}
          </div>

          {/* Bulk actions */}
          {queue.length > 1 && (
            <div className="flex items-center gap-2 pt-3 flex-wrap">
              <span className="text-xs text-muted-foreground">All {queue.length}:</span>
              <button
                disabled={isPending}
                onClick={handleApproveAll}
                className="flex items-center gap-1 text-xs px-3 py-1 rounded-md border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors dark:border-green-800 dark:bg-green-950/40 dark:text-green-400 disabled:opacity-50"
              >
                {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Approve all
              </button>
              <button
                disabled={isPending}
                onClick={handleBlockAll}
                className="flex items-center gap-1 text-xs px-3 py-1 rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors dark:border-red-800 dark:bg-red-950/40 dark:text-red-400 disabled:opacity-50"
              >
                {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                Block all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
