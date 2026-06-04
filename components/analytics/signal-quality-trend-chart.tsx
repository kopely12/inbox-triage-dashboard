'use client';

import { Line, LineChart, CartesianGrid, XAxis, YAxis, Legend } from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

export type SignalQualityPoint = {
  label:       string;
  replyRate:   number | null;   // % replied (0–100)
  dismissRate: number | null;   // % dismissed (0–100)
};

const chartConfig = {
  replyRate:   { label: 'Reply rate',   color: 'var(--chart-2)' },
  dismissRate: { label: 'Dismiss rate', color: 'var(--chart-5)' },
} satisfies ChartConfig;

export function SignalQualityTrendChart({ data }: { data: SignalQualityPoint[] }) {
  const hasData = data.some((d) => d.replyRate !== null || d.dismissRate !== null);

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-center px-6">
        <p className="text-sm font-medium">No signal data yet</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Once you start replying and dismissing triaged emails, the weekly trend will appear here.
        </p>
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
              formatter={(value, name) => [
                `${Number(value).toFixed(0)}%`,
                name === 'replyRate' ? 'Reply rate' : 'Dismiss rate',
              ]}
            />
          }
        />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => value === 'replyRate' ? 'Reply rate' : 'Dismiss rate'}
          wrapperStyle={{ fontSize: 11 }}
        />
        <Line
          dataKey="replyRate"
          stroke="var(--color-replyRate)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls={false}
        />
        <Line
          dataKey="dismissRate"
          stroke="var(--color-dismissRate)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls={false}
          strokeDasharray="4 3"
        />
      </LineChart>
    </ChartContainer>
  );
}
