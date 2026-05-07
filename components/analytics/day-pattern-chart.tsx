'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

export type DayPoint = {
  day:      string; // 'Mon' … 'Sun'
  sessions: number;
};

const chartConfig = {
  sessions: { label: 'Triage sessions', color: 'var(--chart-1)' },
} satisfies ChartConfig;

export function DayPatternChart({ data }: { data: DayPoint[] }) {
  const isEmpty = data.every((d) => d.sessions === 0);

  if (isEmpty) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        No session data available for this range.
      </div>
    );
  }

  const maxSessions = Math.max(...data.map((d) => d.sessions));

  return (
    <ChartContainer config={chartConfig} className="h-52 w-full">
      <BarChart data={data} barCategoryGap="25%">
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="day"
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
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="sessions" radius={[4, 4, 0, 0]} maxBarSize={40}>
          {data.map((entry) => (
            <Cell
              key={entry.day}
              fill={
                entry.sessions === maxSessions
                  ? 'var(--chart-1)'      // highlight peak day
                  : 'color-mix(in oklch, var(--chart-1) 45%, transparent)'
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
