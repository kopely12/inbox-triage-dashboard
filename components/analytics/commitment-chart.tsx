'use client';

import {
  Line, LineChart, CartesianGrid, XAxis, YAxis, Dot,
} from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';

export type CommitmentPoint = {
  label:    string;
  created:  number;
  resolved: number;
};

const chartConfig = {
  created:  { label: 'Created',  color: 'hsl(var(--chart-1))' },
  resolved: { label: 'Resolved', color: 'hsl(var(--chart-3))' },
} satisfies ChartConfig;

export function CommitmentChart({ data }: { data: CommitmentPoint[] }) {
  const isEmpty = data.every((d) => d.created === 0 && d.resolved === 0);

  if (isEmpty) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        No commitments tracked in the last 12 weeks.
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
          width={32}
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
  );
}
