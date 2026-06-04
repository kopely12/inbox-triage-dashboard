'use client';

// BundleContentsTab — live view of emails currently held in the Bundle label.
// Shows sender breakdown, release-to-inbox action, and digest send.

import { useState, useEffect, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast }    from 'sonner';
import { Package, Clock, SendHorizonal, Inbox, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getBundleContents, releaseBundleNow, sendDigestNow, type BundleContents } from '@/app/actions/bundle';
import { BundlePanel } from '@/components/bundle/bundle-panel';

const DASHBOARD_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

function hourLabel(h: number, timezone: string): string {
  const period  = h < 12 ? 'AM' : 'PM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  try {
    const tzShort = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '';
    return `${display}:00 ${period} ${tzShort}`;
  } catch {
    return `${display}:00 ${period}`;
  }
}

export function BundleContentsTab() {
  const router = useRouter();
  const [contents,  setContents]  = useState<BundleContents | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const { contents: c, error } = await getBundleContents();
    if (error) toast.error(error);
    else if (c) setContents(c);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleRelease() {
    startTransition(async () => {
      const { released, error } = await releaseBundleNow();
      if (error) { toast.error(error); return; }
      toast.success(`${released} email${released !== 1 ? 's' : ''} moved to your inbox.`);
      await load();
      router.refresh();
    });
  }

  function handleSendDigest() {
    startTransition(async () => {
      const result = await sendDigestNow();
      if (result.error) { toast.error(result.error); return; }
      if (!result.sent) {
        toast.info(result.reason === 'empty_bundle' ? 'Bundle is empty — nothing to digest.' : 'Nothing to send.');
        return;
      }
      toast.success(
        `Digest sent — ${result.emailCount} emails from ${result.senderCount} senders.`,
        { description: 'Check your inbox for the summary.' },
      );
    });
  }

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 gap-2 text-muted-foreground py-20">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading bundle…</span>
      </div>
    );
  }

  // ── Not enabled — show setup inline ─────────────────────────────────────────

  if (!contents?.enabled) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-lg mx-auto px-6 py-6">
          <h2 className="text-sm font-semibold mb-0.5">Email Bundles</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Hold newsletters and low-priority senders out of your inbox and
            deliver them as a single daily digest.
          </p>
          <BundlePanel />
        </div>
      </div>
    );
  }

  // ── Empty bundle ────────────────────────────────────────────────────────────

  if (contents.emailCount === 0) {
    const nextDelivery = hourLabel(contents.deliveryHour, contents.timezone);
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground py-20">
        <Package className="w-10 h-10 opacity-30" />
        <p className="text-sm font-medium text-foreground">Bundle is empty</p>
        <p className="text-xs text-center max-w-xs leading-relaxed">
          Gmail filters are active. Emails from your bundled senders will be intercepted
          as they arrive and held here — your next digest goes out at{' '}
          <strong className="text-foreground">{nextDelivery}</strong>.
        </p>
        <p className="text-xs text-center max-w-xs text-muted-foreground/70">
          Nothing to do — check back after your first bundled email arrives.
        </p>
      </div>
    );
  }

  // ── Contents ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-start justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h2 className="text-sm font-semibold">Bundle</h2>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
            <Package className="w-3.5 h-3.5" />
            <span>{contents.emailCount} email{contents.emailCount !== 1 ? 's' : ''} held</span>
            <span>·</span>
            <Clock className="w-3.5 h-3.5" />
            <span>Digest at {hourLabel(contents.deliveryHour, contents.timezone)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSendDigest}
            disabled={isPending}
            className="h-8 text-xs"
          >
            {isPending
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <SendHorizonal className="w-3.5 h-3.5 mr-1.5" />
            }
            Send digest now
          </Button>
          <Button
            size="sm"
            onClick={handleRelease}
            disabled={isPending}
            className="h-8 text-xs"
          >
            {isPending
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <Inbox className="w-3.5 h-3.5 mr-1.5" />
            }
            Release all to inbox
          </Button>
        </div>
      </div>

      {/* Sender breakdown */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card border-b border-border z-10">
            <tr>
              <th className="px-6 py-3 text-left font-medium text-muted-foreground">Sender</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Latest subject</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground w-20">Held</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {contents.senders.map((s) => (
              <tr key={s.name} className="hover:bg-muted/30 transition-colors">
                <td className="px-6 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell max-w-sm">
                  <span className="line-clamp-1">{s.latestSubject || '—'}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{s.count}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer nudge to Gmail */}
        <div className="px-6 py-4 border-t border-border">
          <a
            href="https://mail.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open InboxTriage/Bundle label in Gmail
          </a>
        </div>
      </div>
    </div>
  );
}
