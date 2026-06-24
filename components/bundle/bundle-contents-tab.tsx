'use client';

// BundleContentsTab — live view of emails currently held in the Bundle label.
// Shows sender breakdown, per-sender release, pause toggle, and digest history.

import { useState, useEffect, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast }    from 'sonner';
import {
  Package, Clock, SendHorizonal, Inbox, Loader2, ExternalLink,
  PauseCircle, PlayCircle, History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getBundleContents, releaseBundleNow, sendDigestNow, setBundlePaused,
  type BundleContents,
} from '@/app/actions/bundle';
import { BundlePanel } from '@/components/bundle/bundle-panel';
import { useSession } from 'next-auth/react';

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

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor(diff / 60_000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return `${m}m ago`;
}

export function BundleContentsTab() {
  const router = useRouter();
  const { data: session } = useSession();
  const gmailAcct = session?.user?.email ? encodeURIComponent(session.user.email) : '0';
  const [contents,  setContents]  = useState<BundleContents | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [isPending, startTransition] = useTransition();
  const [releasingEmail, setReleasingEmail] = useState<string | null>(null);

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

  function handleReleaseSender(email: string, name: string) {
    setReleasingEmail(email);
    startTransition(async () => {
      const { released, error } = await releaseBundleNow(email);
      setReleasingEmail(null);
      if (error) { toast.error(error); return; }
      toast.success(`${released} email${released !== 1 ? 's' : ''} from ${name} moved to inbox.`);
      await load();
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
      await load();
    });
  }

  function handleTogglePause() {
    if (!contents) return;
    const next = !contents.paused;
    setContents((c) => c ? { ...c, paused: next } : c);
    startTransition(async () => {
      const { error } = await setBundlePaused(next);
      if (error) {
        setContents((c) => c ? { ...c, paused: !next } : c);
        toast.error(`Failed to ${next ? 'pause' : 'resume'} bundle: ${error}`);
      } else {
        toast.success(next
          ? 'Bundle paused — new emails will flow to inbox until resumed.'
          : 'Bundle resumed — emails will be intercepted again.');
      }
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
      <div className="px-6 py-6 flex-1">
        <div className="max-w-lg">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-primary/10">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Email Bundles</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Hold newsletters and low-priority senders out of your inbox and
                deliver them as a single daily digest.
              </p>
            </div>
          </div>
          <BundlePanel />
        </div>
      </div>
    );
  }

  // ── Empty bundle ────────────────────────────────────────────────────────────

  if (contents.emailCount === 0) {
    const nextDelivery = hourLabel(contents.deliveryHour, contents.timezone);
    return (
      <div className="flex flex-col flex-1 overflow-auto">
        <div className="flex items-start justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-primary/10">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Bundle</h2>
              <p className="text-xs text-muted-foreground mt-0.5">No emails held</p>
            </div>
          </div>
          <Button
            variant={contents.paused ? 'default' : 'outline'}
            size="sm"
            onClick={handleTogglePause}
            disabled={isPending}
            className="h-8 text-xs gap-1.5"
          >
            {contents.paused
              ? <><PlayCircle className="w-3.5 h-3.5" /> Resume</>
              : <><PauseCircle className="w-3.5 h-3.5" /> Pause</>
            }
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground py-20">
          <Package className="w-10 h-10 opacity-30" />
          <p className="text-sm font-medium text-foreground">Bundle is empty</p>
          <p className="text-xs text-center max-w-xs leading-relaxed">
            {contents.paused
              ? 'Bundle is paused — emails are flowing to your inbox. Resume to start intercepting again.'
              : <>Gmail filters are active. Emails from your bundled senders will be intercepted
                as they arrive and held here — your next digest goes out at{' '}
                <strong className="text-foreground">{nextDelivery}</strong>.</>
            }
          </p>
          {contents.lastDigestAt && (
            <p className="text-xs text-muted-foreground/60 flex items-center gap-1">
              <History className="w-3 h-3" />
              Last digest {relativeDate(contents.lastDigestAt)}
              {contents.lastDigestCount != null && ` · ${contents.lastDigestCount} emails`}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Contents ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-start justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-primary/10">
            <Package className="w-5 h-5 text-primary" />
          </div>
          <div>
          <h2 className="text-sm font-semibold">Bundle</h2>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground flex-wrap">
            <Package className="w-3.5 h-3.5" />
            <span>{contents.emailCount} email{contents.emailCount !== 1 ? 's' : ''} held</span>
            <span>·</span>
            <Clock className="w-3.5 h-3.5" />
            <span>Digest at {hourLabel(contents.deliveryHour, contents.timezone)}</span>
            {contents.lastDigestAt && (
              <>
                <span>·</span>
                <History className="w-3.5 h-3.5" />
                <span>Last sent {relativeDate(contents.lastDigestAt)}
                  {contents.lastDigestCount != null && ` (${contents.lastDigestCount} emails)`}
                </span>
              </>
            )}
          </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <Button
            variant={contents.paused ? 'default' : 'outline'}
            size="sm"
            onClick={handleTogglePause}
            disabled={isPending}
            className="h-8 text-xs gap-1.5"
          >
            {contents.paused
              ? <><PlayCircle className="w-3.5 h-3.5" /> Resume</>
              : <><PauseCircle className="w-3.5 h-3.5" /> Pause</>
            }
          </Button>
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
            Release all
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
              <th className="px-4 py-3 w-28" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {contents.senders.map((s) => (
              <tr key={s.email} className="hover:bg-muted/30 transition-colors group">
                <td className="px-6 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell max-w-sm">
                  <span className="line-clamp-1">{s.latestSubject || '—'}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{s.count}</td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    disabled={isPending}
                    onClick={() => handleReleaseSender(s.email, s.name)}
                  >
                    {releasingEmail === s.email
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <><Inbox className="w-3 h-3 mr-1" />Release</>
                    }
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer nudge to Gmail */}
        <div className="px-6 py-4 border-t border-border">
          <a
            href={`https://mail.google.com/mail/u/${gmailAcct}/`}
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
