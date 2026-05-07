'use client';

import {
  Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer,
} from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';

export type ActivityPoint = {
  label:    string;
  sessions: number;
  scanned:  number;
  surfaced: number;
};

const chartConfig = {
  scanned:  { label: 'Emails scanned',  color: 'hsl(var(--chart-1))' },
  surfaced: { label: 'Emails surfaced', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  const isEmpty = data.every((d) => d.scanned === 0);

  if (isEmpty) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        No triage sessions in the last 12 weeks.
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
          width={32}
          allowDecimals={false}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="scanned"  fill="var(--color-scanned)"  radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Bar dataKey="surfaced" fill="var(--color-surfaced)" radius={[3, 3, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartContainer>
  );
}
