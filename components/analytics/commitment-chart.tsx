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
  created:  { label: 'Created',  color: 'var(--chart-3)' },
  resolved: { label: 'Resolved', color: 'var(--chart-2)' },
} satisfies ChartConfig;

export function CommitmentChart({ data }: { data: CommitmentPoint[] }) {
  const isEmpty = data.every((d) => d.created === 0 && d.resolved === 0);

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-center px-6">
        <p className="text-sm font-medium text-foreground">No commitments tracked yet</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          The extension automatically detects promises you make in emails — run a triage and they&apos;ll appear here once found.
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
