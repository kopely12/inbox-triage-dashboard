'use client';

// DeepCleanPanel — cross-sender deletion by category + age.
// Lets power users wipe out all noise emails in one pass
// without needing to select individual senders.

import { useState, useEffect, useCallback, useTransition } from 'react';
import { toast } from 'sonner';
import { Zap, AlertTriangle, Loader2, ChevronDown, ChevronUp, X, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn }     from '@/lib/utils';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { estimateDeepClean, runDeepClean, getCleanupSchedule, saveCleanupSchedule, type CleanupJob, type CleanupSchedule } from '@/app/actions/engagement';
import { SafetyScanModal }  from './safety-scan-modal';

const CATEGORY_OPTIONS = [
  { key: 'never_engage',  label: 'Never Open',   description: 'Senders you never open',           defaultOn: true,  safe: true  },
  { key: 'rarely_engage', label: 'Rarely Open',  description: 'Senders you open less than 25% of the time', defaultOn: true,  safe: true  },
  { key: 'regular',       label: 'Regular',      description: 'Senders with average engagement',  defaultOn: false, safe: false },
  { key: 'transactional', label: 'Transactional',description: 'Receipts, invoices, order confirmations', defaultOn: false, safe: false },
] as const;

const AGE_OPTIONS = [
  { days: 90,   label: '3 months' },
  { days: 180,  label: '6 months' },
  { days: 365,  label: '1 year'   },
  { days: 730,  label: '2 years'  },
  { days: null, label: 'All time' },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function DeepCleanPanel({
  onJobCreated,
}: {
  onJobCreated: (job: CleanupJob) => void;
}) {
  const [categories,         setCategories]         = useState<string[]>(['never_engage', 'rarely_engage']);
  const [olderThanDays,      setOlderThanDays]      = useState<number | null>(365);
  const [estimate,           setEstimate]           = useState<{ senders: number; estimated_emails: number; sender_emails: string[] } | null>(null);
  const [estimating,         setEstimating]         = useState(false);
  const [running,            setRunning]            = useState(false);
  const [showConfirm,        setShowConfirm]        = useState(false);
  const [showAllTimeConfirm, setShowAllTimeConfirm] = useState(false);
  const [showScan,           setShowScan]           = useState(false);
  const [showSenders,        setShowSenders]        = useState(false);
  const [excluded,           setExcluded]           = useState<Set<string>>(new Set());

  // Schedule state
  const [schedEnabled, setSchedEnabled] = useState(false);
  const [schedFreq,    setSchedFreq]    = useState<CleanupSchedule['frequency']>('weekly');
  const [schedDay,     setSchedDay]     = useState('sunday');

  // Re-estimate whenever settings change; reset exclusions on new estimate
  const loadEstimate = useCallback(async () => {
    if (!categories.length) { setEstimate(null); return; }
    setEstimating(true);
    const data = await estimateDeepClean(categories, olderThanDays);
    setEstimating(false);
    if (!data.error) {
      setEstimate({
        senders:          data.senders,
        estimated_emails: data.estimated_emails,
        sender_emails:    data.sender_emails ?? [],
      });
      setExcluded(new Set());
    }
  }, [categories, olderThanDays]);

  useEffect(() => {
    const t = setTimeout(loadEstimate, 400);
    return () => clearTimeout(t);
  }, [loadEstimate]);

  // Load saved schedule on mount
  useEffect(() => {
    getCleanupSchedule().then(({ schedule }) => {
      if (!schedule) return;
      setSchedEnabled(schedule.enabled ?? false);
      setSchedFreq(schedule.frequency ?? 'weekly');
      setSchedDay(schedule.day_of_week ?? 'sunday');
      if (schedule.categories?.length) setCategories(schedule.categories);
      if (schedule.older_than_days != null) setOlderThanDays(schedule.older_than_days);
    });
  }, []);

  function saveSchedule(patch: { enabled?: boolean; freq?: string; day?: string } = {}) {
    saveCleanupSchedule({
      enabled:         patch.enabled ?? schedEnabled,
      frequency:       (patch.freq ?? schedFreq) as CleanupSchedule['frequency'],
      day_of_week:     patch.day  ?? schedDay,
      categories,
      older_than_days: olderThanDays ?? 365,
    }).then(({ error }) => {
      if (error) toast.error('Could not save cleanup schedule');
    });
  }

  function toggleCategory(key: string) {
    setCategories((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key],
    );
    setShowConfirm(false);
  }

  async function handleRun() {
    if (!categories.length || !estimate?.senders) return;
    setRunning(true);
    const { job, error } = await runDeepClean(categories, olderThanDays, Array.from(excluded));
    setRunning(false);
    setShowConfirm(false);
    if (error) {
      toast.error(error);
      return;
    }
    if (job) {
      toast.success('Deep clean started — we\'ll process it in the background.');
      onJobCreated(job);
    }
  }

  const hasUnsafeCategory = categories.some((c) => c === 'regular' || c === 'transactional');

  return (
    <div className="px-6 pt-4 pb-6">
      <div className="rounded-lg border border-border bg-card">

        {/* Header */}
        <div className="flex items-start gap-3 px-4 pt-4 pb-3 border-b border-border">
          <Zap className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Bulk Cleanup</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Targets senders by engagement level — deletes all emails from senders you never or
              rarely open. Runs as a background job so you can close the tab.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-5">

          {/* Category selector */}
          <div>
            <p className="text-sm font-medium mb-3">Delete emails from:</p>
            <div className="space-y-2">
              {CATEGORY_OPTIONS.map(({ key, label, description, safe }) => (
                <label
                  key={key}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                    categories.includes(key)
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border hover:bg-muted/30',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={categories.includes(key)}
                    onChange={() => toggleCategory(key)}
                    className="mt-0.5 rounded border-gray-300"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{label}</span>
                      {!safe && (
                        <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded border border-amber-200">
                          caution
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Age selector */}
          <div>
            <p className="text-sm font-medium mb-3">Emails older than:</p>
            <div className="flex flex-wrap gap-2">
              {AGE_OPTIONS.map(({ days, label }) => (
                <button
                  key={label}
                  onClick={() => { setOlderThanDays(days); setShowConfirm(false); }}
                  className={cn(
                    'px-3 py-1.5 rounded-md border text-sm transition-colors',
                    olderThanDays === days
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:bg-muted/30',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {olderThanDays === null && (
              <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                &ldquo;All time&rdquo; deletes everything, including recent emails
              </p>
            )}
          </div>

          {/* Estimate */}
          <div className="rounded-lg border border-border p-4 bg-muted/20">
            {!categories.length ? (
              <p className="text-sm text-muted-foreground">Select at least one category to see an estimate.</p>
            ) : estimating ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Calculating…
              </div>
            ) : estimate ? (
              <div className="space-y-2">
                <p className="text-sm">
                  <strong className="text-foreground">{(estimate.senders - excluded.size).toLocaleString()}</strong>
                  {' '}sender{estimate.senders - excluded.size !== 1 ? 's' : ''}
                  {excluded.size > 0 && <span className="text-muted-foreground"> ({excluded.size} excluded)</span>}
                  {' '}· approx.{' '}
                  <strong className="text-foreground">{estimate.estimated_emails.toLocaleString()}</strong>
                  {' '}emails
                </p>
                <p className="text-xs text-muted-foreground">
                  Estimate is approximate. Emails move to Gmail trash (recoverable for 30 days).
                </p>
                {estimate.sender_emails.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowSenders((v) => !v)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showSenders
                        ? <><ChevronUp className="w-3 h-3" />Hide affected senders</>
                        : <><ChevronDown className="w-3 h-3" />Show affected senders ({estimate.sender_emails.length})</>
                      }
                    </button>
                    {showSenders && (
                      <div className="mt-2 border border-border rounded-md bg-background">
                        {excluded.size > 10 && (
                          <div className="flex items-center justify-between px-2 py-1.5 border-b border-border bg-muted/30">
                            <span className="text-xs text-muted-foreground">
                              {excluded.size} excluded
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Remove all ${excluded.size} exclusions?`)) {
                                  setExcluded(new Set());
                                }
                              }}
                              className="text-xs text-red-600 hover:text-red-800 font-medium transition-colors"
                            >
                              Clear all exclusions
                            </button>
                          </div>
                        )}
                        <div className="max-h-44 overflow-y-auto space-y-0.5 p-2">
                          {estimate.sender_emails.map((email) => (
                            <label key={email} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-muted/30 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!excluded.has(email)}
                                onChange={() => setExcluded((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(email)) next.delete(email); else next.add(email);
                                  return next;
                                })}
                                className="w-3 h-3 rounded border-gray-300 accent-primary"
                              />
                              <span className={cn('text-xs truncate', excluded.has(email) && 'line-through text-muted-foreground/50')}>
                                {email}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Caution warning */}
          {hasUnsafeCategory && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                You&apos;ve selected <strong>Transactional</strong> or <strong>Regular</strong> senders.
                This may delete receipts, invoices, or emails from senders you care about.
                Double-check your selection before running.
              </p>
            </div>
          )}

          {/* Run / confirm */}
          {!showConfirm ? (
            <Button
              size="lg"
              variant={hasUnsafeCategory ? 'destructive' : 'default'}
              disabled={!categories.length || !estimate?.senders || estimating || running}
              onClick={() => {
                if (olderThanDays === null) {
                  setShowAllTimeConfirm(true);
                } else {
                  setShowConfirm(true);
                }
              }}
              className="w-full"
            >
              <Zap className="w-4 h-4 mr-2" />
              {estimate?.senders
                ? `Clean ${estimate.estimated_emails.toLocaleString()} emails from ${estimate.senders} senders`
                : 'No emails match criteria'}
            </Button>
          ) : (
            <div className="rounded-lg border border-destructive/30 p-4 bg-red-50/50 space-y-3">
              <p className="text-sm font-medium text-red-800">
                This will move ~{estimate?.estimated_emails.toLocaleString()} emails to trash across {estimate?.senders} senders.
                This runs in the background — you can close this tab.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={() => setShowScan(true)}
                  disabled={running}
                  className="flex-1"
                >
                  {running && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
                  Yes, start deep clean
                </Button>
                <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={running}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Repeat automatically */}
        <div className="border-t border-border px-4 pt-3 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-3.5 h-3.5 text-primary shrink-0" />
                <p className="text-sm font-medium">Repeat automatically</p>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {schedEnabled
                  ? `Runs ${schedFreq} on ${schedDay.charAt(0).toUpperCase() + schedDay.slice(1)}, using the categories and age above.`
                  : 'Schedule this clean to run automatically using the categories and age above.'}
              </p>

              {schedEnabled && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="text-xs text-muted-foreground shrink-0">Run</label>
                  <select
                    value={schedFreq}
                    onChange={(e) => {
                      const v = e.target.value as CleanupSchedule['frequency'];
                      setSchedFreq(v);
                      saveSchedule({ freq: v });
                    }}
                    className="h-7 px-2 text-xs border border-border rounded bg-background"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                  <label className="text-xs text-muted-foreground shrink-0">on</label>
                  <select
                    value={schedDay}
                    onChange={(e) => {
                      setSchedDay(e.target.value);
                      saveSchedule({ day: e.target.value });
                    }}
                    className="h-7 px-2 text-xs border border-border rounded bg-background"
                  >
                    {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => (
                      <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={schedEnabled}
              onClick={() => {
                const next = !schedEnabled;
                setSchedEnabled(next);
                saveSchedule({ enabled: next });
              }}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                'transition-colors focus-visible:outline-none mt-0.5',
                schedEnabled ? 'bg-primary' : 'bg-muted-foreground/30',
              )}
            >
              <span className={cn(
                'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform',
                schedEnabled ? 'translate-x-4' : 'translate-x-0',
              )} />
            </button>
          </div>
        </div>

      </div>

      {/* "All time" explicit confirmation dialog */}
      {showAllTimeConfirm && estimate && (
        <Dialog open onOpenChange={(open) => { if (!open) setShowAllTimeConfirm(false); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Delete ALL emails — including recent ones?
              </DialogTitle>
              <DialogDescription>
                You selected <strong>All time</strong>. This will move{' '}
                <strong>~{estimate.estimated_emails.toLocaleString()} emails</strong> from{' '}
                <strong>{estimate.senders - excluded.size} sender{estimate.senders - excluded.size !== 1 ? 's' : ''}</strong>{' '}
                to trash — including emails from the last few days.
                Emails can be recovered from Gmail trash within 30 days.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setShowAllTimeConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setShowAllTimeConfirm(false);
                  setShowConfirm(true);
                }}
              >
                Delete everything ({estimate.estimated_emails.toLocaleString()} emails)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Safety scan modal */}
      {showScan && estimate && (
        <SafetyScanModal
          senderEmails={estimate.sender_emails}
          olderThanDays={olderThanDays}
          emailCount={estimate.estimated_emails}
          onConfirm={() => { setShowScan(false); handleRun(); }}
          onClose={() => setShowScan(false)}
        />
      )}
    </div>
  );
}
