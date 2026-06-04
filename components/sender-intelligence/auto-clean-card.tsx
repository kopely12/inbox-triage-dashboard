'use client';

import { useState, useTransition } from 'react';
import { toast }        from 'sonner';
import { Moon, Play, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button }       from '@/components/ui/button';
import { cn }           from '@/lib/utils';
import { saveExtensionPrefs }                      from '@/app/actions/extension-prefs';
import { runAutoCleanNow, estimateAutoCleanNow, type AutoCleanResult } from '@/app/actions/engagement';

// ── Tiny toggle ───────────────────────────────────────────────────────────────

function Toggle({
  checked, onChange, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span className={cn(
        'pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform',
        checked ? 'translate-x-4' : 'translate-x-0',
      )} />
    </button>
  );
}

// ── Row helpers ───────────────────────────────────────────────────────────────

function Row({
  label, description, checked, onChange, disabled, children,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        {checked && children}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function DaySelect({
  value, onChange, disabled, options,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-xs text-muted-foreground">Delete after</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-7 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AutoCleanPrefs {
  auto_clean_calendar:      boolean;
  auto_clean_calendar_days: number;
  auto_clean_otp:           boolean;
  auto_clean_promo:         boolean;
  auto_clean_promo_days:    number;
  auto_clean_shipping:      boolean;
  auto_clean_social:        boolean;
}

const CALENDAR_DAYS = [
  { value: '1',  label: '1 day'    },
  { value: '3',  label: '3 days'   },
  { value: '7',  label: '7 days'   },
  { value: '14', label: '14 days'  },
  { value: '30', label: '30 days'  },
];

const PROMO_DAYS = [
  { value: '30',  label: '30 days'  },
  { value: '60',  label: '60 days'  },
  { value: '90',  label: '90 days'  },
  { value: '180', label: '6 months' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function AutoCleanCard({ initialPrefs }: { initialPrefs: AutoCleanPrefs }) {
  const [pending, startTransition] = useTransition();

  const [calendar,     setCalendar]     = useState(initialPrefs.auto_clean_calendar);
  const [calendarDays, setCalendarDays] = useState(String(initialPrefs.auto_clean_calendar_days ?? 7));
  const [otp,          setOtp]          = useState(initialPrefs.auto_clean_otp);
  const [promo,        setPromo]        = useState(initialPrefs.auto_clean_promo);
  const [promoDays,    setPromoDays]    = useState(String(initialPrefs.auto_clean_promo_days ?? 60));
  const [shipping,     setShipping]     = useState(initialPrefs.auto_clean_shipping);
  const [social,       setSocial]       = useState(initialPrefs.auto_clean_social);

  // Run-now state machine: idle → estimating → confirming → running → done | error
  type RunState = 'idle' | 'estimating' | 'confirming' | 'running' | 'done' | 'error';
  const [runState,    setRunState]    = useState<RunState>('idle');
  const [estimates,   setEstimates]   = useState<Record<string, number> | null>(null);
  const [runResults,  setRunResults]  = useState<AutoCleanResult | null>(null);
  const [runError,    setRunError]    = useState<string | null>(null);
  const [lookbackVal, setLookbackVal] = useState<string>('default'); // 'default' | number string

  const hasEnabledRules = calendar || otp || promo || shipping || social;

  const lookBackDays = lookbackVal === 'default' ? null : Number(lookbackVal);

  const currentRules = {
    calendar:       { enabled: calendar, days_after: Number(calendarDays) || 7 },
    otp:            { enabled: otp },
    promo:          { enabled: promo,    days_after: Number(promoDays)    || 60 },
    shipping:       { enabled: shipping },
    social:         { enabled: social },
    look_back_days: lookBackDays,
  };

  async function handleEstimate() {
    setRunState('estimating');
    setEstimates(null);
    setRunError(null);
    const { estimates: est, error } = await estimateAutoCleanNow(currentRules);
    if (error) { setRunState('error'); setRunError(error); return; }
    setEstimates(est ?? {});
    setRunState('confirming');
  }

  async function handleConfirm() {
    setRunState('running');
    const { results, error } = await runAutoCleanNow(currentRules);
    if (error) { setRunState('error'); setRunError(error); return; }
    setRunState('done');
    setRunResults(results ?? null);
  }

  function handleCancel() {
    setRunState('idle');
    setEstimates(null);
    setLookbackVal('default');
  }

  const dirty =
    calendar     !== initialPrefs.auto_clean_calendar                     ||
    calendarDays !== String(initialPrefs.auto_clean_calendar_days ?? 7)   ||
    otp          !== initialPrefs.auto_clean_otp                          ||
    promo        !== initialPrefs.auto_clean_promo                        ||
    promoDays    !== String(initialPrefs.auto_clean_promo_days    ?? 60)  ||
    shipping     !== initialPrefs.auto_clean_shipping                     ||
    social       !== initialPrefs.auto_clean_social;

  function save() {
    startTransition(async () => {
      const result = await saveExtensionPrefs({
        auto_clean_calendar:      calendar,
        auto_clean_calendar_days: Math.max(1,  Math.min(30,  Number(calendarDays) || 7)),
        auto_clean_otp:           otp,
        auto_clean_promo:         promo,
        auto_clean_promo_days:    Math.max(7,  Math.min(365, Number(promoDays)    || 60)),
        auto_clean_shipping:      shipping,
        auto_clean_social:        social,
      });
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success('Auto-clean settings saved');
      }
    });
  }

  return (
    <div className="px-6 pt-6 pb-4">
      <div className="rounded-lg border border-border bg-card">

        {/* Header */}
        <div className="flex items-start gap-3 px-4 pt-4 pb-3 border-b border-border">
          <Moon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Nightly Auto-Clean</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automatically trash expired or stale emails every night. Messages go to Gmail
              Trash — recoverable for 30 days.
            </p>
          </div>
        </div>

        {/* Rules */}
        <div className="divide-y divide-border">

          <Row
            label="Calendar invites"
            description="Trash .ics invite emails after their meeting has ended. Recurring events are never touched."
            checked={calendar}
            onChange={setCalendar}
            disabled={pending}
          >
            <DaySelect value={calendarDays} onChange={setCalendarDays} disabled={pending} options={CALENDAR_DAYS} />
          </Row>

          <Row
            label="Verification codes & OTPs"
            description="Trash sign-in codes, one-time passwords, and password-reset links older than 24 hours — they expire in minutes."
            checked={otp}
            onChange={setOtp}
            disabled={pending}
          />

          <Row
            label="Promotional emails"
            description="Trash emails from your Gmail Promotions tab. Sale deadlines have long passed — nothing actionable remains."
            checked={promo}
            onChange={setPromo}
            disabled={pending}
          >
            <DaySelect value={promoDays} onChange={setPromoDays} disabled={pending} options={PROMO_DAYS} />
          </Row>

          <Row
            label="Delivered shipping notifications"
            description='Trash "your package has been delivered" emails older than 7 days. Dispatched or in-transit notices are never touched.'
            checked={shipping}
            onChange={setShipping}
            disabled={pending}
          />

          <Row
            label="Social notifications"
            description="Trash notification emails from LinkedIn, Facebook, Instagram, X, TikTok, YouTube, Reddit, and similar platforms older than 14 days."
            checked={social}
            onChange={setSocial}
            disabled={pending}
          />

        </div>

        {/* Clean now */}
        <div className="px-4 py-3 border-t border-border bg-muted/40 space-y-3">

          {/* Header row — always visible */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5 text-muted-foreground" />
                Clean now
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                One-time run — independent of the nightly schedule.
              </p>

              {/* Look-back override — only in idle state */}
              {runState === 'idle' && (
                <div className="flex items-center gap-1.5 mt-2.5">
                  <span className="text-xs text-muted-foreground">Look back:</span>
                  <select
                    value={lookbackVal}
                    onChange={(e) => setLookbackVal(e.target.value)}
                    disabled={pending}
                    className="h-6 rounded-md border border-input bg-background px-1.5 text-xs disabled:opacity-50"
                  >
                    <option value="default">Per rule (default)</option>
                    <option value="7">7 days</option>
                    <option value="14">14 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                    <option value="180">6 months</option>
                    <option value="365">1 year</option>
                  </select>
                </div>
              )}
            </div>

            {runState === 'idle' && (
              <Button
                size="sm"
                disabled={pending || !hasEnabledRules}
                onClick={handleEstimate}
                className="shrink-0 mt-0.5 bg-emerald-600 hover:bg-emerald-500 text-white border-transparent"
                title={!hasEnabledRules ? 'Enable at least one rule above' : undefined}
              >
                Clean now
              </Button>
            )}
            {runState === 'estimating' && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 mt-0.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Estimating…
              </span>
            )}
          </div>

          {/* Confirmation panel */}
          {runState === 'confirming' && estimates && (() => {
            const LABELS: Record<string, string> = {
              calendar: 'calendar invites',
              otp:      'verification codes & password resets',
              promo:    'promotional emails',
              shipping: 'delivered shipping notifications',
              social:   'social notifications',
            };
            const lines = Object.entries(estimates).filter(([, n]) => n > 0);
            const total  = Object.values(estimates).reduce((s, n) => s + n, 0);
            return (
              <div className="rounded-md border border-border bg-card px-3 py-3 space-y-2.5">
                <p className="text-xs font-medium">
                  {total > 0
                    ? `Ready to move ~${total.toLocaleString()} email${total !== 1 ? 's' : ''} to trash${lookBackDays ? ` (looking back ${lookBackDays >= 365 ? '1 year' : lookBackDays >= 180 ? '6 months' : `${lookBackDays} days`})` : ''}:`
                    : 'Nothing to clean — no matching emails found.'}
                </p>
                {lines.length > 0 && (
                  <ul className="text-xs text-muted-foreground space-y-1 pl-4 list-disc">
                    {lines.map(([k, n]) => (
                      <li key={k}>
                        ~{n.toLocaleString()} {LABELS[k] ?? k}
                        {k === 'calendar' && (
                          <span className="text-muted-foreground/60"> (recurring events excluded)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-muted-foreground/70">
                  Counts are approximate. Emails go to Gmail Trash — recoverable for 30 days.
                </p>
                <div className="flex items-center gap-2 pt-0.5">
                  <Button
                    size="sm"
                    disabled={total === 0}
                    onClick={handleConfirm}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white border-transparent"
                  >
                    Confirm &amp; clean
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleCancel}>
                    Cancel
                  </Button>
                </div>
              </div>
            );
          })()}

          {/* Running */}
          {runState === 'running' && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Cleaning… this may take a moment.
            </div>
          )}

          {/* Results */}
          {runState === 'done' && runResults && (() => {
            const LABELS: Record<string, string> = {
              calendar: 'calendar invites',
              otp:      'verification codes',
              promo:    'promotional emails',
              shipping: 'shipping notifications',
              social:   'social notifications',
            };
            const lines = Object.entries(runResults)
              .filter((e): e is [string, { deleted: number }] => 'deleted' in e[1] && e[1].deleted > 0)
              .map(([k, v]) => `${v.deleted.toLocaleString()} ${LABELS[k] ?? k}`);
            const total = Object.values(runResults)
              .filter((v): v is { deleted: number } => 'deleted' in v)
              .reduce((s, v) => s + v.deleted, 0);
            const errors = Object.values(runResults).filter((v) => 'error' in v);
            return (
              <div className="rounded-md border border-border bg-card px-3 py-2.5 space-y-1.5">
                <p className="text-xs font-medium flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {total > 0
                    ? `Moved ${total.toLocaleString()} email${total !== 1 ? 's' : ''} to trash`
                    : 'Nothing to clean — inbox already tidy'}
                </p>
                {lines.length > 0 && (
                  <ul className="text-xs text-muted-foreground space-y-0.5 pl-5 list-disc">
                    {lines.map((l) => <li key={l}>{l}</li>)}
                  </ul>
                )}
                {errors.length > 0 && (
                  <p className="text-xs text-amber-600 flex items-center gap-1.5 mt-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.length} rule{errors.length !== 1 ? 's' : ''} failed — check the backend logs
                  </p>
                )}
                <button
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground mt-1"
                  onClick={() => { setRunState('idle'); setRunResults(null); }}
                >
                  Run again
                </button>
              </div>
            );
          })()}

          {/* Error */}
          {runState === 'error' && (
            <div className="flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-destructive mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs text-destructive">{runError}</p>
                <button
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  onClick={() => setRunState('idle')}
                >
                  Try again
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Save bar */}
        {dirty && (
          <div className="flex justify-end px-4 py-3 border-t border-border">
            <Button size="sm" disabled={pending} onClick={save}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
