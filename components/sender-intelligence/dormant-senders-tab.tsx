'use client';

// DormantSendersTab — surfaces senders who email regularly but are never opened.
// Provides a focused cleanup queue with per-row and bulk Unsubscribe / Keep actions.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Clock, MailX, EyeOff, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { executeBulkAction } from '@/app/actions/engagement';
import type { SenderRow } from './sender-intelligence-client';

// ── Dormant predicate ─────────────────────────────────────────────────────────
// A sender is dormant when they've sent meaningful volume but you've opened
// virtually nothing. Excludes already-unsubscribed and known contacts.

export function isDormant(s: SenderRow): boolean {
  if (s.unsubscribe_status === 'unsubscribed') return false;
  if (s.category === 'known_contact') return false;
  if (s.emails_received < 5) return false;
  return s.emails_opened === 0 || (s.engagement_rate ?? 0) < 0.05;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  senders:    SenderRow[];
  userDomain: string | null | undefined;
}

export function DormantSendersTab({ senders, userDomain }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Filter + exclude internal senders, sort noisiest first
  const dormant = senders
    .filter(isDormant)
    .filter((s) => {
      if (!userDomain) return true;
      return (
        s.sender_domain !== userDomain &&
        !s.sender_email.endsWith('@' + userDomain)
      );
    })
    .sort((a, b) => b.emails_received - a.emails_received);

  const totalPerMonth = dormant.reduce((n, s) => {
    return n + Math.round((s.emails_received / (s.period_days || 90)) * 30);
  }, 0);

  // ── Selection helpers ─────────────────────────────────────────────────────

  function toggleAll() {
    if (selected.size === dormant.length) setSelected(new Set());
    else setSelected(new Set(dormant.map((s) => s.sender_email)));
  }

  function toggleRow(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  function doAction(action: 'unsubscribe' | 'ignore', emails: string[]) {
    if (!emails.length) return;
    startTransition(async () => {
      const result = await executeBulkAction(action, emails, false, null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const verb = action === 'unsubscribe' ? 'unsubscribed' : 'kept';
      toast.success(
        `${result.succeeded} sender${result.succeeded !== 1 ? 's' : ''} ${verb}.`,
        action === 'unsubscribe'
          ? { description: 'Auto-archive enabled — future emails will skip your inbox.' }
          : undefined,
      );
      setSelected(new Set());
      router.refresh();
    });
  }

  const selectedEmails = Array.from(selected);

  // ── Empty state ───────────────────────────────────────────────────────────

  if (dormant.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground py-20">
        <Clock className="w-10 h-10 opacity-30" />
        <p className="text-sm font-medium">No dormant senders</p>
        <p className="text-xs text-center max-w-xs text-muted-foreground">
          Senders who emailed you in the last 90 days but you opened less than
          5% of the time will appear here after your next inbox analysis.
        </p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-start justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h2 className="text-sm font-semibold">Dormant Senders</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {dormant.length} sender{dormant.length !== 1 ? 's' : ''} emailed
            you in the last 90 days — you opened less than 5% of their emails.
            {totalPerMonth > 0 && (
              <> ~{totalPerMonth.toLocaleString()} emails/month going unread.</>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => doAction('unsubscribe', dormant.map((s) => s.sender_email))}
          disabled={isPending}
          className="border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300 shrink-0"
        >
          {isPending
            ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            : <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          }
          Unsubscribe All ({dormant.length})
        </Button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-6 py-2.5 bg-primary/5 border-b border-primary/20 shrink-0">
          <span className="text-sm font-medium text-primary">
            {selected.size} sender{selected.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={() => doAction('unsubscribe', selectedEmails)}
              disabled={isPending}
              className="border-red-200 text-red-700 hover:bg-red-50"
            >
              {isPending
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <MailX className="w-3.5 h-3.5 mr-1.5" />
              }
              Unsubscribe ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => doAction('ignore', selectedEmails)}
              disabled={isPending}
            >
              <EyeOff className="w-3.5 h-3.5 mr-1.5" />
              Keep ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card border-b border-border z-10">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={selected.size === dormant.length && dormant.length > 0}
                  onChange={toggleAll}
                  className="rounded border-gray-300 cursor-pointer"
                  title="Select all"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Sender
              </th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground hidden md:table-cell">
                Emails/mo
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">
                Last email
              </th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground hidden lg:table-cell">
                Open rate
              </th>
              <th className="px-4 py-3 w-40" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {dormant.map((s) => (
              <DormantRow
                key={s.sender_email}
                sender={s}
                isSelected={selected.has(s.sender_email)}
                onToggle={() => toggleRow(s.sender_email)}
                onUnsubscribe={() => doAction('unsubscribe', [s.sender_email])}
                onKeep={() => doAction('ignore', [s.sender_email])}
                isPending={isPending}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── DormantRow ────────────────────────────────────────────────────────────────

function DormantRow({
  sender, isSelected, onToggle, onUnsubscribe, onKeep, isPending,
}: {
  sender:        SenderRow;
  isSelected:    boolean;
  onToggle:      () => void;
  onUnsubscribe: () => void;
  onKeep:        () => void;
  isPending:     boolean;
}) {
  const perMonth = Math.round(
    (sender.emails_received / (sender.period_days || 90)) * 30,
  );
  const openPct = Math.round((sender.engagement_rate ?? 0) * 100);
  const neverOpened = sender.emails_opened === 0;

  return (
    <tr className={cn(
      'hover:bg-muted/30 transition-colors',
      isSelected && 'bg-primary/5',
    )}>
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
        <div className="font-medium truncate">
          {sender.sender_name || sender.sender_email}
        </div>
        {sender.sender_name && (
          <div className="text-xs text-muted-foreground truncate">
            {sender.sender_email}
          </div>
        )}
      </td>

      {/* Emails/mo */}
      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">
        {perMonth}
      </td>

      {/* Last email */}
      <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
        {sender.last_email_date
          ? new Date(sender.last_email_date).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            })
          : '—'}
      </td>

      {/* Open rate */}
      <td className="px-4 py-3 text-right hidden lg:table-cell">
        <span className={cn(
          'text-xs font-medium',
          neverOpened ? 'text-red-600' : 'text-amber-600',
        )}>
          {neverOpened ? 'Never opened' : `${openPct}%`}
        </span>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 justify-end">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-red-700 hover:text-red-800 hover:bg-red-50 border border-red-200"
            onClick={onUnsubscribe}
            disabled={isPending}
            title="Send unsubscribe request and auto-archive future emails"
          >
            <MailX className="w-3 h-3 mr-1" />
            Unsubscribe
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs border border-border hover:bg-muted"
            onClick={onKeep}
            disabled={isPending}
            title="Keep — remove from cleanup suggestions"
          >
            Keep
          </Button>
        </div>
      </td>
    </tr>
  );
}
