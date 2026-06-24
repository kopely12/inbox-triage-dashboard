'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  saveAnalysisSchedule, type AnalysisSchedule,
} from '@/app/actions/engagement';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  initialAnalysis: AnalysisSchedule;
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

export function SchedulePanel({ initialAnalysis }: Props) {
  const [isPending, startTransition] = useTransition();

  // Analysis schedule state
  const [analysisEnabled, setAnalysisEnabled] = useState(initialAnalysis.enabled);
  const [analysisDay,     setAnalysisDay]     = useState(initialAnalysis.refresh_day  || 'sunday');
  const [analysisHour,    setAnalysisHour]    = useState(initialAnalysis.refresh_hour ?? 23);

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

  return (
    <div className="space-y-6">

      {/* ── Analysis schedule ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {analysisEnabled && (
            <div className="flex flex-wrap items-center gap-3">
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
              <span className="text-xs text-muted-foreground">
                UTC
                {(() => {
                  const offsetMins = new Date().getTimezoneOffset();
                  const localHour  = ((analysisHour - offsetMins / 60) % 24 + 24) % 24;
                  const h12        = localHour % 12 || 12;
                  const ampm       = localHour < 12 ? 'AM' : 'PM';
                  return ` · ${h12}:00 ${ampm} your time`;
                })()}
              </span>
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

      {isPending && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          Saving schedule…
        </div>
      )}
    </div>
  );
}
