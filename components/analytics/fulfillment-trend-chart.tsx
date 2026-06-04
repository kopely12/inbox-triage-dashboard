'use client';

import { Line, LineChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import type { CommitmentPoint } from './commitment-chart';

const chartConfig = {
  rate: { label: 'Resolution rate', color: 'var(--chart-2)' },
} satisfies ChartConfig;

// Rolling window (weeks) to smooth noisy week-to-week variance.
const WINDOW = 4;

function rollingRate(data: CommitmentPoint[]): { label: string; rate: number | null }[] {
  return data.map((_, i) => {
    const slice = data.slice(Math.max(0, i - WINDOW + 1), i + 1);
    const created  = slice.reduce((s, d) => s + d.created,  0);
    const resolved = slice.reduce((s, d) => s + d.resolved, 0);
    return {
      label: data[i].label,
      rate:  created > 0 ? Math.round((resolved / created) * 100) : null,
    };
  });
}

export function FulfillmentTrendChart({ data }: { data: CommitmentPoint[] }) {
  const hasData = data.some((d) => d.created > 0 || d.resolved > 0);

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-center px-6">
        <p className="text-sm font-medium">No commitment data yet</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Once commitments are tracked and resolved, the fulfillment trend will appear here.
        </p>
      </div>
    );
  }

  const chartData    = rollingRate(data);
  const latestRate   = [...chartData].reverse().find((d) => d.rate !== null)?.rate ?? null;
  const isKeepingUp  = latestRate !== null && latestRate >= 100;

  return (
    <div className="space-y-1">
      {latestRate !== null && (
        <p className="text-xs text-muted-foreground">
          {WINDOW}-week rolling rate:{' '}
          <span className={cn('font-medium', isKeepingUp ? 'text-green-600 dark:text-green-400' : 'text-amber-600')}>
            {latestRate}%
          </span>
          {' '}
          <span className="text-muted-foreground">
            {isKeepingUp ? '— keeping up with your load' : '— commitments building up'}
          </span>
        </p>
      )}
      <ChartContainer config={chartConfig} className="h-48 w-full">
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
            width={36}
            tickFormatter={(v) => `${v}%`}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => [`${Number(value).toFixed(0)}%`, 'Resolution rate']}
              />
            }
          />
          {/* 100% line — above = clearing backlog, below = accumulating */}
          <ReferenceLine
            y={100}
            stroke="var(--chart-2)"
            strokeOpacity={0.4}
            strokeDasharray="4 3"
            strokeWidth={1.5}
            label={{ value: 'Keeping up', position: 'insideTopRight', fontSize: 10, fill: 'var(--muted-foreground)' }}
          />
          <Line
            dataKey="rate"
            stroke="var(--color-rate)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls={false}
          />
        </LineChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">
        Above 100% = clearing backlog · Below 100% = commitments accumulating · {WINDOW}-week rolling average
      </p>
    </div>
  );
}
