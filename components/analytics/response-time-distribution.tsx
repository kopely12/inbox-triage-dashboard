'use client';

import { Bar, BarChart, Cell, XAxis, YAxis } from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

export type RtBucket = { label: string; count: number };

const chartConfig = {
  count: { label: 'Replies', color: 'var(--chart-1)' },
} satisfies ChartConfig;

// Cooler → warmer as response time grows
const BUCKET_COLORS = [
  'var(--chart-2)', // <1h
  'var(--chart-2)', // 1–4h
  'var(--chart-3)', // 4–12h
  'var(--chart-3)', // 12–24h
  'var(--chart-4)', // 1–2d
  'var(--chart-5)', // >2d
];

function formatHours(h: number): string {
  if (h < 1)  return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h % 1 === 0 ? h : h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export function ResponseTimeDistribution({
  buckets,
  totalReplies,
  p50,
  p90,
}: {
  buckets:      RtBucket[];
  totalReplies: number;
  p50:          number | null;
  p90:          number | null;
}) {
  if (totalReplies === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-center px-6">
        <p className="text-sm font-medium text-foreground">No reply distribution yet</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Reply to emails surfaced by triage to see how your response times are distributed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Percentile pills */}
      <div className="flex items-center gap-4 text-xs">
        {p50 !== null && (
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-chart-2 shrink-0" />
            <span className="text-muted-foreground">P50</span>
            <span className="font-semibold tabular-nums">{formatHours(p50)}</span>
          </div>
        )}
        {p90 !== null && (
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-chart-5 shrink-0" />
            <span className="text-muted-foreground">P90</span>
            <span className="font-semibold tabular-nums">{formatHours(p90)}</span>
          </div>
        )}
        <span className="ml-auto text-muted-foreground">{totalReplies} {totalReplies === 1 ? 'reply' : 'replies'}</span>
      </div>

      <ChartContainer config={chartConfig} className="h-44 w-full">
        <BarChart data={buckets} barGap={2}>
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
                formatter={(value) => [`${value}`, 'Replies']}
              />
            }
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={48}>
            {buckets.map((_, i) => (
              <Cell key={i} fill={BUCKET_COLORS[i] ?? 'var(--chart-1)'} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
