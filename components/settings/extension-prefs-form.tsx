'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { saveExtensionPrefs, saveKbBindings, saveDraftQueueEnabled } from '@/app/actions/extension-prefs';
import { updatePreferences } from '@/app/actions/settings';
import type { ExtensionPrefs, PriorityRule } from '@/lib/extension-prefs';
import { GmailConnectionCard }  from '@/components/settings/gmail-connection-card';
import { DeleteAccountDialog }  from '@/components/settings/delete-account-dialog';
import { SchedulePanel }        from '@/components/preferences/schedule-panel';
import { PricingTable }         from '@/components/billing/pricing-table';
import { ManageBillingButton }  from '@/components/billing/manage-billing-button';
import { Button }    from '@/components/ui/button';
import { Label }     from '@/components/ui/label';
import { Badge }     from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Loader2, Check, Plus, X as XIcon, AlertCircle, AlertTriangle, CheckCircle2,
  Clock, CreditCard, Download, ExternalLink, Receipt, Users, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'account' | 'scanning' | 'rules' | 'workflows' | 'interface';

const TABS: { id: Tab; label: string }[] = [
  { id: 'account',   label: 'Account'   },
  { id: 'scanning',  label: 'Scanning'  },
  { id: 'rules',     label: 'Rules'     },
  { id: 'workflows', label: 'Workflows' },
  { id: 'interface', label: 'Interface' },
];

export type InvoiceRow = {
  id: string; date: number; description: string;
  amount: number; currency: string; status: string | null;
  pdfUrl: string | null; hostedUrl: string | null;
};

export type BillingData = {
  planTier:           'free' | 'pro' | 'team';
  stripeCustomerId:   string | null;
  memberSince:        string;
  invoices:           InvoiceRow[];
  nextBillingDate:    string | null;
  paymentMethodLabel: string | null;
  subscriptionStatus: string | null;
  stripeError:        boolean;
  billingLabel:       string | null;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const TIMEZONES = [
  { group: 'Universal',      zones: ['UTC'] },
  { group: 'Americas',       zones: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Vancouver', 'America/Sao_Paulo'] },
  { group: 'Europe',         zones: ['Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'Europe/Amsterdam', 'Europe/Stockholm', 'Europe/Zurich', 'Europe/Madrid'] },
  { group: 'Middle East',    zones: ['Asia/Dubai'] },
  { group: 'Asia & Pacific', zones: ['Asia/Kolkata', 'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul'] },
  { group: 'Australia',      zones: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth'] },
  { group: 'Pacific',        zones: ['Pacific/Auckland', 'Pacific/Honolulu'] },
];

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function fmtDateUnix(unix: number) {
  return new Date(unix * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Tiny helpers ────────────────────────────────────────────────────────────

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

function ToggleRow({
  label, description, checked, onChange, disabled,
}: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function parseLines(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

// ─── Billing display helpers ──────────────────────────────────────────────────

function InvoiceStatusBadge({ status }: { status: string | null }) {
  const styles: Record<string, string> = {
    paid:          'text-emerald-600 border-emerald-300 bg-emerald-50',
    open:          'text-amber-600  border-amber-300  bg-amber-50',
    void:          'text-muted-foreground',
    uncollectible: 'text-red-600    border-red-300    bg-red-50',
  };
  const label = status ?? 'unknown';
  return (
    <Badge variant="outline" className={`text-[10px] capitalize ${styles[label] ?? ''}`}>
      {label}
    </Badge>
  );
}

function SubscriptionStatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
    active:   { icon: <CheckCircle2  className="w-3 h-3" />, cls: 'text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800', label: 'Active'   },
    trialing: { icon: <Clock         className="w-3 h-3" />, cls: 'text-blue-600    border-blue-200    bg-blue-50    dark:bg-blue-950/30    dark:border-blue-800',    label: 'Trial'    },
    past_due: { icon: <AlertTriangle className="w-3 h-3" />, cls: 'text-amber-600   border-amber-200   bg-amber-50   dark:bg-amber-950/30   dark:border-amber-800',   label: 'Past due' },
    canceled: { icon: <XCircle       className="w-3 h-3" />, cls: 'text-red-600     border-red-200     bg-red-50     dark:bg-red-950/30     dark:border-red-800',     label: 'Canceled' },
  };
  const cfg = map[status] ?? { icon: null, cls: 'text-muted-foreground', label: status };
  return (
    <Badge variant="outline" className={cn('text-[10px] flex items-center gap-1 capitalize', cfg.cls)}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

// ─── Priority rules mini-editor ───────────────────────────────────────────────

function PriorityRulesEditor({
  rules, onChange,
}: { rules: PriorityRule[]; onChange: (r: PriorityRule[]) => void }) {
  const [pattern, setPattern] = useState('');
  const [urgency,  setUrgency] = useState<'high' | 'medium' | 'low'>('high');

  function add() {
    const p = pattern.trim();
    if (!p) return;
    onChange([...rules, { pattern: p, urgency }]);
    setPattern('');
  }

  function remove(i: number) { onChange(rules.filter((_, idx) => idx !== i)); }

  function changeUrgency(i: number, u: 'high' | 'medium' | 'low') {
    onChange(rules.map((r, idx) => (idx === i ? { ...r, urgency: u } : r)));
  }

  const urgencyColor = (u: string) =>
    u === 'high'   ? 'text-red-600 dark:text-red-400' :
    u === 'medium' ? 'text-amber-600 dark:text-amber-400' :
    'text-muted-foreground';

  return (
    <div className="space-y-2">
      {rules.length > 0 && (
        <div className="divide-y divide-border rounded-md border">
          {rules.map((r, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2">
              <span className="text-sm flex-1 min-w-0 truncate font-mono">{r.pattern}</span>
              <select
                value={r.urgency}
                onChange={(e) => changeUrgency(i, e.target.value as 'high' | 'medium' | 'low')}
                className={cn('h-7 rounded border border-input bg-background px-2 text-xs', urgencyColor(r.urgency))}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-foreground transition-colors">
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder="email@example.com or @domain.com"
          className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground"
        />
        <select
          value={urgency}
          onChange={(e) => setUrgency(e.target.value as 'high' | 'medium' | 'low')}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <Button type="button" size="sm" variant="outline" onClick={add} className="h-8 gap-1">
          <Plus className="w-3.5 h-3.5" />
          Add
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Match by full email or domain (e.g. <code className="font-mono">@client.com</code>).
        High = always surface · Medium = mild boost · Low = always suppress.
      </p>
    </div>
  );
}

// ─── Keybindings editor ───────────────────────────────────────────────────────

const KB_DEFAULTS: Record<string, string> = {
  nav_next: 'j', nav_prev: 'k', reply: 'r', archive: 'e',
  snooze: 's', dismiss: 'd', to_task: 't', send_nudge: 'f',
  new_task: 'n', bulk_select: 'x',
};

const KB_LABELS: Record<string, string> = {
  nav_next:    'Next card',
  nav_prev:    'Previous card',
  reply:       'Reply / Follow up',
  archive:     'Archive',
  snooze:      'Snooze',
  dismiss:     'Dismiss',
  to_task:     'Convert to task',
  send_nudge:  'Send / Nudge follow-up',
  new_task:    'New task',
  bulk_select: 'Toggle bulk select',
};

function KeybindingsEditor({
  bindings, onChange, disabled,
}: { bindings: Record<string, string>; onChange: (b: Record<string, string>) => void; disabled?: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const effective = { ...KB_DEFAULTS, ...bindings };

  function handleKeyDown(action: string, e: React.KeyboardEvent<HTMLInputElement>) {
    e.preventDefault();
    if (e.key === 'Escape') { setEditing(null); return; }
    const key = e.key.length === 1 ? e.key.toLowerCase() : null;
    if (!key) return;
    const conflict = Object.entries(effective).find(([a, k]) => k === key && a !== action);
    if (conflict) return;
    onChange({ ...effective, [action]: key });
    setEditing(null);
  }

  return (
    <div className="rounded-md border divide-y divide-border">
      {Object.keys(KB_DEFAULTS).map((action) => {
        const key = effective[action] ?? KB_DEFAULTS[action];
        const isEditing = editing === action;
        return (
          <div key={action} className="flex items-center justify-between px-3 py-2 gap-3">
            <span className="text-sm flex-1 min-w-0">{KB_LABELS[action]}</span>
            {isEditing ? (
              <input
                autoFocus
                className="w-8 h-7 rounded border border-primary bg-background text-center text-sm font-mono outline-none ring-1 ring-primary"
                onKeyDown={(e) => handleKeyDown(action, e)}
                onBlur={() => setEditing(null)}
                readOnly
                placeholder={key}
              />
            ) : (
              <button
                type="button"
                disabled={disabled}
                onClick={() => setEditing(action)}
                className={cn(
                  'w-8 h-7 rounded border text-sm font-mono font-medium transition-colors',
                  'border-input bg-muted hover:bg-muted/70 hover:border-primary',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {key}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  initialPrefs:             ExtensionPrefs;
  initialKbBindings:        Record<string, string>;
  initialDraftQueueEnabled: boolean;
  initialTimezone:          string;
  gmailEmail:               string;
  gmailName:                string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialAnalysis:          any;
  billing:                  BillingData;
}

export function ExtensionPrefsForm({
  initialPrefs, initialKbBindings, initialDraftQueueEnabled, initialTimezone,
  gmailEmail, gmailName, initialAnalysis, billing,
}: Props) {
  const [tab,       setTab]       = useState<Tab>('account');
  const [pending, startTransition] = useTransition();
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDirty,   setIsDirty]   = useState(false);
  const markDirty = useCallback(() => setIsDirty(true), []);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [triageDepth,     setTriageDepth]     = useState(initialPrefs.triage_depth);
  const [autoTriage,      setAutoTriage]      = useState(
    initialPrefs.auto_triage === 'scheduled' ? 'startup' : initialPrefs.auto_triage,
  );
  const [autoTriageTime,  setAutoTriageTime]  = useState(initialPrefs.auto_triage_time);
  const [readBody,         setReadBody]         = useState(initialPrefs.read_body);
  const [readSent,         setReadSent]         = useState(initialPrefs.read_sent);
  const [readPromo,        setReadPromo]        = useState(initialPrefs.read_promo);
  const [skipNewsletters,  setSkipNewsletters]  = useState(initialPrefs.skip_newsletters);
  const [skipReceipts,     setSkipReceipts]     = useState(initialPrefs.skip_receipts);
  const [skipCalendar,     setSkipCalendar]     = useState(initialPrefs.skip_calendar);
  const [skipSocial,       setSkipSocial]       = useState(initialPrefs.skip_social);
  const [skipFinancial,    setSkipFinancial]    = useState(initialPrefs.skip_financial);
  const [whitelist,        setWhitelist]        = useState(initialPrefs.whitelist.join('\n'));
  const [blacklist,        setBlacklist]        = useState(initialPrefs.blacklist.join('\n'));
  const [priorityRules,    setPriorityRules]    = useState<PriorityRule[]>(initialPrefs.priority_rules);
  const [personalContext,  setPersonalContext]  = useState(initialPrefs.personal_context);
  const [internalDomains,  setInternalDomains]  = useState(initialPrefs.internal_domains.join('\n'));
  const [composeDetection,    setComposeDetection]    = useState(initialPrefs.compose_detection);
  const [followupSuggestions, setFollowupSuggestions] = useState(initialPrefs.followup_suggestions);
  const [draftReplies,        setDraftReplies]        = useState(initialPrefs.draft_replies);
  const [keyboardShortcuts,   setKeyboardShortcuts]   = useState(initialPrefs.keyboard_shortcuts);
  const [theme,               setTheme]               = useState(initialPrefs.theme);
  const [snoozeDefault,       setSnoozeDefault]       = useState(initialPrefs.snooze_default);
  const [gmailFoldersEnabled, setGmailFoldersEnabled] = useState(initialPrefs.gmail_folders_enabled);
  const [kbBindings,          setKbBindings]          = useState<Record<string, string>>(initialKbBindings);
  const [draftQueueEnabled,   setDraftQueueEnabled]   = useState(initialDraftQueueEnabled);
  const [timezone,            setTimezone]            = useState(initialTimezone);

  function mk<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); markDirty(); };
  }

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  function saveAll() {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    startTransition(async () => {
      const tzFd = new FormData();
      tzFd.set('timezone', timezone);
      const [result, kbResult, dqResult, tzResult] = await Promise.all([
        saveExtensionPrefs({
          triage_depth:     triageDepth,
          auto_triage:      autoTriage,
          auto_triage_time: autoTriageTime,
          read_body:        readBody,
          read_sent:        readSent,
          read_promo:       readPromo,
          skip_newsletters: skipNewsletters,
          skip_receipts:    skipReceipts,
          skip_calendar:    skipCalendar,
          skip_social:      skipSocial,
          skip_financial:   skipFinancial,
          whitelist:        parseLines(whitelist),
          blacklist:        parseLines(blacklist),
          priority_rules:   priorityRules,
          personal_context: personalContext.trim(),
          internal_domains: parseLines(internalDomains),
          compose_detection:    composeDetection,
          followup_suggestions: followupSuggestions,
          draft_replies:        draftReplies,
          keyboard_shortcuts:   keyboardShortcuts,
          snooze_default:       snoozeDefault,
          theme,
          gmail_folders_enabled: gmailFoldersEnabled,
        }),
        saveKbBindings(kbBindings),
        saveDraftQueueEnabled(draftQueueEnabled),
        updatePreferences(tzFd),
      ]);
      setSaving(false);
      const firstError = result?.error ?? kbResult?.error ?? dqResult?.error ?? tzResult?.error;
      if (firstError) {
        setSaveError(firstError);
      } else {
        setSaved(true);
        setIsDirty(false);
        setTimeout(() => setSaved((s) => (s ? false : s)), 2500);
      }
    });
  }

  const disabled    = pending || saving;
  const inputCls    = 'w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm disabled:opacity-50';
  const textareaCls = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:font-sans placeholder:text-muted-foreground disabled:opacity-50';

  // ── Billing helpers ─────────────────────────────────────────────────────────
  const {
    planTier, stripeCustomerId, memberSince, invoices,
    nextBillingDate, paymentMethodLabel, subscriptionStatus,
    stripeError, billingLabel,
  } = billing;
  const isPaidPlan   = planTier !== 'free';
  const isTeamMember = planTier === 'team';
  const isPastDue    = subscriptionStatus === 'past_due';
  const isCanceled   = subscriptionStatus === 'canceled';
  const PLAN_LABELS: Record<string, string> = { free: 'Free', pro: 'Pro', team: 'Team' };

  return (
    <div className="space-y-0">

      {/* Header */}
      <div className="mb-5">
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">Configure your Inbox Triage account and preferences.</p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-border mb-6">
        <nav className="flex -mb-px">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium transition-colors border-b-2',
                tab === id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────────── */}
      <div className="space-y-6">

        {/* ── Account ─────────────────────────────────────────────────────── */}
        {tab === 'account' && (
          <>
            <GmailConnectionCard email={gmailEmail} name={gmailName} />

            {/* Current plan */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-muted-foreground" />
                      Current plan
                    </CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={planTier === 'free' ? 'secondary' : 'default'} className="capitalize">
                        {PLAN_LABELS[planTier] ?? planTier}
                      </Badge>
                      {subscriptionStatus && <SubscriptionStatusBadge status={subscriptionStatus} />}
                    </div>
                  </div>
                  {isPaidPlan && stripeCustomerId && !isTeamMember && <ManageBillingButton />}
                </div>
              </CardHeader>

              <CardContent className="space-y-5">
                {isPastDue && (
                  <div className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Payment past due</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                        Your last payment failed. Update your payment method — use <span className="font-semibold">Manage billing</span> above.
                      </p>
                    </div>
                  </div>
                )}

                {isCanceled && (
                  <div className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3">
                    <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-800 dark:text-red-300">Subscription canceled</p>
                      <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                        {nextBillingDate
                          ? `Access continues until ${nextBillingDate}, then reverts to free.`
                          : 'Access will revert to the free plan at the end of your current period.'}
                      </p>
                    </div>
                  </div>
                )}

                {stripeError && isPaidPlan && (
                  <div className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Couldn&apos;t load billing details</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                        Problem connecting to Stripe — your subscription is still active. Try refreshing.
                      </p>
                    </div>
                  </div>
                )}

                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                  {billingLabel && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Price</dt>
                      <dd className="mt-0.5 font-medium">{billingLabel}</dd>
                    </div>
                  )}
                  {nextBillingDate && !isCanceled && (
                    <div>
                      <dt className="text-xs text-muted-foreground">{isPastDue ? 'Payment due' : 'Next billing'}</dt>
                      <dd className={cn('mt-0.5 font-medium', isPastDue && 'text-amber-600')}>{nextBillingDate}</dd>
                    </div>
                  )}
                  {paymentMethodLabel && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Payment method</dt>
                      <dd className="mt-0.5 font-medium">{paymentMethodLabel}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-muted-foreground">Member since</dt>
                    <dd className="mt-0.5 font-medium">{memberSince}</dd>
                  </div>
                  {invoices.length > 0 && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Invoices</dt>
                      <dd className="mt-0.5 font-medium">
                        <button type="button" onClick={() => {}} className="hover:underline">
                          {invoices.length} on file
                        </button>
                      </dd>
                    </div>
                  )}
                </dl>

                {planTier === 'free' && (
                  <p className="text-xs text-muted-foreground">
                    You&apos;re on the free plan. Upgrade below to unlock unlimited triages and all Pro features.
                  </p>
                )}

                {isTeamMember && (
                  <p className="text-xs text-muted-foreground border-t border-border pt-4">
                    Team billing is managed on the{' '}
                    <Link href="/team" className="underline underline-offset-2 hover:text-foreground">Team page</Link>.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Change plan */}
            {!isTeamMember ? (
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold">Change plan</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Upgrade, downgrade, or switch billing cycles at any time.
                    {isPaidPlan && stripeCustomerId && (
                      <> To cancel, use <span className="font-medium">Manage billing</span> above.</>
                    )}
                  </p>
                </div>
                <PricingTable currentPlan={planTier} stripeCustomerId={stripeCustomerId} hideTeamToggle />
              </section>
            ) : (
              <Card className="border-dashed bg-muted/30">
                <CardContent className="flex items-start gap-3 py-5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Users className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Access managed by your organization</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Your plan and seat are controlled by your team&apos;s admin.
                    </p>
                    <Link
                      href="/team"
                      className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 hover:text-foreground transition-colors"
                    >
                      View team billing
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Billing history */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-muted-foreground" />
                  Billing history
                </CardTitle>
                <CardDescription>Invoices and receipts for your subscription payments.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="pr-6 text-right">Invoice</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.length > 0 ? (
                      invoices.map((inv, i) => (
                        <TableRow key={inv.id} className={i % 2 !== 0 ? 'bg-muted/30' : ''}>
                          <TableCell className="pl-6 py-3.5 text-sm whitespace-nowrap">{fmtDateUnix(inv.date)}</TableCell>
                          <TableCell className="py-3.5 text-sm text-muted-foreground max-w-[240px] truncate">{inv.description}</TableCell>
                          <TableCell className="py-3.5 text-sm font-medium whitespace-nowrap">{fmtAmount(inv.amount, inv.currency)}</TableCell>
                          <TableCell className="py-3.5"><InvoiceStatusBadge status={inv.status} /></TableCell>
                          <TableCell className="pr-6 py-3.5 text-right">
                            {(inv.pdfUrl || inv.hostedUrl) ? (
                              <div className="flex items-center justify-end gap-2">
                                {inv.pdfUrl && (
                                  <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                    PDF <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                                {inv.hostedUrl && (
                                  <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                    View <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="py-12 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <Receipt className="w-8 h-8 text-muted-foreground/30" />
                            <p className="text-sm text-muted-foreground">No invoices yet.</p>
                            <p className="text-xs text-muted-foreground">Your billing history will appear here once you subscribe.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Danger zone */}
            <Card className="border-destructive/40">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-medium text-destructive">Danger zone</CardTitle>
                <CardDescription>Irreversible actions — please proceed carefully.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pl-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Download my data</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Export your profile, triage sessions, and commitments as JSON.
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
                    <Link href="/api/account/download" target="_blank">
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </Link>
                  </Button>
                </div>
                <Separator />
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Delete account</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Permanently remove your account and all associated data.
                    </p>
                  </div>
                  <div className="shrink-0"><DeleteAccountDialog /></div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ── Scanning ─────────────────────────────────────────────────────── */}
        {tab === 'scanning' && (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Scan settings</CardTitle>
                <CardDescription>How many emails to scan and when to run automatically.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pl-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Scan depth</Label>
                    <select value={triageDepth} onChange={(e) => { setTriageDepth(e.target.value); markDirty(); }} disabled={disabled} className={inputCls}>
                      <option value="20">20 emails (fast)</option>
                      <option value="50">50 emails</option>
                      <option value="100">100 emails</option>
                      <option value="200">200 emails (thorough)</option>
                    </select>
                    <p className="text-xs text-muted-foreground">Max emails fetched per triage run.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Auto-triage</Label>
                    <select value={autoTriage} onChange={(e) => { setAutoTriage(e.target.value); markDirty(); }} disabled={disabled} className={inputCls}>
                      <option value="manual">Manual only</option>
                      <option value="startup">On Gmail open</option>
                    </select>
                    <p className="text-xs text-muted-foreground">When to run triage automatically.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Email scanning</CardTitle>
                <CardDescription>Control which emails are included in each triage run.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 divide-y divide-border pl-6">
                <ToggleRow label="Read email bodies" description="Fetch the full body for richer AI analysis. Disabling makes triage faster but less accurate." checked={readBody} onChange={mk(setReadBody)} disabled={disabled} />
                <ToggleRow label="Include sent emails" description="Surface threads where you sent the last message and may be waiting on a reply." checked={readSent} onChange={mk(setReadSent)} disabled={disabled} />
                <ToggleRow label="Include Promotions tab" description="Scan the Gmail Promotions category (usually marketing email — off by default)." checked={readPromo} onChange={mk(setReadPromo)} disabled={disabled} />

                <div className="pt-2 pb-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Auto-skip</p>
                </div>

                <ToggleRow label="Newsletters" description="Emails identified as bulk newsletters." checked={skipNewsletters} onChange={mk(setSkipNewsletters)} disabled={disabled} />
                <ToggleRow label="Receipts & confirmations" description="Order confirmations, shipping notices, booking emails." checked={skipReceipts} onChange={mk(setSkipReceipts)} disabled={disabled} />
                <ToggleRow label="Calendar notifications" description="Invite accepted/declined messages and calendar digests." checked={skipCalendar} onChange={mk(setSkipCalendar)} disabled={disabled} />
                <ToggleRow label="Social notifications" description="Emails from LinkedIn, Twitter/X, GitHub, Slack, etc." checked={skipSocial} onChange={mk(setSkipSocial)} disabled={disabled} />
                <ToggleRow label="Financial alerts" description="Bank notifications, credit card alerts, and similar." checked={skipFinancial} onChange={mk(setSkipFinancial)} disabled={disabled} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-medium">Sender Intelligence Refresh</CardTitle>
                <CardDescription>
                  Analyzes 90 days of Gmail history to score your senders — powers the Senders tab,
                  Deep Clean suggestions, and Autopilot rules. Runs once a week in the background.
                </CardDescription>
              </CardHeader>
              <CardContent className="pl-6">
                <SchedulePanel initialAnalysis={initialAnalysis} />
              </CardContent>
            </Card>
          </>
        )}

        {/* ── Rules ────────────────────────────────────────────────────────── */}
        {tab === 'rules' && (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Sender rules</CardTitle>
                <CardDescription>Override how specific senders are treated — regardless of their learned score.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 pl-6">
                <div className="space-y-2">
                  <Label>Always surface</Label>
                  <textarea rows={3} value={whitelist} onChange={(e) => { setWhitelist(e.target.value); markDirty(); }} disabled={disabled} placeholder={'boss@company.com\n@vip-client.com'} className={textareaCls} />
                  <p className="text-xs text-muted-foreground">One email or domain per line. These senders always pass through the noise filter.</p>
                </div>
                <div className="space-y-2">
                  <Label>Always skip</Label>
                  <textarea rows={3} value={blacklist} onChange={(e) => { setBlacklist(e.target.value); markDirty(); }} disabled={disabled} placeholder={'noreply@notifications.com\n@marketing-blasts.net'} className={textareaCls} />
                  <p className="text-xs text-muted-foreground">One email or domain per line. These senders are always filtered out.</p>
                </div>
                <div className="space-y-2">
                  <Label>Priority overrides</Label>
                  <PriorityRulesEditor rules={priorityRules} onChange={mk(setPriorityRules)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">AI context</CardTitle>
                <CardDescription>Extra context injected into every triage prompt. The more you share, the smarter the prioritisation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pl-6">
                <div className="space-y-2">
                  <Label>Personal context</Label>
                  <textarea
                    rows={5}
                    value={personalContext}
                    onChange={(e) => { setPersonalContext(e.target.value); markDirty(); }}
                    disabled={disabled}
                    placeholder={`I'm a founder at a 12-person B2B SaaS company. My top priorities are:\n• Unblocking my engineering team\n• Closing deals with enterprise prospects\n• Investor communications`}
                    className={textareaCls}
                  />
                  <p className="text-xs text-muted-foreground">Describe your role, priorities, and anything that helps Claude decide what matters to you.</p>
                </div>
                <div className="space-y-2">
                  <Label>Internal domains</Label>
                  <textarea rows={2} value={internalDomains} onChange={(e) => { setInternalDomains(e.target.value); markDirty(); }} disabled={disabled} placeholder={'mycompany.com\ncontractor-firm.com'} className={textareaCls} />
                  <p className="text-xs text-muted-foreground">
                    One domain per line. Emails from these domains are treated as internal colleagues.
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ── Workflows ────────────────────────────────────────────────────── */}
        {tab === 'workflows' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Tasks & commitments</CardTitle>
              <CardDescription>Control how the extension tracks what you owe and what you&apos;re owed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 divide-y divide-border pl-6">
              <ToggleRow
                label="Detect commitments when composing"
                description="Scan emails you send and extract &quot;I will…&quot; commitments automatically."
                checked={composeDetection}
                onChange={mk(setComposeDetection)}
                disabled={disabled}
              />
              <ToggleRow
                label="Suggest follow-up reminders"
                description="When you send an email, offer to create a follow-up if no reply arrives."
                checked={followupSuggestions}
                onChange={mk(setFollowupSuggestions)}
                disabled={disabled}
              />
              <ToggleRow
                label="AI-drafted reply suggestions"
                description="Show a suggested reply draft when you open a triage card."
                checked={draftReplies}
                onChange={mk(setDraftReplies)}
                disabled={disabled}
              />
              <ToggleRow
                label="AI Draft Queue"
                description="After each triage run, pre-generate ready-to-send replies for your Needs Reply items. Launch the queue from the sidebar to review and send in one focused session."
                checked={draftQueueEnabled}
                onChange={(v) => { setDraftQueueEnabled(v); markDirty(); }}
                disabled={disabled}
              />
            </CardContent>
          </Card>
        )}

        {/* ── Interface ────────────────────────────────────────────────────── */}
        {tab === 'interface' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Interface</CardTitle>
              <CardDescription>Keyboard shortcuts, appearance, and time zone.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pl-6">
              <div className="space-y-1 divide-y divide-border">
                <ToggleRow
                  label="Keyboard shortcuts"
                  description="J/K to navigate, R to reply, E to archive, S to snooze, and more."
                  checked={keyboardShortcuts}
                  onChange={mk(setKeyboardShortcuts)}
                  disabled={disabled}
                />
                <ToggleRow
                  label="Gmail folder labels"
                  description='Creates "Inbox Triage/Needs Reply" and "Inbox Triage/Internal" as folders in your Gmail sidebar.'
                  checked={gmailFoldersEnabled}
                  onChange={mk(setGmailFoldersEnabled)}
                  disabled={disabled}
                />
              </div>

              {keyboardShortcuts && (
                <div className="space-y-2 pt-3">
                  <div className="flex items-center justify-between">
                    <Label>Key bindings</Label>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => { setKbBindings({}); markDirty(); }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      Reset to defaults
                    </button>
                  </div>
                  <KeybindingsEditor
                    bindings={kbBindings}
                    onChange={(b) => { setKbBindings(b); markDirty(); }}
                    disabled={disabled}
                  />
                  <p className="text-xs text-muted-foreground">Click any key to remap it. Press the new key or Escape to cancel.</p>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2 pt-1">
                <div className="space-y-1.5">
                  <Label>Default snooze</Label>
                  <select value={snoozeDefault} onChange={(e) => { setSnoozeDefault(e.target.value); markDirty(); }} disabled={disabled} className={inputCls}>
                    <option value="tomorrow">Tomorrow morning (9 am)</option>
                    <option value="3days">In 3 days</option>
                    <option value="monday">Next Monday</option>
                    <option value="custom">Always ask me</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Theme</Label>
                  <select value={theme} onChange={(e) => { setTheme(e.target.value); markDirty(); }} disabled={disabled} className={inputCls}>
                    <option value="auto">Auto (follow system)</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Time zone</Label>
                  <select value={timezone} onChange={(e) => { setTimezone(e.target.value); markDirty(); }} disabled={disabled} className={inputCls}>
                    {TIMEZONES.map(({ group, zones }) => (
                      <optgroup key={group} label={group}>
                        {zones.map((tz) => (
                          <option key={tz} value={tz}>{tz.replace(/_/g, ' ').replace('/', ' / ')}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">Used for scheduling reminders and bundle digest delivery.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

      </div>

      {/* ── Sticky save bar ───────────────────────────────────────────────── */}
      <div
        className={cn(
          'sticky bottom-4 z-10 transition-all duration-200 mt-6',
          isDirty || saved || saveError
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-2 pointer-events-none',
        )}
      >
        <div className="flex items-center justify-between gap-4 rounded-lg border bg-background px-4 py-3 shadow-lg">
          <div className="flex items-center gap-2 min-w-0">
            {saveError ? (
              <>
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm text-destructive truncate">{saveError}</p>
              </>
            ) : saved ? (
              <>
                <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                <p className="text-sm text-muted-foreground">All preferences saved.</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">You have unsaved changes.</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isDirty && !saving && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTriageDepth(initialPrefs.triage_depth);
                  setAutoTriage(initialPrefs.auto_triage);
                  setAutoTriageTime(initialPrefs.auto_triage_time);
                  setReadBody(initialPrefs.read_body);
                  setReadSent(initialPrefs.read_sent);
                  setReadPromo(initialPrefs.read_promo);
                  setSkipNewsletters(initialPrefs.skip_newsletters);
                  setSkipReceipts(initialPrefs.skip_receipts);
                  setSkipCalendar(initialPrefs.skip_calendar);
                  setSkipSocial(initialPrefs.skip_social);
                  setSkipFinancial(initialPrefs.skip_financial);
                  setWhitelist(initialPrefs.whitelist.join('\n'));
                  setBlacklist(initialPrefs.blacklist.join('\n'));
                  setPriorityRules(initialPrefs.priority_rules);
                  setPersonalContext(initialPrefs.personal_context);
                  setInternalDomains(initialPrefs.internal_domains.join('\n'));
                  setComposeDetection(initialPrefs.compose_detection);
                  setFollowupSuggestions(initialPrefs.followup_suggestions);
                  setDraftReplies(initialPrefs.draft_replies);
                  setKeyboardShortcuts(initialPrefs.keyboard_shortcuts);
                  setSnoozeDefault(initialPrefs.snooze_default);
                  setTheme(initialPrefs.theme);
                  setGmailFoldersEnabled(initialPrefs.gmail_folders_enabled);
                  setKbBindings(initialKbBindings);
                  setDraftQueueEnabled(initialDraftQueueEnabled);
                  setTimezone(initialTimezone);
                  setIsDirty(false);
                  setSaveError(null);
                }}
              >
                Discard
              </Button>
            )}

            <Button type="button" size="sm" disabled={disabled || (!isDirty && !saveError)} onClick={saveAll}>
              {saving ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</>
              ) : saved && !isDirty ? (
                <><Check className="w-3.5 h-3.5 mr-1.5" />Saved</>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>
      </div>

    </div>
  );
}
