'use client';

import {
  Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell,
} from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

export type AgeBucket = {
  label:     string;
  count:     number;
  isOverdue: boolean;
};

const chartConfig = {
  count: { label: 'Open commitments', color: 'var(--chart-2)' },
} satisfies ChartConfig;

export function CommitmentAgeChart({
  buckets,
  totalOpen,
  avgAgeDays,
}: {
  buckets:    AgeBucket[];
  totalOpen:  number;
  avgAgeDays: number | null;
}) {
  const isEmpty = totalOpen === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-6">
        <p className="text-sm font-medium text-foreground">No open commitments</p>
        <p className="text-xs text-muted-foreground">All caught up — commitments you make will age here until resolved.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {avgAgeDays !== null && (
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums">{Math.round(avgAgeDays)}d</span>
          <span className="text-xs text-muted-foreground">avg age · {totalOpen} open</span>
        </div>
      )}
      <ChartContainer config={chartConfig} className="h-36 w-full">
        <BarChart data={buckets} barGap={2}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            width={28}
            allowDecimals={false}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, _name, item) => [
                  `${value} commitment${Number(value) !== 1 ? 's' : ''}`,
                  item.payload?.isOverdue ? '⚠ Overdue' : 'Open',
                ]}
              />
            }
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={40}>
            {buckets.map((b, i) => (
              <Cell
                key={i}
                fill={b.isOverdue ? 'var(--chart-destructive, hsl(0 72% 51%))' : 'var(--chart-2)'}
                opacity={b.isOverdue ? 0.9 : 0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">
        Red bars are commitments older than 14 days — your overdue threshold.
      </p>
    </div>
  );
}
