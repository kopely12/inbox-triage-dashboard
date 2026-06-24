'use client';

// ScreenerTab — New Sender Screener.
// Shows a review queue of first-time senders intercepted by the screener filter.
// Users can approve (move to inbox) or block (move to trash) in bulk.

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Shield, ShieldCheck, ShieldOff, Loader2, RefreshCw, Check, X, AlertTriangle, Info,
  ShieldAlert, ShieldQuestion, Plus, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { cn }     from '@/lib/utils';
import {
  enableScreener, disableScreener, getScreenerQueue, reviewScreenerBatch,
  triggerScreenerScan, addDomainToWhitelist, removeDomainFromWhitelist,
  type ScreenerSender, type TrustSignals, type ScreenerStats,
} from '@/app/actions/engagement';

// ── Component ─────────────────────────────────────────────────────────────────

export function ScreenerTab() {
  const [queue,    setQueue]    = useState<ScreenerSender[]>([]);
  const [settings, setSettings] = useState<{ enabled: boolean; last_scan: string | null; whitelist: string[] }>({
    enabled: false, last_scan: null, whitelist: [],
  });
  const [stats,    setStats]    = useState<ScreenerStats>({ total: 0, pending: 0, approved: 0, blocked: 0 });
  const [loading,  setLoading]  = useState(true);
  const [toggling, setToggling] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewing,           setReviewing]           = useState(false);
  const [showWhitelist,       setShowWhitelist]       = useState(false);
  const [newDomain,           setNewDomain]           = useState('');
  const [whitelistBusy,       setWhitelistBusy]       = useState(false);
  const [pendingRiskyApproval, setPendingRiskyApproval] = useState<ScreenerSender | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getScreenerQueue();
    if (!data.error) {
      setQueue(data.queue);
      setSettings(data.settings);
      setStats(data.stats ?? { total: 0, pending: 0, approved: 0, blocked: 0 });
    }
    setLoading(false);
  }, []);

  async function handleScanNow() {
    setScanning(true);
    const { error } = await triggerScreenerScan();
    setScanning(false);
    if (error) { toast.error(error); return; }
    // Auto-block high-risk senders after scan
    await load();
    setQueue((prev) => {
      const highRisk = prev.filter((s) =>
        s.lookalike_of ||
        s.trust_signals?.spf === 'fail' ||
        s.trust_signals?.dkim === 'fail',
      );
      if (highRisk.length > 0) {
        handleReview(highRisk.map((s) => s.sender_email), 'blocked');
        toast.success(`Scan complete — ${highRisk.length} high-risk sender${highRisk.length !== 1 ? 's' : ''} auto-blocked.`);
      } else {
        toast.success('Scan complete — queue updated.');
      }
      return prev;
    });
  }

  async function handleApproveAndWhitelist(sender: ScreenerSender) {
    const domain = sender.sender_domain ?? sender.sender_email.split('@')[1];
    if (!domain) { await handleReview([sender.sender_email], 'approved'); return; }
    setWhitelistBusy(true);
    await Promise.all([
      handleReview([sender.sender_email], 'approved'),
      addDomainToWhitelist(domain),
    ]);
    setWhitelistBusy(false);
    setSettings((s) => ({ ...s, whitelist: [...s.whitelist, domain] }));
    toast.success(`Approved and whitelisted @${domain} — future senders from this domain skip the screener.`);
  }

  async function handleAddWhitelistDomain() {
    const d = newDomain.trim().replace(/^@/, '').toLowerCase();
    if (!d) return;
    setWhitelistBusy(true);
    const { error } = await addDomainToWhitelist(d);
    setWhitelistBusy(false);
    if (error) { toast.error(error); return; }
    setSettings((s) => ({ ...s, whitelist: [...s.whitelist, d] }));
    setNewDomain('');
  }

  async function handleRemoveWhitelistDomain(domain: string) {
    setWhitelistBusy(true);
    const { error } = await removeDomainFromWhitelist(domain);
    setWhitelistBusy(false);
    if (error) { toast.error(error); return; }
    setSettings((s) => ({ ...s, whitelist: s.whitelist.filter((d) => d !== domain) }));
  }

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
          {settings.enabled && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowWhitelist((v) => !v)}
                title="Manage whitelisted domains"
              >
                <Shield className="w-3.5 h-3.5 mr-1.5" />
                Whitelist{settings.whitelist.length > 0 ? ` (${settings.whitelist.length})` : ''}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleScanNow}
                disabled={scanning || loading}
                title="Scan your inbox now for new senders"
              >
                <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', scanning && 'animate-spin')} />
                {scanning ? 'Scanning…' : 'Scan now'}
              </Button>
            </>
          )}
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
      {/* Stats strip — shown when screener has processed at least one sender */}
      {settings.enabled && stats.total > 0 && (
        <div className="flex items-center gap-6 px-6 py-2.5 bg-muted/40 border-b border-border text-xs text-muted-foreground shrink-0">
          <span><strong className="text-foreground tabular-nums">{stats.total}</strong> total screened</span>
          <span><strong className="text-green-600 tabular-nums">{stats.approved}</strong> approved</span>
          <span><strong className="text-red-600 tabular-nums">{stats.blocked}</strong> blocked</span>
          {stats.pending > 0 && (
            <span><strong className="text-amber-600 tabular-nums">{stats.pending}</strong> pending review</span>
          )}
        </div>
      )}

      {/* Domain whitelist panel */}
      {settings.enabled && showWhitelist && (
        <div className="px-6 py-4 border-b border-border bg-muted/20 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium">Whitelisted Domains</p>
            <button onClick={() => setShowWhitelist(false)} className="text-xs text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Senders from whitelisted domains bypass the screener and go straight to your inbox.
          </p>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddWhitelistDomain()}
              placeholder="example.com"
              className="flex-1 h-8 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Button size="sm" onClick={handleAddWhitelistDomain} disabled={whitelistBusy || !newDomain.trim()} className="h-8">
              <Plus className="w-3.5 h-3.5 mr-1" />Add
            </Button>
          </div>
          {settings.whitelist.length === 0 ? (
            <p className="text-xs text-muted-foreground">No whitelisted domains yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {settings.whitelist.map((domain) => (
                <span key={domain} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted border border-border">
                  @{domain}
                  <button onClick={() => handleRemoveWhitelistDomain(domain)} className="text-muted-foreground hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {!settings.enabled && (
        <div className="px-6 py-6 flex-1">
          <div className="pl-6 max-w-lg">
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

          {/* Risk summary banner — shown when lookalikes or auth failures in queue */}
          {(() => {
            const lookalikes = queue.filter((s) => s.lookalike_of);
            const authFails  = queue.filter((s) =>
              s.trust_signals && (s.trust_signals.spf === 'fail' || s.trust_signals.dkim === 'fail'),
            );
            if (!lookalikes.length && !authFails.length) return null;
            return (
              <div className="flex items-center gap-2 px-6 py-2.5 bg-red-50 border-b border-red-200 text-red-800 text-sm shrink-0">
                <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" />
                <span className="flex-1">
                  {lookalikes.length > 0 && (
                    <><strong>{lookalikes.length}</strong> sender{lookalikes.length !== 1 ? 's' : ''} resemble{lookalikes.length === 1 ? 's' : ''} a domain you trust — possible impersonation.{' '}</>
                  )}
                  {authFails.length > 0 && (
                    <><strong>{authFails.length}</strong> sender{authFails.length !== 1 ? 's' : ''} failed email authentication (SPF/DKIM).</>
                  )}
                </span>
              </div>
            );
          })()}

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
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Trust</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground hidden lg:table-cell">Emails</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden xl:table-cell">First Seen</th>
                    <th className="px-4 py-3 w-28" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...queue].sort((a, b) => {
                    // Lookalikes first, then auth failures, then the rest
                    const riskScore = (s: ScreenerSender) =>
                      s.lookalike_of ? 2 :
                      (s.trust_signals?.spf === 'fail' || s.trust_signals?.dkim === 'fail') ? 1 : 0;
                    return riskScore(b) - riskScore(a);
                  }).map((sender) => {
                    const isRisky = !!sender.lookalike_of ||
                      sender.trust_signals?.spf === 'fail' ||
                      sender.trust_signals?.dkim === 'fail';
                    return (
                      <ScreenerRow
                        key={sender.sender_email}
                        sender={sender}
                        isSelected={selected.has(sender.sender_email)}
                        onToggle={() => toggleRow(sender.sender_email)}
                        onApprove={() => isRisky
                          ? setPendingRiskyApproval(sender)
                          : handleReview([sender.sender_email], 'approved')
                        }
                        onApproveAndWhitelist={() => handleApproveAndWhitelist(sender)}
                        onBlock={() => handleReview([sender.sender_email], 'blocked')}
                        reviewing={reviewing || whitelistBusy}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Risky sender approval confirmation dialog ───────────────────────── */}
      <Dialog open={!!pendingRiskyApproval} onOpenChange={(open) => { if (!open) setPendingRiskyApproval(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <ShieldAlert className="w-5 h-5 text-amber-600" />
              Approve risky sender?
            </DialogTitle>
          </DialogHeader>
          {pendingRiskyApproval && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                <strong className="text-foreground">{pendingRiskyApproval.sender_name || pendingRiskyApproval.sender_email}</strong> has been flagged as potentially unsafe:
              </p>
              <ul className="space-y-1.5 pl-4">
                {pendingRiskyApproval.lookalike_of && (
                  <li className="flex items-start gap-2 text-red-700">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    Domain resembles <strong>{pendingRiskyApproval.lookalike_of}</strong> — possible impersonation
                  </li>
                )}
                {(pendingRiskyApproval.trust_signals?.spf === 'fail' || pendingRiskyApproval.trust_signals?.dkim === 'fail') && (
                  <li className="flex items-start gap-2 text-orange-700">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    Failed email authentication (SPF: {pendingRiskyApproval.trust_signals?.spf ?? '—'} · DKIM: {pendingRiskyApproval.trust_signals?.dkim ?? '—'})
                  </li>
                )}
              </ul>
              <p className="text-muted-foreground text-xs">
                Approving will move their email to your inbox. You can block them later from Senders if needed.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPendingRiskyApproval(null)}>
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                if (pendingRiskyApproval) {
                  handleReview([pendingRiskyApproval.sender_email], 'approved');
                  setPendingRiskyApproval(null);
                }
              }}
            >
              Approve anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── TrustBadges ───────────────────────────────────────────────────────────────

function TrustBadges({ signals, lookalikeOf }: { signals: TrustSignals | null; lookalikeOf: string | null }) {
  if (!signals && !lookalikeOf) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const badges: React.ReactNode[] = [];

  if (lookalikeOf) {
    badges.push(
      <span
        key="lookalike"
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 border border-red-200"
        title={`This domain closely resembles "${lookalikeOf}" — possible impersonation`}
      >
        <ShieldAlert className="w-2.5 h-2.5" />
        Looks like {lookalikeOf}
      </span>,
    );
  }

  if (signals) {
    const authStatus = (() => {
      if (signals.spf === 'fail' || signals.dkim === 'fail') return 'fail';
      if (signals.spf === 'pass' && signals.dkim === 'pass') return 'pass';
      if (signals.dmarc === 'pass') return 'pass';
      return 'unknown';
    })();

    if (authStatus === 'fail') {
      badges.push(
        <span
          key="auth"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700 border border-orange-200"
          title={`Email authentication failed — SPF: ${signals.spf} · DKIM: ${signals.dkim} · DMARC: ${signals.dmarc}`}
        >
          <ShieldAlert className="w-2.5 h-2.5" />
          Unverified
        </span>,
      );
    } else if (authStatus === 'pass') {
      badges.push(
        <span
          key="auth"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-200"
          title={`Email authentication passed — SPF: ${signals.spf} · DKIM: ${signals.dkim} · DMARC: ${signals.dmarc}`}
        >
          <ShieldCheck className="w-2.5 h-2.5" />
          Verified
        </span>,
      );
    }
    // Unknown auth: show nothing — absence of badge means inconclusive
  }

  return <div className="flex flex-col gap-1">{badges}</div>;
}

// ── ScreenerRow ───────────────────────────────────────────────────────────────

function ScreenerRow({
  sender, isSelected, onToggle, onApprove, onApproveAndWhitelist, onBlock, reviewing,
}: {
  sender:                 ScreenerSender;
  isSelected:             boolean;
  onToggle:               () => void;
  onApprove:              () => void;
  onApproveAndWhitelist:  () => void;
  onBlock:                () => void;
  reviewing:              boolean;
}) {
  const isRisky = !!sender.lookalike_of ||
    (sender.trust_signals?.spf === 'fail' || sender.trust_signals?.dkim === 'fail');

  return (
    <tr className={cn(
      'hover:bg-muted/30 transition-colors',
      isSelected && 'bg-primary/5',
      isRisky && 'bg-red-50/50',
    )}>
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
      <td className="px-4 py-3 hidden lg:table-cell">
        <TrustBadges signals={sender.trust_signals} lookalikeOf={sender.lookalike_of} />
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
          {sender.sender_domain && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-green-700 hover:text-green-800 hover:bg-green-50 border border-green-200"
              onClick={onApproveAndWhitelist}
              disabled={reviewing}
              title={`Approve and whitelist @${sender.sender_domain}`}
            >
              <ShieldCheck className="w-3 h-3 mr-1" />
              + Whitelist
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              'h-7 px-2 text-xs border',
              isRisky
                ? 'text-red-700 hover:text-red-800 hover:bg-red-100 border-red-300 bg-red-50 font-medium'
                : 'text-red-700 hover:text-red-800 hover:bg-red-50 border-red-200',
            )}
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
