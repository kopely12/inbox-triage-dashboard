'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

export type ResponseTimePoint = {
  label:    string;
  avgHours: number | null; // null = fewer than 2 replies that week
};

const chartConfig = {
  avgHours: { label: 'Avg response time', color: 'var(--chart-4)' },
} satisfies ChartConfig;

export function ResponseTimeChart({ data, p90 }: { data: ResponseTimePoint[]; p90?: number | null }) {
  const hasData = data.some((d) => d.avgHours !== null);

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-center px-6">
        <p className="text-sm font-medium text-foreground">No reply data yet</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Reply to at least 2 emails surfaced by triage in the same week — your average response time will appear here.
        </p>
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-52 w-full">
      <BarChart data={data} barGap={2}>
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
          width={40}
          tickFormatter={(v) => `${v}h`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => [`${Number(value).toFixed(1)}h`, 'Avg response time']}
            />
          }
        />
        <ReferenceLine
          y={24}
          stroke="var(--chart-3)"
          strokeDasharray="4 3"
          strokeWidth={1.5}
          label={{ value: '24h', position: 'insideTopRight', fontSize: 10, fill: 'var(--chart-3)' }}
        />
        {p90 != null && p90 < 168 && (
          <ReferenceLine
            y={p90}
            stroke="var(--chart-5)"
            strokeDasharray="3 3"
            strokeWidth={1.5}
            label={{ value: `P90 ${p90 < 24 ? `${p90.toFixed(0)}h` : `${(p90 / 24).toFixed(1)}d`}`, position: 'insideBottomRight', fontSize: 10, fill: 'var(--chart-5)' }}
          />
        )}
        <Bar dataKey="avgHours" fill="var(--color-avgHours)" radius={[3, 3, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartContainer>
  );
}
