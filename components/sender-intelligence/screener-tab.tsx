'use client';

// ScreenerTab — New Sender Screener.
// Shows a review queue of first-time senders intercepted by the screener filter.
// Users can approve (move to inbox) or block (move to trash) in bulk.

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Shield, ShieldCheck, ShieldOff, Loader2, RefreshCw, Check, X, AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn }     from '@/lib/utils';
import {
  enableScreener, disableScreener, getScreenerQueue, reviewScreenerBatch,
  type ScreenerSender,
} from '@/app/actions/engagement';

// ── Component ─────────────────────────────────────────────────────────────────

export function ScreenerTab() {
  const [queue,    setQueue]    = useState<ScreenerSender[]>([]);
  const [settings, setSettings] = useState<{ enabled: boolean; last_scan: string | null; whitelist: string[] }>({
    enabled: false, last_scan: null, whitelist: [],
  });
  const [loading,  setLoading]  = useState(true);
  const [toggling, setToggling] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getScreenerQueue();
    if (!data.error) {
      setQueue(data.queue);
      setSettings(data.settings);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh queue every 30s while screener is enabled
  useEffect(() => {
    if (!settings.enabled) return;
    const id = setInterval(() => load(), 30_000);
    return () => clearInterval(id);
  }, [settings.enabled, load]);

  async function handleToggle() {
    setToggling(true);
    if (settings.enabled) {
      const { success, error } = await disableScreener();
      if (error) toast.error(error);
      else {
        toast.success('Screener disabled — new senders will go to your inbox normally.');
        setSettings((s) => ({ ...s, enabled: false }));
      }
    } else {
      const { success, error } = await enableScreener();
      if (error) toast.error(error);
      else {
        toast.success('Screener enabled! New senders will be held for review.');
        setSettings((s) => ({ ...s, enabled: true }));
        load();
      }
    }
    setToggling(false);
  }

  async function handleReview(emails: string[], decision: 'approved' | 'blocked') {
    if (!emails.length) return;
    setReviewing(true);
    const { processed, error } = await reviewScreenerBatch(emails, decision);
    setReviewing(false);
    if (error) {
      toast.error(error);
      return;
    }
    const label = decision === 'approved' ? 'approved' : 'blocked';
    toast.success(`${processed} sender${processed !== 1 ? 's' : ''} ${label}.`);
    setSelected(new Set());
    setQueue((prev) => prev.filter((s) => !emails.includes(s.sender_email)));
  }

  function toggleAll() {
    if (selected.size === queue.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(queue.map((s) => s.sender_email)));
    }
  }

  function toggleRow(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  const selectedEmails = Array.from(selected);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground py-20">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm">Loading screener…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-start gap-3">
          <div className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
            settings.enabled ? 'bg-primary/10' : 'bg-muted',
          )}>
            {settings.enabled
              ? <ShieldCheck className="w-5 h-5 text-primary" />
              : <Shield className="w-5 h-5 text-muted-foreground" />
            }
          </div>
          <div>
            <h2 className="text-sm font-semibold">New Sender Screener</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {settings.enabled
                ? `Active${settings.last_scan ? ` · last scanned ${formatRelative(settings.last_scan)}` : ''}`
                : 'Disabled — new senders go straight to your inbox'
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            variant={settings.enabled ? 'outline' : 'default'}
            size="sm"
            onClick={handleToggle}
            disabled={toggling}
          >
            {toggling && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            {settings.enabled
              ? <><ShieldOff className="w-3.5 h-3.5 mr-1.5" />Disable</>
              : <><ShieldCheck className="w-3.5 h-3.5 mr-1.5" />Enable Screener</>
            }
          </Button>
        </div>
      </div>

      {/* ── Explainer (when disabled) ───────────────────────────────────────── */}
      {!settings.enabled && (
        <div className="px-6 py-6 flex-1">
          <div className="max-w-lg">
            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900 mb-6">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
              <div className="space-y-1">
                <p className="font-medium">How the Screener works</p>
                <p className="text-blue-800">
                  When enabled, emails from senders you&apos;ve never received before are moved to a
                  &quot;New Senders&quot; folder for your review instead of landing in your inbox.
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-blue-800 mt-2">
                  <li>Personal emails (no unsubscribe link, single recipient) are always passed through</li>
                  <li>Existing senders are not affected</li>
                  <li>Approve senders to move them back to your inbox</li>
                  <li>Block senders to send them straight to trash</li>
                </ul>
              </div>
            </div>
            <Button size="lg" onClick={handleToggle} disabled={toggling}>
              {toggling
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enabling…</>
                : <><ShieldCheck className="w-4 h-4 mr-2" />Enable New Sender Screener</>
              }
            </Button>
          </div>
        </div>
      )}

      {/* ── Queue (when enabled) ────────────────────────────────────────────── */}
      {settings.enabled && (
        <>
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
                  onClick={() => handleReview(selectedEmails, 'approved')}
                  disabled={reviewing}
                  className="border-green-200 text-green-700 hover:bg-green-50"
                >
                  {reviewing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                  Approve {selected.size > 1 ? `(${selected.size})` : ''}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleReview(selectedEmails, 'blocked')}
                  disabled={reviewing}
                  className="border-red-200 text-red-700 hover:bg-red-50"
                >
                  {reviewing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <X className="w-3.5 h-3.5 mr-1.5" />}
                  Block {selected.size > 1 ? `(${selected.size})` : ''}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Empty queue */}
          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground py-20">
              <ShieldCheck className="w-10 h-10 opacity-30" />
              <p className="text-sm font-medium">No new senders to review</p>
              <p className="text-xs text-center max-w-xs">
                The screener runs every few hours. When new senders appear, they&apos;ll show up here for your review.
              </p>
            </div>
          ) : (
            /* Queue table */
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card border-b border-border z-10">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selected.size === queue.length && queue.length > 0}
                        onChange={toggleAll}
                        className="rounded border-gray-300 cursor-pointer"
                        title="Select all"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Sender</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Sample Subject</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground hidden lg:table-cell">Emails</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden xl:table-cell">First Seen</th>
                    <th className="px-4 py-3 w-28" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {queue.map((sender) => (
                    <ScreenerRow
                      key={sender.sender_email}
                      sender={sender}
                      isSelected={selected.has(sender.sender_email)}
                      onToggle={() => toggleRow(sender.sender_email)}
                      onApprove={() => handleReview([sender.sender_email], 'approved')}
                      onBlock={() => handleReview([sender.sender_email], 'blocked')}
                      reviewing={reviewing}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── ScreenerRow ───────────────────────────────────────────────────────────────

function ScreenerRow({
  sender, isSelected, onToggle, onApprove, onBlock, reviewing,
}: {
  sender:     ScreenerSender;
  isSelected: boolean;
  onToggle:   () => void;
  onApprove:  () => void;
  onBlock:    () => void;
  reviewing:  boolean;
}) {
  return (
    <tr className={cn('hover:bg-muted/30 transition-colors', isSelected && 'bg-primary/5')}>
      <td className="px-4 py-3 w-10">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          className="rounded border-gray-300 cursor-pointer"
        />
      </td>
      <td className="px-4 py-3 max-w-xs">
        <div className="font-medium truncate">{sender.sender_name || sender.sender_email}</div>
        {sender.sender_name && (
          <div className="text-xs text-muted-foreground truncate">{sender.sender_email}</div>
        )}
        {sender.sender_domain && !sender.sender_name && (
          <div className="text-xs text-muted-foreground">{sender.sender_domain}</div>
        )}
      </td>
      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell max-w-sm">
        <span className="line-clamp-1 text-xs">{sender.sample_subject || '—'}</span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden lg:table-cell">
        {sender.email_count}
      </td>
      <td className="px-4 py-3 text-muted-foreground text-xs hidden xl:table-cell">
        {sender.first_email_date
          ? new Date(sender.first_email_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '—'}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 justify-end">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-green-700 hover:text-green-800 hover:bg-green-50 border border-green-200"
            onClick={onApprove}
            disabled={reviewing}
            title="Approve — move to inbox"
          >
            <Check className="w-3 h-3 mr-1" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-red-700 hover:text-red-800 hover:bg-red-50 border border-red-200"
            onClick={onBlock}
            disabled={reviewing}
            title="Block — move to trash"
          >
            <X className="w-3 h-3 mr-1" />
            Block
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelative(iso: string) {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
