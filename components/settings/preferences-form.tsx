'use client';

import { useTransition, useState } from 'react';
import { updatePreferences } from '@/app/actions/settings';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Check } from 'lucide-react';

const TIMEZONES = [
  { group: 'Universal',        zones: ['UTC'] },
  { group: 'Americas',         zones: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Vancouver', 'America/Sao_Paulo'] },
  { group: 'Europe',           zones: ['Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'Europe/Amsterdam', 'Europe/Stockholm', 'Europe/Zurich', 'Europe/Madrid'] },
  { group: 'Middle East',      zones: ['Asia/Dubai'] },
  { group: 'Asia & Pacific',   zones: ['Asia/Kolkata', 'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul'] },
  { group: 'Australia',        zones: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth'] },
  { group: 'Pacific',          zones: ['Pacific/Auckland', 'Pacific/Honolulu'] },
];

const SNOOZE_OPTIONS = [
  { value: 1,   label: '1 hour' },
  { value: 4,   label: '4 hours' },
  { value: 24,  label: '1 day (tomorrow)' },
  { value: 48,  label: '2 days' },
  { value: 72,  label: '3 days' },
  { value: 168, label: '1 week' },
];

interface Props {
  timezone:           string;
  defaultSnoozeHours: number;
}

export function PreferencesForm({ timezone, defaultSnoozeHours }: Props) {
  const [pending, startTransition] = useTransition();
  const [saved,   setSaved]        = useState(false);
  const [error,   setError]        = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updatePreferences(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Timezone */}
        <div className="space-y-1.5">
          <Label htmlFor="timezone">Timezone</Label>
          <select
            id="timezone"
            name="timezone"
            defaultValue={timezone}
            disabled={pending}
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
          >
            {TIMEZONES.map(({ group, zones }) => (
              <optgroup key={group} label={group}>
                {zones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, ' ').replace('/', ' / ')}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Used for scheduling reminders and snooze times.</p>
        </div>

        {/* Default snooze */}
        <div className="space-y-1.5">
          <Label htmlFor="default_snooze_hours">Default snooze</Label>
          <select
            id="default_snooze_hours"
            name="default_snooze_hours"
            defaultValue={defaultSnoozeHours}
            disabled={pending}
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
          >
            {SNOOZE_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Pre-selected when you snooze an email in the extension.</p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</>
          ) : saved ? (
            <><Check className="w-3.5 h-3.5 mr-1.5 text-green-600" />Saved</>
          ) : 'Save preferences'}
        </Button>
      </div>
    </form>
  );
}
