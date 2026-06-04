'use client';

import { useState, useTransition } from 'react';
import { Loader2, CalendarClock, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  saveCleanupSchedule,  type CleanupSchedule,
  saveAnalysisSchedule, type AnalysisSchedule,
} from '@/app/actions/engagement';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  initialAnalysis: AnalysisSchedule;
  initialCleanup:  CleanupSchedule | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS = [
  { value: 'monday',    label: 'Monday'    },
  { value: 'tuesday',   label: 'Tuesday'   },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday',  label: 'Thursday'  },
  { value: 'friday',    label: 'Friday'    },
  { value: 'saturday',  label: 'Saturday'  },
  { value: 'sunday',    label: 'Sunday'    },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`,
}));

const CLEANUP_FREQS = [
  { value: 'weekly',  label: 'Weekly'  },
  { value: 'monthly', label: 'Monthly' },
];

const CLEANUP_CATEGORIES = [
  { value: 'never_engage',  label: 'Never Open'  },
  { value: 'rarely_engage', label: 'Rarely Open' },
];

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
      )}
    >
      <span className={cn(
        'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform',
        checked ? 'translate-x-4' : 'translate-x-0',
      )} />
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function SchedulePanel({ initialAnalysis, initialCleanup }: Props) {
  const [isPending, startTransition] = useTransition();

  // Analysis schedule state
  const [analysisEnabled, setAnalysisEnabled] = useState(initialAnalysis.enabled);
  const [analysisDay,     setAnalysisDay]     = useState(initialAnalysis.refresh_day  || 'sunday');
  const [analysisHour,    setAnalysisHour]    = useState(initialAnalysis.refresh_hour ?? 23);

  // Cleanup schedule state
  const [cleanupEnabled,    setCleanupEnabled]    = useState(initialCleanup?.enabled  ?? false);
  const [cleanupFreq,       setCleanupFreq]       = useState(initialCleanup?.frequency ?? 'weekly');
  const [cleanupDay,        setCleanupDay]        = useState(initialCleanup?.day_of_week ?? 'sunday');
  const [cleanupCategories, setCleanupCategories] = useState<string[]>(
    initialCleanup?.categories ?? ['never_engage'],
  );
  const [cleanupOlderThan,  setCleanupOlderThan]  = useState(initialCleanup?.older_than_days ?? 90);

  function saveAnalysis(patch: Partial<{ enabled: boolean; day: string; hour: number }>) {
    const enabled = patch.enabled ?? analysisEnabled;
    const day     = patch.day    ?? analysisDay;
    const hour    = patch.hour   ?? analysisHour;

    startTransition(async () => {
      const { error } = await saveAnalysisSchedule({ enabled, refresh_day: day, refresh_hour: hour });
      if (error) { toast.error('Could not save analysis schedule'); return; }
      toast.success(enabled ? 'Analysis schedule updated.' : 'Scheduled analysis disabled.');
    });
  }

  function saveCleanup(patch: Partial<{
    enabled: boolean; freq: string; day: string;
    categories: string[]; olderThan: number;
  }>) {
    const enabled    = patch.enabled    ?? cleanupEnabled;
    const freq       = patch.freq       ?? cleanupFreq;
    const day        = patch.day        ?? cleanupDay;
    const categories = patch.categories ?? cleanupCategories;
    const olderThan  = patch.olderThan  ?? cleanupOlderThan;

    startTransition(async () => {
      const { error } = await saveCleanupSchedule({
        enabled,
        frequency:       freq       as CleanupSchedule['frequency'],
        day_of_week:     day,
        categories,
        older_than_days: olderThan,
      });
      if (error) { toast.error('Could not save cleanup schedule'); return; }
      toast.success(enabled ? 'Cleanup schedule updated.' : 'Scheduled cleanup disabled.');
    });
  }

  function toggleCategory(cat: string) {
    const next = cleanupCategories.includes(cat)
      ? cleanupCategories.filter((c) => c !== cat)
      : [...cleanupCategories, cat];
    if (next.length === 0) return; // always keep at least one
    setCleanupCategories(next);
    saveCleanup({ categories: next });
  }

  return (
    <div className="space-y-6">

      {/* ── Analysis schedule ── */}
      <div className={cn(
        'rounded-lg border p-4 transition-colors',
        analysisEnabled ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20',
      )}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
              <p className="text-sm font-semibold">Scheduled analysis</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Automatically re-scan your inbox on a fixed schedule. Your health score and
              sender categories update in the background — no action required.
            </p>

            {analysisEnabled && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="text-xs text-muted-foreground shrink-0">Every</label>
                <select
                  value={analysisDay}
                  disabled={isPending}
                  onChange={(e) => { setAnalysisDay(e.target.value); saveAnalysis({ day: e.target.value }); }}
                  className="h-7 px-2 text-xs border border-border rounded bg-background"
                >
                  {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                <label className="text-xs text-muted-foreground shrink-0">at</label>
                <select
                  value={analysisHour}
                  disabled={isPending}
                  onChange={(e) => { setAnalysisHour(Number(e.target.value)); saveAnalysis({ hour: Number(e.target.value) }); }}
                  className="h-7 px-2 text-xs border border-border rounded bg-background"
                >
                  {HOURS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
                </select>
                <span className="text-xs text-muted-foreground">(UTC)</span>
              </div>
            )}
          </div>

          <Toggle
            checked={analysisEnabled}
            disabled={isPending}
            onChange={() => {
              const next = !analysisEnabled;
              setAnalysisEnabled(next);
              saveAnalysis({ enabled: next });
            }}
          />
        </div>
      </div>

      {/* ── Cleanup schedule ── */}
      <div className={cn(
        'rounded-lg border p-4 transition-colors',
        cleanupEnabled ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20',
      )}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-3.5 h-3.5 text-primary shrink-0" />
              <p className="text-sm font-semibold">Scheduled cleanup</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Periodically run a bulk cleanup job — unsubscribing from and archiving noise
              senders automatically based on your preferences.
            </p>

            {cleanupEnabled && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs text-muted-foreground shrink-0">Run</label>
                  <select
                    value={cleanupFreq}
                    disabled={isPending}
                    onChange={(e) => { setCleanupFreq(e.target.value as 'daily' | 'weekly' | 'monthly'); saveCleanup({ freq: e.target.value }); }}
                    className="h-7 px-2 text-xs border border-border rounded bg-background"
                  >
                    {CLEANUP_FREQS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <label className="text-xs text-muted-foreground shrink-0">on</label>
                  <select
                    value={cleanupDay}
                    disabled={isPending}
                    onChange={(e) => { setCleanupDay(e.target.value); saveCleanup({ day: e.target.value }); }}
                    className="h-7 px-2 text-xs border border-border rounded bg-background"
                  >
                    {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-muted-foreground shrink-0">Target categories:</label>
                  {CLEANUP_CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      disabled={isPending}
                      onClick={() => toggleCategory(cat.value)}
                      className={cn(
                        'text-[11px] px-2 py-0.5 rounded-full border transition-colors',
                        cleanupCategories.includes(cat.value)
                          ? 'bg-primary/10 text-primary border-primary/30'
                          : 'bg-muted/30 text-muted-foreground border-border hover:border-primary/20',
                      )}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-muted-foreground shrink-0">Emails older than:</label>
                  <input
                    type="number" min={30} max={365} step={30}
                    value={cleanupOlderThan}
                    disabled={isPending}
                    onChange={(e) => {
                      const v = Math.max(30, Math.min(365, parseInt(e.target.value) || 90));
                      setCleanupOlderThan(v);
                    }}
                    onBlur={() => saveCleanup({ olderThan: cleanupOlderThan })}
                    className="w-16 px-2 py-1 text-xs border border-border rounded text-center bg-background"
                  />
                  <span className="text-xs text-muted-foreground">days</span>
                </div>
              </div>
            )}
          </div>

          <Toggle
            checked={cleanupEnabled}
            disabled={isPending}
            onChange={() => {
              const next = !cleanupEnabled;
              setCleanupEnabled(next);
              saveCleanup({ enabled: next });
            }}
          />
        </div>
      </div>

      {isPending && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          Saving schedule…
        </div>
      )}
    </div>
  );
}
