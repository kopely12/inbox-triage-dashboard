'use client';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartErrorBoundary }                    from './chart-error-boundary';
import { ActionRateChart, type ActionBreakdown } from './action-rate-chart';

export interface TriageData {
  actionBreakdown: ActionBreakdown;
  p50Hours:        number | null;
  rangeLabel:      string;
}

function formatP50(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1)  return '< 1h';
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function p50Color(hours: number | null): string {
  if (hours === null) return '';
  if (hours <= 4)  return 'text-green-600 dark:text-green-400';
  if (hours <= 24) return 'text-amber-500';
  return 'text-red-500';
}

export function TriageTab({ data }: { data: TriageData }) {
  const { actionBreakdown, p50Hours, rangeLabel } = data;

  const total     = actionBreakdown.replied + actionBreakdown.snoozed
                  + actionBreakdown.dismissed + actionBreakdown.pending;
  const replyRate = total > 0 ? Math.round((actionBreakdown.replied / total) * 100) : null;

  return (
    <div className="space-y-5">

      {/* Stat row */}
      <div className="grid grid-cols-3 gap-4 pb-4 border-b border-border">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Emails replied</p>
          <p className="text-2xl font-semibold">{actionBreakdown.replied.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">{rangeLabel}</p>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Reply rate</p>
          <p className={cn(
            'text-2xl font-semibold',
            replyRate !== null && replyRate >= 40 ? 'text-green-600 dark:text-green-400'
              : replyRate !== null && replyRate >= 20 ? 'text-amber-500'
              : '',
          )}>
            {replyRate !== null ? `${replyRate}%` : '—'}
          </p>
          <p className="text-xs text-muted-foreground">
            {replyRate === null  ? 'no data yet'
              : replyRate >= 40  ? 'strong follow-through'
              : replyRate >= 20  ? 'room to improve'
              : 'low — worth reviewing'}
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Median response time</p>
          <p className={cn('text-2xl font-semibold', p50Color(p50Hours))}>
            {formatP50(p50Hours)}
          </p>
          <p className="text-xs text-muted-foreground">
            {p50Hours === null ? 'no data yet'
              : p50Hours <= 4  ? 'fast'
              : p50Hours <= 24 ? 'solid'
              : 'slower than target'}
          </p>
        </div>
      </div>

      {/* Action breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">How you handled prioritized emails</CardTitle>
          <CardDescription>
            What you did with emails flagged for your attention — {rangeLabel}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartErrorBoundary title="Action breakdown">
            <ActionRateChart data={actionBreakdown} />
          </ChartErrorBoundary>
        </CardContent>
      </Card>

    </div>
  );
}
