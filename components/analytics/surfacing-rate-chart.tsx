'use client';

import { Line, LineChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

export type SurfacingPoint = {
  label: string;
  rate:  number | null; // 0–100, null = no data that week
};

const chartConfig = {
  rate: { label: 'Surfacing rate %', color: 'var(--chart-2)' },
} satisfies ChartConfig;

export function SurfacingRateChart({ data, avgRate }: { data: SurfacingPoint[]; avgRate: number | null }) {
  const hasData = data.some((d) => d.rate !== null);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        Not enough triage data to compute surfacing rate.
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-52 w-full">
      <LineChart data={data}>
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
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Surfacing rate']}
            />
          }
        />
        {avgRate !== null && (
          <ReferenceLine
            y={avgRate}
            stroke="var(--chart-3)"
            strokeDasharray="4 3"
            strokeWidth={1.5}
            label={{ value: `Avg ${avgRate.toFixed(1)}%`, position: 'insideTopRight', fontSize: 10, fill: 'var(--chart-3)' }}
          />
        )}
        <Line
          dataKey="rate"
          stroke="var(--color-rate)"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
          connectNulls={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
