'use client';

// BundlePanel — Email bundling configuration UI.
// Disabled state:  explanation + enable flow (delivery time + sender selection).
// Enabled state:   summary, bundled senders list, suggestions to add, digest controls.

import { useState, useEffect, useTransition, useCallback } from 'react';
import { toast }    from 'sonner';
import {
  Package, Clock, Mail, Loader2, X, Plus, SendHorizonal, CheckSquare, Square,
} from 'lucide-react';
import { Button }   from '@/components/ui/button';
import { cn }       from '@/lib/utils';
import {
  getBundleSettings, enableBundle, disableBundle,
  addSendersToBundle, removeSenderFromBundle,
  updateBundleDeliveryHour, sendDigestNow,
  type BundleSettings, type BundledSender, type SuggestedSender,
} from '@/app/actions/bundle';

// ── Timezone helpers ──────────────────────────────────────────────────────────

function shortTzName(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? timezone;
  } catch {
    return timezone;
  }
}

// ── Delivery hour options ─────────────────────────────────────────────────────

const HOUR_OPTIONS = [
  { value: 5,  label: '5:00 AM' },
  { value: 6,  label: '6:00 AM' },
  { value: 7,  label: '7:00 AM' },
  { value: 8,  label: '8:00 AM' },
  { value: 9,  label: '9:00 AM' },
  { value: 10, label: '10:00 AM' },
  { value: 11, label: '11:00 AM' },
  { value: 12, label: '12:00 PM' },
  { value: 13, label: '1:00 PM' },
  { value: 17, label: '5:00 PM' },
  { value: 18, label: '6:00 PM' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function BundlePanel() {
  const [settings,    setSettings]    = useState<BundleSettings | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [isPending,   startTransition] = useTransition();
  // Enable flow state
  const [showSetup,   setShowSetup]   = useState(false);
  const [setupHour,   setSetupHour]   = useState(9);
  const [setupSelected, setSetupSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { settings: s, error } = await getBundleSettings();
    if (error) toast.error(error);
    else if (s) setSettings(s);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Enable flow ─────────────────────────────────────────────────────────────

  function handleEnableClick() {
    // Pre-select all suggestions
    if (settings?.suggested_senders.length) {
      setSetupSelected(new Set(settings.suggested_senders.map((s) => s.sender_email)));
    }
    setShowSetup(true);
  }

  function toggleSetupSender(email: string) {
    setSetupSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email); else next.add(email);
      return next;
    });
  }

  function handleConfirmEnable() {
    startTransition(async () => {
      const { error } = await enableBundle(setupHour, Array.from(setupSelected));
      if (error) { toast.error(error); return; }
      toast.success('Bundling enabled! Gmail filters created for selected senders.');
      setShowSetup(false);
      await load();
    });
  }

  // ── Disable ─────────────────────────────────────────────────────────────────

  function handleDisable() {
    startTransition(async () => {
      const { error } = await disableBundle();
      if (error) { toast.error(error); return; }
      toast.success('Bundling disabled — emails restored to your inbox.');
      await load();
    });
  }

  // ── Add suggestion ──────────────────────────────────────────────────────────

  function handleAddSuggestion(email: string) {
    startTransition(async () => {
      const { error } = await addSendersToBundle([email]);
      if (error) { toast.error(error); return; }
      toast.success('Added to bundle.');
      await load();
    });
  }

  // ── Remove bundled sender ───────────────────────────────────────────────────

  function handleRemove(email: string) {
    startTransition(async () => {
      const { error } = await removeSenderFromBundle(email);
      if (error) { toast.error(error); return; }
      toast.success('Removed from bundle.');
      await load();
    });
  }

  // ── Delivery hour change ────────────────────────────────────────────────────

  function handleHourChange(hour: number) {
    startTransition(async () => {
      const { error } = await updateBundleDeliveryHour(hour);
      if (error) { toast.error(error); return; }
      setSettings((s) => s ? { ...s, delivery_hour: hour } : s);
      toast.success('Delivery time updated.');
    });
  }

  // ── Send digest now ─────────────────────────────────────────────────────────

  function handleSendNow() {
    startTransition(async () => {
      const result = await sendDigestNow();
      if (result.error) { toast.error(result.error); return; }
      if (!result.sent) {
        const msg = result.reason === 'empty_bundle'
          ? 'Your bundle is empty — no emails to digest yet.'
          : 'Nothing to send.';
        toast.info(msg);
        return;
      }
      toast.success(
        `Digest sent — ${result.emailCount} email${result.emailCount !== 1 ? 's' : ''} from ${result.senderCount} sender${result.senderCount !== 1 ? 's' : ''}.`,
        { description: 'Check your inbox for the bundle summary.' },
      );
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading…
      </div>
    );
  }

  // Setup modal overlay
  if (showSetup && settings) {
    return (
      <SetupFlow
        suggestions={settings.suggested_senders}
        selectedHour={setupHour}
        timezone={settings.timezone}
        selected={setupSelected}
        onHourChange={setSetupHour}
        onToggleSender={toggleSetupSender}
        onConfirm={handleConfirmEnable}
        onCancel={() => setShowSetup(false)}
        isPending={isPending}
      />
    );
  }

  // Disabled state
  if (!settings?.enabled) {
    return (
      <DisabledState onEnable={handleEnableClick} hasSuggestions={(settings?.suggested_senders.length ?? 0) > 0} />
    );
  }

  // Enabled state
  return (
    <EnabledState
      settings={settings}
      timezone={settings.timezone}
      isPending={isPending}
      onDisable={handleDisable}
      onHourChange={handleHourChange}
      onRemove={handleRemove}
      onAddSuggestion={handleAddSuggestion}
      onSendNow={handleSendNow}
    />
  );
}

// ── DisabledState ─────────────────────────────────────────────────────────────

function DisabledState({ onEnable, hasSuggestions }: { onEnable: () => void; hasSuggestions: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
        <Package className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
        <div className="space-y-1">
          <p className="font-medium">How bundles work</p>
          <ul className="list-disc list-inside space-y-0.5 text-blue-800">
            <li>Emails from bundled senders skip your inbox and go to a Bundle label</li>
            <li>Once a day at your chosen time, you get a single digest email summarising what arrived</li>
            <li>The originals stay in the Bundle label — open them when you're ready</li>
            <li>You can release the bundle early from the Bundle label at any time</li>
          </ul>
        </div>
      </div>
      <Button onClick={onEnable} size="sm">
        <Package className="w-3.5 h-3.5 mr-1.5" />
        {hasSuggestions ? 'Enable Bundles — choose senders →' : 'Enable Bundles'}
      </Button>
    </div>
  );
}

// ── SetupFlow ─────────────────────────────────────────────────────────────────

function SetupFlow({
  suggestions, selectedHour, timezone, selected,
  onHourChange, onToggleSender, onConfirm, onCancel, isPending,
}: {
  suggestions:    SuggestedSender[];
  selectedHour:   number;
  timezone:       string;
  selected:       Set<string>;
  onHourChange:   (h: number) => void;
  onToggleSender: (email: string) => void;
  onConfirm:      () => void;
  onCancel:       () => void;
  isPending:      boolean;
}) {
  const tzShort = shortTzName(timezone);
  function toggleAll() {
    if (selected.size === suggestions.length) {
      suggestions.forEach((s) => onToggleSender(s.sender_email));
    } else {
      suggestions.forEach((s) => {
        if (!selected.has(s.sender_email)) onToggleSender(s.sender_email);
      });
    }
  }

  return (
    <div className="space-y-5">
      {/* Delivery time */}
      <div>
        <p className="text-sm font-medium mb-2">Deliver digest at ({tzShort})</p>
        <div className="flex flex-wrap gap-2">
          {HOUR_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onHourChange(value)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                selectedHour === value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:border-primary/50 hover:bg-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Sender selection */}
      {suggestions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">
              Suggested senders to bundle ({suggestions.length})
            </p>
            <button
              onClick={toggleAll}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {selected.size === suggestions.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            These senders email you regularly but you rarely open them. Uncheck any you want to keep in your inbox.
          </p>
          <div className="border border-border rounded-lg divide-y divide-border max-h-64 overflow-y-auto">
            {suggestions.map((s) => {
              const checked = selected.has(s.sender_email);
              return (
                <button
                  key={s.sender_email}
                  onClick={() => onToggleSender(s.sender_email)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors',
                    checked && 'bg-primary/5',
                  )}
                >
                  {checked
                    ? <CheckSquare className="w-4 h-4 text-primary shrink-0" />
                    : <Square className="w-4 h-4 text-muted-foreground shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.sender_name || s.sender_email}</div>
                    {s.sender_name && (
                      <div className="text-xs text-muted-foreground truncate">{s.sender_email}</div>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">~{s.emails_per_month}/mo</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {suggestions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No sender suggestions yet — you can add senders manually after enabling.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={onConfirm} disabled={isPending} size="sm">
          {isPending
            ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            : <Package className="w-3.5 h-3.5 mr-1.5" />
          }
          Enable with {selected.size} sender{selected.size !== 1 ? 's' : ''}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── EnabledState ──────────────────────────────────────────────────────────────

function EnabledState({
  settings, timezone, isPending,
  onDisable, onHourChange, onRemove, onAddSuggestion, onSendNow,
}: {
  settings:        BundleSettings;
  timezone:        string;
  isPending:       boolean;
  onDisable:       () => void;
  onHourChange:    (h: number) => void;
  onRemove:        (email: string) => void;
  onAddSuggestion: (email: string) => void;
  onSendNow:       () => void;
}) {
  const tzShort          = shortTzName(timezone);
  const currentHourLabel = HOUR_OPTIONS.find((o) => o.value === settings.delivery_hour)?.label
    ?? `${settings.delivery_hour}:00`;

  const lastDigest = settings.last_digest_at
    ? new Date(settings.last_digest_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    : null;

  return (
    <div className="space-y-5">
      {/* Status bar */}
      <div className="flex items-center justify-between gap-4 p-3 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center gap-2 text-sm text-green-800">
          <Package className="w-4 h-4 text-green-600" />
          <span className="font-medium">Bundling active</span>
          <span className="text-green-700">·</span>
          <Clock className="w-3.5 h-3.5 text-green-600" />
          <span>Digest at {currentHourLabel} {tzShort} daily</span>
          {lastDigest && (
            <>
              <span className="text-green-700">·</span>
              <span className="text-green-700">Last sent {lastDigest}</span>
            </>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSendNow}
          disabled={isPending}
          className="text-green-700 hover:text-green-800 hover:bg-green-100 shrink-0 h-7 text-xs"
        >
          {isPending
            ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            : <SendHorizonal className="w-3 h-3 mr-1" />
          }
          Send now
        </Button>
      </div>

      {/* Delivery time selector */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Delivery time ({tzShort})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {HOUR_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onHourChange(value)}
              disabled={isPending}
              className={cn(
                'px-2.5 py-1 rounded text-xs font-medium border transition-colors',
                settings.delivery_hour === value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:border-primary/40 hover:bg-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Bundled senders */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Bundled senders ({settings.bundled_senders.length})
        </p>
        {settings.bundled_senders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No senders bundled yet. Add some below.
          </p>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border">
            {settings.bundled_senders.map((s) => (
              <BundledSenderRow
                key={s.sender_email}
                sender={s}
                onRemove={() => onRemove(s.sender_email)}
                isPending={isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* Suggestions to add */}
      {settings.suggested_senders.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Suggestions ({settings.suggested_senders.length})
          </p>
          <div className="border border-border rounded-lg divide-y divide-border">
            {settings.suggested_senders.slice(0, 10).map((s) => (
              <SuggestionRow
                key={s.sender_email}
                sender={s}
                onAdd={() => onAddSuggestion(s.sender_email)}
                isPending={isPending}
              />
            ))}
          </div>
        </div>
      )}

      {/* Disable */}
      <div className="pt-2 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={onDisable}
          disabled={isPending}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-xs h-7"
        >
          Disable bundling
        </Button>
      </div>
    </div>
  );
}

// ── Row components ────────────────────────────────────────────────────────────

function BundledSenderRow({ sender, onRemove, isPending }: {
  sender:    BundledSender;
  onRemove:  () => void;
  isPending: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{sender.sender_name || sender.sender_email}</div>
        {sender.sender_name && (
          <div className="text-xs text-muted-foreground truncate">{sender.sender_email}</div>
        )}
      </div>
      <button
        onClick={onRemove}
        disabled={isPending}
        className="text-muted-foreground hover:text-destructive transition-colors shrink-0 p-1 rounded hover:bg-destructive/10"
        title="Remove from bundle"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function SuggestionRow({ sender, onAdd, isPending }: {
  sender:    SuggestedSender;
  onAdd:     () => void;
  isPending: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{sender.sender_name || sender.sender_email}</div>
        {sender.sender_name && (
          <div className="text-xs text-muted-foreground truncate">{sender.sender_email}</div>
        )}
      </div>
      <span className="text-xs text-muted-foreground shrink-0">~{sender.emails_per_month}/mo</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onAdd}
        disabled={isPending}
        className="h-7 px-2 text-xs border border-border hover:border-primary/50 shrink-0"
      >
        <Plus className="w-3 h-3 mr-1" />
        Add
      </Button>
    </div>
  );
}
