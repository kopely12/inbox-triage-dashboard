'use client';

import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

export type NoiseTrendPoint = {
  date:       string;   // YYYY-MM-DD
  noiseScore: number;   // 0–25 (25 = no noise, 0 = max noise)
};

// Convert score (high = good) to noise% (high = bad) for intuitive display.
// noiseScore 25 → 0% noise, noiseScore 0 → 100% noise
function toNoisePct(score: number): number {
  return Math.round(((25 - score) / 25) * 100);
}

const chartConfig = {
  noise: { label: 'Inbox noise %', color: 'var(--chart-5)' },
} satisfies ChartConfig;

export function NoiseTrendChart({ data }: { data: NoiseTrendPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-center px-6">
        <p className="text-sm font-medium">Not enough history yet</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Run Inbox Cleaner to snapshot your noise level. A trend line appears after a few snapshots.
        </p>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    label: d.date.slice(5), // MM-DD
    noise: toNoisePct(d.noiseScore),
  }));

  const latest    = chartData[chartData.length - 1]?.noise ?? null;
  const earliest  = chartData[0]?.noise ?? null;
  const improved  = latest !== null && earliest !== null && latest < earliest;

  return (
    <div className="space-y-1">
      {latest !== null && (
        <p className="text-xs text-muted-foreground">
          Currently <span className="font-medium text-foreground">{latest}% noise</span>
          {improved && earliest !== null && (
            <span className="text-green-600 dark:text-green-400">
              {' '}· down {earliest - latest} pts since first snapshot
            </span>
          )}
        </p>
      )}
      <ChartContainer config={chartConfig} className="h-48 w-full">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="noiseGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="var(--chart-5)" stopOpacity={0.15} />
              <stop offset="95%" stopColor="var(--chart-5)" stopOpacity={0}    />
            </linearGradient>
          </defs>
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
                formatter={(value) => [`${Number(value).toFixed(0)}%`, 'Inbox noise']}
              />
            }
          />
          {/* Reference line at 33% — above this your score is dropping */}
          <ReferenceLine
            y={33}
            stroke="var(--chart-5)"
            strokeOpacity={0.35}
            strokeDasharray="4 3"
            strokeWidth={1}
            label={{ value: 'Score impact threshold', position: 'insideTopRight', fontSize: 10, fill: 'var(--muted-foreground)' }}
          />
          <Area
            dataKey="noise"
            stroke="var(--color-noise)"
            strokeWidth={2}
            fill="url(#noiseGradient)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">Lower is better — each Inbox Cleaner run updates this.</p>
    </div>
  );
}
