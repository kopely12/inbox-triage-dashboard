'use client';

import { cn } from '@/lib/utils';

export type ActionBreakdown = {
  replied:   number;
  snoozed:   number;
  dismissed: number;
  pending:   number;  // surfaced but no action recorded
};

type Bar = {
  key:   keyof ActionBreakdown;
  label: string;
  color: string;
  pct:   number;
  count: number;
};

function signalLabel(replyRate: number, dismissRate: number): {
  text: string;
  cls: string;
} {
  if (replyRate >= 40) return { text: 'Strong signal quality', cls: 'text-green-600 dark:text-green-400' };
  if (replyRate >= 20) return { text: 'Moderate signal quality', cls: 'text-amber-500' };
  if (dismissRate >= 60) return { text: 'High noise — tighten your sender rules', cls: 'text-red-500' };
  return { text: 'Building signal', cls: 'text-muted-foreground' };
}

export function ActionRateChart({ data }: { data: ActionBreakdown }) {
  const total = data.replied + data.snoozed + data.dismissed + data.pending;

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-36 gap-2 text-center px-6">
        <p className="text-sm font-medium text-foreground">No action data yet</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Once you start replying, snoozing, or dismissing triaged emails, the breakdown will appear here.
        </p>
      </div>
    );
  }

  const pct = (n: number) => Math.round((n / total) * 100);

  const allBars: Bar[] = [
    { key: 'replied',   label: 'Replied',   color: 'bg-chart-2',  pct: pct(data.replied),   count: data.replied   },
    { key: 'snoozed',   label: 'Snoozed',   color: 'bg-chart-1',  pct: pct(data.snoozed),   count: data.snoozed   },
    { key: 'dismissed', label: 'Dismissed', color: 'bg-amber-400', pct: pct(data.dismissed), count: data.dismissed },
    { key: 'pending',   label: 'No action', color: 'bg-muted',     pct: pct(data.pending),   count: data.pending   },
  ];
  const bars = allBars.filter((b) => b.count > 0);

  const replyRate   = pct(data.replied);
  const dismissRate = pct(data.dismissed);
  const signal      = signalLabel(replyRate, dismissRate);

  return (
    <div className="space-y-3">
      {/* Stacked bar */}
      <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
        {bars.map((b) => (
          <div
            key={b.key}
            className={cn(b.color, 'transition-all')}
            style={{ width: `${b.pct}%` }}
            title={`${b.label}: ${b.count} (${b.pct}%)`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {bars.map((b) => (
          <div key={b.key} className="flex items-center gap-2 min-w-0">
            <span className={cn('w-2.5 h-2.5 rounded-sm shrink-0', b.color)} />
            <span className="text-xs text-muted-foreground truncate">{b.label}</span>
            <span className="text-xs font-medium ml-auto tabular-nums">{b.pct}%</span>
          </div>
        ))}
      </div>

      {/* Signal quality line */}
      <p className={cn('text-xs font-medium pt-1 border-t border-border', signal.cls)}>
        {signal.text} — {replyRate}% reply rate across {total} surfaced emails
      </p>
    </div>
  );
}
