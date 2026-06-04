'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { saveExtensionPrefs } from '@/app/actions/extension-prefs';
import type { ExtensionPrefs, PriorityRule } from '@/lib/extension-prefs';
import { Button }    from '@/components/ui/button';
import { Label }     from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, Check, Plus, X as XIcon, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Tiny helpers ────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
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
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
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

// Parses a textarea (one item per line) into a string[]
function parseLines(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

// ─── Days-of-week chip picker ─────────────────────────────────────────────────

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABEL: Record<string, string> = {
  mon: 'Mo', tue: 'Tu', wed: 'We', thu: 'Th', fri: 'Fr', sat: 'Sa', sun: 'Su',
};

function DayPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (days: string[]) => void;
}) {
  function toggle(day: string) {
    onChange(
      selected.includes(day) ? selected.filter((d) => d !== day) : [...selected, day],
    );
  }
  return (
    <div className="flex gap-1.5 flex-wrap">
      {ALL_DAYS.map((d) => {
        const on = selected.includes(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => toggle(d)}
            className={cn(
              'h-7 w-8 rounded text-xs font-medium transition-colors',
              on
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
          >
            {DAY_LABEL[d]}
          </button>
        );
      })}
    </div>
  );
}

// ─── Priority rules mini-editor ───────────────────────────────────────────────

function PriorityRulesEditor({
  rules,
  onChange,
}: {
  rules: PriorityRule[];
  onChange: (r: PriorityRule[]) => void;
}) {
  const [pattern, setPattern] = useState('');
  const [urgency,  setUrgency] = useState<'high' | 'medium' | 'low'>('high');

  function add() {
    const p = pattern.trim();
    if (!p) return;
    onChange([...rules, { pattern: p, urgency }]);
    setPattern('');
  }

  function remove(i: number) {
    onChange(rules.filter((_, idx) => idx !== i));
  }

  function changeUrgency(i: number, u: 'high' | 'medium' | 'low') {
    onChange(rules.map((r, idx) => (idx === i ? { ...r, urgency: u } : r)));
  }

  const urgencyColor = (u: string) =>
    u === 'high' ? 'text-red-600 dark:text-red-400' :
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
                className={cn(
                  'h-7 rounded border border-input bg-background px-2 text-xs',
                  urgencyColor(r.urgency),
                )}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
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

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  initialPrefs: ExtensionPrefs;
}

export function ExtensionPrefsForm({ initialPrefs }: Props) {
  const [pending, startTransition] = useTransition();
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDirty,   setIsDirty]   = useState(false);

  // Mark dirty whenever any field changes — wrapped below via `mk`
  const markDirty = useCallback(() => setIsDirty(true), []);

  // ── Local state mirrors prefs ──────────────────────────────────────────────
  // Section: Triage
  const [triageDepth,     setTriageDepth]     = useState(initialPrefs.triage_depth);
  const [autoTriage,      setAutoTriage]      = useState(initialPrefs.auto_triage);
  const [autoTriageTime,  setAutoTriageTime]  = useState(initialPrefs.auto_triage_time);
  const [workingHours,    setWorkingHours]    = useState(initialPrefs.working_hours);

  // Section: Scan
  const [readBody,         setReadBody]         = useState(initialPrefs.read_body);
  const [readSent,         setReadSent]         = useState(initialPrefs.read_sent);
  const [readOld,          setReadOld]          = useState(initialPrefs.read_old);
  const [readPromo,        setReadPromo]        = useState(initialPrefs.read_promo);
  const [skipNewsletters,  setSkipNewsletters]  = useState(initialPrefs.skip_newsletters);
  const [skipReceipts,     setSkipReceipts]     = useState(initialPrefs.skip_receipts);
  const [skipCalendar,     setSkipCalendar]     = useState(initialPrefs.skip_calendar);
  const [skipSocial,       setSkipSocial]       = useState(initialPrefs.skip_social);
  const [skipFinancial,    setSkipFinancial]    = useState(initialPrefs.skip_financial);

  // Section: Sender rules
  const [whitelist,      setWhitelist]      = useState(initialPrefs.whitelist.join('\n'));
  const [blacklist,      setBlacklist]      = useState(initialPrefs.blacklist.join('\n'));
  const [priorityRules,  setPriorityRules]  = useState<PriorityRule[]>(initialPrefs.priority_rules);

  // Section: AI & context
  const [personalContext,  setPersonalContext]  = useState(initialPrefs.personal_context);
  const [internalDomains,  setInternalDomains]  = useState(initialPrefs.internal_domains.join('\n'));

  // Section: Tasks & commitments
  const [composeDetection,    setComposeDetection]    = useState(initialPrefs.compose_detection);
  const [followupSuggestions, setFollowupSuggestions] = useState(initialPrefs.followup_suggestions);
  const [draftReplies,        setDraftReplies]        = useState(initialPrefs.draft_replies);
  const [overdueDays,         setOverdueDays]         = useState(String(initialPrefs.overdue_days));

  // Section: Interface
  const [keyboardShortcuts,   setKeyboardShortcuts]   = useState(initialPrefs.keyboard_shortcuts);
  const [tasksDefaultView,    setTasksDefaultView]    = useState(initialPrefs.tasks_default_view);
  const [theme,               setTheme]               = useState(initialPrefs.theme);
  const [snoozeDefault,       setSnoozeDefault]       = useState(initialPrefs.snooze_default);
  const [gmailFoldersEnabled, setGmailFoldersEnabled] = useState(initialPrefs.gmail_folders_enabled);


  // ── Dirty-tracking wrappers ────────────────────────────────────────────────
  // `mk(setter)` returns a new setter that also calls markDirty
  function mk<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); markDirty(); };
  }

  // Warn on navigate-away with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // ── Save all ───────────────────────────────────────────────────────────────
  function saveAll() {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    startTransition(async () => {
      const result = await saveExtensionPrefs({
        triage_depth:     triageDepth,
        auto_triage:      autoTriage,
        auto_triage_time: autoTriageTime,
        working_hours:    workingHours,
        read_body:        readBody,
        read_sent:        readSent,
        read_old:         readOld,
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
        overdue_days:         Math.max(1, Math.min(90, Number(overdueDays) || 14)),
        keyboard_shortcuts:   keyboardShortcuts,
        tasks_default_view:   tasksDefaultView,
        snooze_default:       snoozeDefault,
        theme,
        gmail_folders_enabled: gmailFoldersEnabled,
      });
      setSaving(false);
      if (result?.error) {
        setSaveError(result.error);
      } else {
        setSaved(true);
        setIsDirty(false);
        setTimeout(() => setSaved((s) => (s ? false : s)), 2500);
      }
    });
  }

  const disabled   = pending || saving;
  const inputCls   = 'w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm disabled:opacity-50';
  const textareaCls = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:font-sans placeholder:text-muted-foreground disabled:opacity-50';

  return (
    <div className="space-y-6">

      {/* ── 1. Triage ──────────────────────────────────────────────────────── */}
      <Card id="triage" className="scroll-mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Triage</CardTitle>
          <CardDescription>How many emails to scan and when to run automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                <option value="scheduled">Scheduled time</option>
              </select>
              <p className="text-xs text-muted-foreground">When to run triage automatically.</p>
            </div>
          </div>

          {autoTriage === 'scheduled' && (
            <div className="space-y-1.5 max-w-[160px]">
              <Label>Scheduled time</Label>
              <input type="time" value={autoTriageTime} onChange={(e) => { setAutoTriageTime(e.target.value); markDirty(); }} disabled={disabled} className={inputCls} />
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <Label>Working hours</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Start</p>
                <input type="time" value={workingHours.start} onChange={(e) => { setWorkingHours({ ...workingHours, start: e.target.value }); markDirty(); }} disabled={disabled} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">End</p>
                <input type="time" value={workingHours.end} onChange={(e) => { setWorkingHours({ ...workingHours, end: e.target.value }); markDirty(); }} disabled={disabled} className={inputCls} />
              </div>
            </div>
            <DayPicker selected={workingHours.days} onChange={(days) => { setWorkingHours({ ...workingHours, days }); markDirty(); }} />
            <p className="text-xs text-muted-foreground">
              Outside these hours, due-today flags are suppressed so you can disconnect.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── 2. Email scanning ─────────────────────────────────────────────── */}
      <Card id="email-scanning" className="scroll-mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Email scanning</CardTitle>
          <CardDescription>Control which emails are included in each triage run.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 divide-y divide-border">
          <ToggleRow label="Read email bodies" description="Fetch the full body for richer AI analysis. Disabling makes triage faster but less accurate." checked={readBody} onChange={mk(setReadBody)} disabled={disabled} />
          <ToggleRow label="Include sent emails" description="Surface threads where you sent the last message and may be waiting on a reply." checked={readSent} onChange={mk(setReadSent)} disabled={disabled} />
          <ToggleRow label="Include older emails" description="Extend the scan window beyond the default 7 days." checked={readOld} onChange={mk(setReadOld)} disabled={disabled} />
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

      {/* ── 3. Sender rules ──────────────────────────────────────────────── */}
      <Card id="sender-rules" className="scroll-mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Sender rules</CardTitle>
          <CardDescription>Override how specific senders are treated — regardless of their learned score.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
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

      {/* ── 4. AI & context ──────────────────────────────────────────────── */}
      <Card id="ai-context" className="scroll-mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">AI & context</CardTitle>
          <CardDescription>Extra context injected into every triage prompt. The more you share, the smarter the prioritisation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Personal context</Label>
            <textarea rows={5} value={personalContext} onChange={(e) => { setPersonalContext(e.target.value); markDirty(); }} disabled={disabled} placeholder={`I'm a founder at a 12-person B2B SaaS company. My top priorities are:\n• Unblocking my engineering team\n• Closing deals with enterprise prospects\n• Investor communications`} className={textareaCls} />
            <p className="text-xs text-muted-foreground">Describe your role, priorities, and anything that helps Claude decide what matters to you.</p>
          </div>
          <div className="space-y-2">
            <Label>Internal domains</Label>
            <textarea rows={2} value={internalDomains} onChange={(e) => { setInternalDomains(e.target.value); markDirty(); }} disabled={disabled} placeholder={'mycompany.com\ncontractor-firm.com'} className={textareaCls} />
            <p className="text-xs text-muted-foreground">
              One domain per line. Emails from these domains are treated as internal colleagues and scored differently from external contacts.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── 5. Tasks & commitments ────────────────────────────────────────── */}
      <Card id="tasks" className="scroll-mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Tasks & commitments</CardTitle>
          <CardDescription>Control how the extension tracks what you owe and what you&apos;re owed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 divide-y divide-border">
          <ToggleRow label="Detect commitments when composing" description="Scan emails you send and extract &quot;I will…&quot; commitments automatically." checked={composeDetection} onChange={mk(setComposeDetection)} disabled={disabled} />
          <ToggleRow label="Suggest follow-up reminders" description="When you send an email, offer to create a follow-up if no reply arrives." checked={followupSuggestions} onChange={mk(setFollowupSuggestions)} disabled={disabled} />
          <ToggleRow label="AI-drafted reply suggestions" description="Show a suggested reply draft when you open a triage card." checked={draftReplies} onChange={mk(setDraftReplies)} disabled={disabled} />

          <div className="pt-3 pb-1 space-y-1.5">
            <Label>Overdue threshold</Label>
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={90} value={overdueDays} onChange={(e) => { setOverdueDays(e.target.value); markDirty(); }} disabled={disabled} className="w-20 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm" />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
            <p className="text-xs text-muted-foreground">Open commitments older than this are flagged as overdue in the My Tasks view.</p>
          </div>
        </CardContent>
      </Card>

      {/* ── 6. Interface ─────────────────────────────────────────────────── */}
      <Card id="interface" className="scroll-mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Interface</CardTitle>
          <CardDescription>Keyboard shortcuts, layout, and appearance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1 divide-y divide-border">
            <ToggleRow label="Keyboard shortcuts" description="J/K to navigate, R to reply, E to archive, S to snooze, and more." checked={keyboardShortcuts} onChange={mk(setKeyboardShortcuts)} disabled={disabled} />
            <ToggleRow
              label="Gmail folder labels"
              description='Creates "Inbox Triage/Needs Reply" and "Inbox Triage/Internal" as folders in your Gmail sidebar. Labels sync after each triage run and when you action emails.'
              checked={gmailFoldersEnabled}
              onChange={mk(setGmailFoldersEnabled)}
              disabled={disabled}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 pt-1">
            <div className="space-y-1.5">
              <Label>Default task view</Label>
              <select value={tasksDefaultView} onChange={(e) => { setTasksDefaultView(e.target.value); markDirty(); }} disabled={disabled} className={inputCls}>
                <option value="grouped">Grouped by sender</option>
                <option value="flat">Flat list</option>
              </select>
            </div>

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
          </div>
        </CardContent>
      </Card>

      {/* ── Sticky save bar ───────────────────────────────────────────────── */}
      {/* Shown as soon as any field changes; disappears after a successful save */}
      <div
        className={cn(
          'sticky bottom-4 z-10 transition-all duration-200',
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
                  // Reset all fields to initialPrefs
                  setTriageDepth(initialPrefs.triage_depth);
                  setAutoTriage(initialPrefs.auto_triage);
                  setAutoTriageTime(initialPrefs.auto_triage_time);
                  setWorkingHours(initialPrefs.working_hours);
                  setReadBody(initialPrefs.read_body);
                  setReadSent(initialPrefs.read_sent);
                  setReadOld(initialPrefs.read_old);
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
                  setOverdueDays(String(initialPrefs.overdue_days));
                  setKeyboardShortcuts(initialPrefs.keyboard_shortcuts);
                  setTasksDefaultView(initialPrefs.tasks_default_view);
                  setSnoozeDefault(initialPrefs.snooze_default);
                  setTheme(initialPrefs.theme);
                  setGmailFoldersEnabled(initialPrefs.gmail_folders_enabled);
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
