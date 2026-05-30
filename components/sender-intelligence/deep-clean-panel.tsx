'use client';

// DeepCleanPanel — cross-sender deletion by category + age.
// Lets power users wipe out all noise emails in one pass
// without needing to select individual senders.

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Zap, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn }     from '@/lib/utils';
import { estimateDeepClean, runDeepClean, type CleanupJob } from '@/app/actions/engagement';
import { ScheduleSettings } from './schedule-settings';
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
  const [categories,    setCategories]    = useState<string[]>(['never_engage', 'rarely_engage']);
  const [olderThanDays, setOlderThanDays] = useState<number | null>(365);
  const [estimate,      setEstimate]      = useState<{ senders: number; estimated_emails: number } | null>(null);
  const [estimating,    setEstimating]    = useState(false);
  const [running,       setRunning]       = useState(false);
  const [showConfirm,   setShowConfirm]   = useState(false);
  const [showScan,      setShowScan]      = useState(false);

  // Re-estimate whenever settings change
  const loadEstimate = useCallback(async () => {
    if (!categories.length) { setEstimate(null); return; }
    setEstimating(true);
    const data = await estimateDeepClean(categories, olderThanDays);
    setEstimating(false);
    if (!data.error) setEstimate(data);
  }, [categories, olderThanDays]);

  useEffect(() => {
    const t = setTimeout(loadEstimate, 400);
    return () => clearTimeout(t);
  }, [loadEstimate]);

  function toggleCategory(key: string) {
    setCategories((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key],
    );
    setShowConfirm(false);
  }

  async function handleRun() {
    if (!categories.length || !estimate?.senders) return;
    setRunning(true);
    const { job, error } = await runDeepClean(categories, olderThanDays);
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
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center gap-2 mb-1">
        <Zap className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">Deep Clean</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        Delete all emails matching your criteria in one pass — no need to select senders individually.
        Runs as a background job so you can close the tab and check back later.
      </p>

      {/* Category selector */}
      <div className="mb-6">
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
      <div className="mb-6">
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
            "All time" deletes everything, including recent emails
          </p>
        )}
      </div>

      {/* Estimate */}
      <div className="rounded-lg border border-border p-4 bg-muted/20 mb-6">
        {!categories.length ? (
          <p className="text-sm text-muted-foreground">Select at least one category to see an estimate.</p>
        ) : estimating ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Calculating…
          </div>
        ) : estimate ? (
          <div className="space-y-1">
            <p className="text-sm">
              <strong className="text-foreground">{estimate.senders.toLocaleString()}</strong>
              {' '}sender{estimate.senders !== 1 ? 's' : ''} · approx.{' '}
              <strong className="text-foreground">{estimate.estimated_emails.toLocaleString()}</strong>
              {' '}emails
            </p>
            <p className="text-xs text-muted-foreground">
              Estimate is approximate — actual count may vary. Emails are moved to Gmail trash (recoverable for 30 days).
            </p>
          </div>
        ) : null}
      </div>

      {/* Caution warning for unsafe categories */}
      {hasUnsafeCategory && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm mb-6">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            You&apos;ve selected <strong>Transactional</strong> or <strong>Regular</strong> senders.
            This may delete receipts, invoices, or emails from senders you care about.
            Double-check your selection before running.
          </p>
        </div>
      )}

      {/* Run button */}
      {!showConfirm ? (
        <Button
          size="lg"
          variant={hasUnsafeCategory ? 'destructive' : 'default'}
          disabled={!categories.length || !estimate?.senders || estimating || running}
          onClick={() => setShowConfirm(true)}
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

      {/* ── Schedule settings ─────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-6 pb-8">
        <ScheduleSettings />
      </div>

      {/* ── Safety scan modal ──────────────────────────────────────────────── */}
      {showScan && estimate && (
        <SafetyScanModal
          senderEmails={[]}   // deep clean resolves senders server-side; pass empty for now
          olderThanDays={olderThanDays}
          emailCount={estimate.estimated_emails}
          onConfirm={() => { setShowScan(false); handleRun(); }}
          onClose={() => setShowScan(false)}
        />
      )}
    </div>
  );
}
