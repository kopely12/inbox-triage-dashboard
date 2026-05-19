'use client';

import { cn } from '@/lib/utils';
import {
  Line, LineChart, CartesianGrid, XAxis, YAxis, Dot, ReferenceLine,
} from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { CommitmentPoint } from './commitment-chart';

const chartConfig = {
  created:  { label: 'Created',  color: 'var(--chart-3)' },
  resolved: { label: 'Resolved', color: 'var(--chart-2)' },
} satisfies ChartConfig;

export function CommitmentsPanel({
  chartData,
  keptRate,
  overdueCount,
  openCount,
  avgCompletionRate,
  rangeLabel,
  thisWeekCreated,
  lastWeekCreated,
}: {
  chartData:         CommitmentPoint[];
  keptRate:          number | null;
  overdueCount:      number;
  openCount:         number;
  avgCompletionRate: number | null;
  rangeLabel:        string;
  thisWeekCreated:   number;
  lastWeekCreated:   number;
}) {
  const isEmpty = chartData.every((d) => d.created === 0 && d.resolved === 0);

  const wowPct =
    lastWeekCreated > 0
      ? Math.round(((thisWeekCreated - lastWeekCreated) / lastWeekCreated) * 100)
      : null;

  return (
    <div className="space-y-5">
      {/* ── Stat row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4 pb-4 border-b border-border">

        {/* Promises kept */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Promises kept</p>
          {keptRate !== null ? (
            <>
              <p className={cn(
                'text-2xl font-semibold',
                keptRate >= 80 ? 'text-green-600 dark:text-green-400'
                  : keptRate >= 50 ? 'text-amber-500'
                  : 'text-red-500',
              )}>
                {keptRate}%
              </p>
              <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full', keptRate >= 80 ? 'bg-green-500' : keptRate >= 50 ? 'bg-amber-500' : 'bg-red-500')}
                  style={{ width: `${keptRate}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {keptRate >= 80 ? 'Great track record' : keptRate >= 50 ? 'Room to improve' : 'Needs attention'}
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-semibold text-muted-foreground">—</p>
              <p className="text-xs text-muted-foreground">Need 5+ commitments</p>
            </>
          )}
        </div>

        {/* Avg weekly completion */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Avg weekly rate</p>
          <p className="text-2xl font-semibold">
            {avgCompletionRate !== null ? `${avgCompletionRate}%` : '—'}
          </p>
          <p className="text-xs text-muted-foreground">resolved per week</p>
        </div>

        {/* Open */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Still open</p>
          <p className={cn('text-2xl font-semibold', openCount > 0 && overdueCount > 0 ? 'text-amber-500' : '')}>
            {openCount}
          </p>
          <p className="text-xs text-muted-foreground">
            {overdueCount > 0 ? (
              <span className="text-red-500">{overdueCount} overdue</span>
            ) : 'all on track'}
          </p>
        </div>

        {/* New this week */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Made this week</p>
          <p className="text-2xl font-semibold">{thisWeekCreated}</p>
          <p className="text-xs text-muted-foreground">
            {wowPct !== null ? (
              <span className={wowPct < 0 ? 'text-green-600 dark:text-green-400' : ''}>
                {wowPct > 0 ? '+' : ''}{wowPct}% vs last week
              </span>
            ) : (
              `vs ${lastWeekCreated} last week`
            )}
          </p>
        </div>
      </div>

      {/* ── Created vs resolved chart ──────────────────────────────────── */}
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-6">
          <p className="text-sm font-medium text-foreground">No commitments tracked yet</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            The extension detects promises you make in emails — run a triage and they'll appear here.
          </p>
        </div>
      ) : (
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            Commitments created vs. resolved per week — {rangeLabel}.
            {avgCompletionRate !== null && (
              <span className="ml-1 font-medium text-foreground">Avg {avgCompletionRate}% resolved</span>
            )}
          </p>
          <ChartContainer config={chartConfig} className="h-44 w-full">
            <LineChart data={chartData}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                width={28}
                allowDecimals={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                dataKey="created"
                stroke="var(--color-created)"
                strokeWidth={2}
                dot={<Dot r={3} />}
                activeDot={{ r: 5 }}
              />
              <Line
                dataKey="resolved"
                stroke="var(--color-resolved)"
                strokeWidth={2}
                dot={<Dot r={3} />}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ChartContainer>
        </div>
      )}
    </div>
  );
}
