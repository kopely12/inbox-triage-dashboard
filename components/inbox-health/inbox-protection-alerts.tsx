'use client';

import { useState, useTransition } from 'react';
import { ShieldCheck, ShieldAlert, TrendingUp, MailWarning, X, Loader2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast  } from 'sonner';
import {
  dismissProtectionAlert,
  actionProtectionAlert,
  type InboxAlert,
  type AlertType,
} from '@/app/actions/protection';

// ── Alert metadata ────────────────────────────────────────────────────────────

const ALERT_META: Record<AlertType, {
  label:       string;
  icon:        React.ReactNode;
  color:       string;
  border:      string;
  bg:          string;
  actionLabel: string;
  actionDesc:  string;
  descFn:      (a: InboxAlert) => string;
}> = {
  post_unsubscribe: {
    label:       'Still emailing after opt-out',
    icon:        <MailWarning className="w-4 h-4" />,
    color:       'text-red-600 dark:text-red-400',
    border:      'border-red-200 dark:border-red-800',
    bg:          'bg-red-50/60 dark:bg-red-950/30',
    actionLabel: 'Unsubscribe',
    actionDesc:  'Queue a formal unsubscribe request',
    descFn: (a) => {
      const count = (a.metadata.emails_since_optout as number) ?? 0;
      return `${count} email${count !== 1 ? 's' : ''} received after your opt-out reply`;
    },
  },
  volume_spike: {
    label:       'Email volume spike',
    icon:        <TrendingUp className="w-4 h-4" />,
    color:       'text-amber-600 dark:text-amber-400',
    border:      'border-amber-200 dark:border-amber-800',
    bg:          'bg-amber-50/60 dark:bg-amber-950/30',
    actionLabel: 'Unsubscribe',
    actionDesc:  'Remove this sender from your inbox',
    descFn: (a) => {
      const factor = a.metadata.spike_factor as number | null;
      const curr   = a.metadata.curr_count   as number;
      const prev   = a.metadata.prev_count   as number;
      if (factor && factor > 1) {
        return `${factor}× more emails than usual (${prev} → ${curr})`;
      }
      return `Email count jumped from ${prev} to ${curr}`;
    },
  },
  engagement_decay: {
    label:       'Engagement dropped',
    icon:        <ShieldAlert className="w-4 h-4" />,
    color:       'text-blue-600 dark:text-blue-400',
    border:      'border-blue-200 dark:border-blue-800',
    bg:          'bg-blue-50/60 dark:bg-blue-950/30',
    actionLabel: 'Hide sender',
    actionDesc:  'Mark as ignored so it stops affecting your score',
    descFn: (a) => {
      const prev = Math.round((a.metadata.prev_score as number) * 100);
      const curr = Math.round((a.metadata.curr_score as number) * 100);
      return `Engagement fell from ${prev}% to ${curr}%`;
    },
  },
};

const ALERT_ORDER: AlertType[] = ['post_unsubscribe', 'volume_spike', 'engagement_decay'];

// ── Single alert row ──────────────────────────────────────────────────────────

function AlertRow({ alert, onDismiss, onAction }: {
  alert:    InboxAlert;
  onDismiss: (id: string) => Promise<void>;
  onAction:  (id: string) => Promise<void>;
}) {
  const [pendingDismiss, startDismiss] = useTransition();
  const [pendingAction,  startAction]  = useTransition();
  const meta = ALERT_META[alert.alert_type];
  if (!meta) return null;

  const displayName = alert.sender_name || alert.sender_email;
  const description = meta.descFn(alert);

  return (
    <div className={cn('rounded-lg border p-4 flex items-start gap-3', meta.border, meta.bg)}>
      {/* Icon */}
      <span className={cn('shrink-0 mt-0.5', meta.color)}>{meta.icon}</span>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('text-xs font-semibold uppercase tracking-wide', meta.color)}>
            {meta.label}
          </span>
        </div>
        <p className="text-sm font-medium truncate">{displayName}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={pendingAction || pendingDismiss}
          onClick={() => startAction(() => onAction(alert.id))}
        >
          {pendingAction ? <Loader2 className="w-3 h-3 animate-spin" /> : (
            <>
              {meta.actionLabel}
              <ArrowRight className="w-3 h-3 ml-1" />
            </>
          )}
        </Button>

        <button
          className={cn('text-muted-foreground hover:text-foreground transition-colors', meta.color)}
          aria-label="Dismiss"
          disabled={pendingDismiss || pendingAction}
          onClick={() => startDismiss(() => onDismiss(alert.id))}
        >
          {pendingDismiss ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function InboxProtectionAlerts({ initialAlerts }: { initialAlerts: InboxAlert[] }) {
  const [alerts, setAlerts] = useState<InboxAlert[]>(initialAlerts);

  async function handleDismiss(id: string) {
    const { error } = await dismissProtectionAlert(id);
    if (error) { toast.error('Could not dismiss alert'); return; }
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleAction(id: string) {
    const { action, error } = await actionProtectionAlert(id);
    if (error) { toast.error('Could not complete action'); return; }
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    const label = action === 'unsubscribe_queued'
      ? 'Unsubscribe queued — will run with the next cleanup.'
      : action === 'sender_ignored'
        ? 'Sender hidden from your inbox.'
        : 'Action completed.';
    toast.success(label);
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
        <ShieldCheck className="w-12 h-12 text-green-500 opacity-80" />
        <p className="text-base font-medium">No active alerts</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Your inbox is clean. Alerts appear here when suspicious patterns are detected during analysis.
        </p>
      </div>
    );
  }

  // Group by type, in priority order
  const grouped = ALERT_ORDER.reduce<Record<string, InboxAlert[]>>((acc, type) => {
    const group = alerts.filter((a) => a.alert_type === type);
    if (group.length > 0) acc[type] = group;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Patterns detected during your last analysis.
        Take action or dismiss — alerts are refreshed automatically on each analysis run.
      </p>

      {Object.entries(grouped).map(([type, group]) => {
        const meta = ALERT_META[type as AlertType];
        return (
          <div key={type} className="space-y-2">
            <h4 className={cn('text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5', meta.color)}>
              {meta.icon} {meta.label} · {group.length}
            </h4>
            <div className="space-y-2">
              {group.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  onDismiss={handleDismiss}
                  onAction={handleAction}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
