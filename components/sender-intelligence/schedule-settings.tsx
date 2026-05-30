'use client';

// ScheduleSettings — configure a recurring automated deep clean.
// Rendered inside the Deep Clean tab.

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn }     from '@/lib/utils';
import { getCleanupSchedule, saveCleanupSchedule, type CleanupSchedule } from '@/app/actions/engagement';

const CATEGORY_OPTIONS = [
  { key: 'never_engage',  label: 'Never Open'  },
  { key: 'rarely_engage', label: 'Rarely Open' },
  { key: 'regular',       label: 'Regular'     },
] as const;

const AGE_OPTIONS = [
  { days: 30,  label: '30 days'  },
  { days: 90,  label: '3 months' },
  { days: 180, label: '6 months' },
  { days: 365, label: '1 year'   },
] as const;

const FREQ_OPTIONS = [
  { key: 'daily',   label: 'Daily'   },
  { key: 'weekly',  label: 'Weekly'  },
  { key: 'monthly', label: 'Monthly' },
] as const;

const DAY_OPTIONS = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
] as const;

export function ScheduleSettings() {
  const [schedule,  setSchedule]  = useState<CleanupSchedule | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);

  // Local edit state
  const [enabled,      setEnabled]      = useState(false);
  const [frequency,    setFrequency]    = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [dayOfWeek,    setDayOfWeek]    = useState('friday');
  const [categories,   setCategories]   = useState<string[]>(['never_engage']);
  const [olderThan,    setOlderThan]    = useState(90);

  const load = useCallback(async () => {
    const { schedule: data } = await getCleanupSchedule();
    setSchedule(data);
    if (data?.enabled) {
      setEnabled(true);
      setFrequency(data.frequency || 'weekly');
      setDayOfWeek(data.day_of_week || 'friday');
      setCategories(data.categories || ['never_engage']);
      setOlderThan(data.older_than_days ?? 90);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (enabled && !categories.length) {
      toast.error('Select at least one category.');
      return;
    }
    setSaving(true);
    const { error } = await saveCleanupSchedule({
      enabled,
      frequency,
      day_of_week:     dayOfWeek,
      categories,
      older_than_days: olderThan,
    });
    setSaving(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success(enabled ? 'Schedule saved.' : 'Schedule disabled.');
      load();
    }
  }

  function toggleCategory(key: string) {
    setCategories((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]
    );
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="w-3.5 h-3.5 animate-spin" />Loading schedule…
    </div>
  );

  return (
    <div className="border border-border rounded-lg p-5 bg-muted/10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Recurring Clean-up</h3>
          {schedule?.enabled && schedule.next_run_at && (
            <span className="text-xs text-muted-foreground">
              · Next: {new Date(schedule.next_run_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
        {/* Toggle */}
        <button
          onClick={() => setEnabled((v) => !v)}
          className={cn(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none',
            enabled ? 'bg-primary' : 'bg-muted-foreground/30',
          )}
          aria-label="Toggle schedule"
        >
          <span className={cn(
            'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
            enabled ? 'translate-x-4' : 'translate-x-0.5',
          )} />
        </button>
      </div>

      {enabled && (
        <div className="space-y-4">
          {/* Frequency */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Run</p>
            <div className="flex gap-1.5 flex-wrap">
              {FREQ_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFrequency(key)}
                  className={cn(
                    'px-2.5 py-1 rounded-md border text-xs transition-colors',
                    frequency === key
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:bg-muted/30',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Day of week (weekly only) */}
          {frequency === 'weekly' && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">On</p>
              <div className="flex gap-1.5 flex-wrap">
                {DAY_OPTIONS.map((day) => (
                  <button
                    key={day}
                    onClick={() => setDayOfWeek(day)}
                    className={cn(
                      'px-2.5 py-1 rounded-md border text-xs capitalize transition-colors',
                      dayOfWeek === day
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border text-muted-foreground hover:bg-muted/30',
                    )}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Categories */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Delete from</p>
            <div className="flex gap-1.5 flex-wrap">
              {CATEGORY_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => toggleCategory(key)}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs transition-colors',
                    categories.includes(key)
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:bg-muted/30',
                  )}
                >
                  {categories.includes(key) && <Check className="w-2.5 h-2.5" />}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Age */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Emails older than</p>
            <div className="flex gap-1.5 flex-wrap">
              {AGE_OPTIONS.map(({ days, label }) => (
                <button
                  key={days}
                  onClick={() => setOlderThan(days)}
                  className={cn(
                    'px-2.5 py-1 rounded-md border text-xs transition-colors',
                    olderThan === days
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:bg-muted/30',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        {schedule?.last_run_at && (
          <p className="text-xs text-muted-foreground">
            Last ran {new Date(schedule.last_run_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        )}
        <Button size="sm" onClick={handleSave} disabled={saving} className="ml-auto">
          {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          {saving ? 'Saving…' : 'Save schedule'}
        </Button>
      </div>
    </div>
  );
}
