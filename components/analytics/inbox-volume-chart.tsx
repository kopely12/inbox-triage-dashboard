'use client';

import { useState, useTransition } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { getInboxVolume, type VolumeMonth } from '@/app/actions/engagement';

const receivedConfig = {
  primary:    { label: 'Personal',   color: 'var(--chart-1)' },
  social:     { label: 'Social',     color: 'var(--chart-2)' },
  promotions: { label: 'Promotions', color: 'var(--chart-3)' },
  updates:    { label: 'Updates',    color: 'var(--chart-4)' },
  forums:     { label: 'Forums',     color: 'var(--chart-5)' },
} satisfies ChartConfig;

const sentConfig = {
  sent: { label: 'Sent', color: 'hsl(var(--foreground) / 0.6)' },
} satisfies ChartConfig;

const SEGMENTS = ['primary', 'social', 'promotions', 'updates', 'forums'] as const;

type Granularity = 'monthly' | 'weekly';
type Layout      = 'stacked'  | 'grouped';

function ToggleBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        'px-2.5 py-1 text-xs font-medium rounded-md transition-colors ' +
        (active
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted')
      }
    >
      {children}
    </button>
  );
}

function tickFmt(v: number) {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
}

export function InboxVolumeChart({ data: initialData }: { data: VolumeMonth[] }) {
  const [granularity, setGranularity] = useState<Granularity>('monthly');
  const [layout,      setLayout]      = useState<Layout>('stacked');
  const [monthlyData] = useState<VolumeMonth[]>(initialData);
  const [weeklyData,  setWeeklyData]  = useState<VolumeMonth[] | null>(null);
  const [isPending,   startTransition] = useTransition();

  function handleGranularity(g: Granularity) {
    if (g === granularity) return;
    if (g === 'weekly' && !weeklyData) {
      startTransition(async () => {
        const d = await getInboxVolume('weekly');
        setWeeklyData(d);
        setGranularity('weekly');
      });
    } else {
      setGranularity(g);
    }
  }

  const data          = granularity === 'weekly' ? (weeklyData ?? []) : monthlyData;
  const complete      = data.filter((d) => !d.partial);
  const receivedTrend = complete.length >= 2 ? complete[complete.length - 1].total - complete[0].total : null;
  const sentTrend     = complete.length >= 2 ? complete[complete.length - 1].sent  - complete[0].sent  : null;
  const maxReceived   = Math.max(...data.map((d) => d.total), 1);
  const maxSent       = Math.max(...data.map((d) => d.sent),  1);
  const xInterval     = granularity === 'weekly' ? 2 : 0;
  const barSize       = layout === 'grouped' ? 8 : 36;

  const sharedXAxis = (
    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval={xInterval} />
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partialLabelFmt = ((label: any, payload: any[]) => {
    const isPartial = payload?.[0]?.payload?.partial;
    return isPartial ? `${String(label)} (so far)` : label;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  if (!data.length && !isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-center px-6">
        <p className="text-sm font-medium">No data available</p>
        <p className="text-xs text-muted-foreground max-w-xs">Could not load Gmail volume data. Try refreshing.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-lg border px-1 py-0.5">
          <ToggleBtn active={granularity === 'monthly'} onClick={() => handleGranularity('monthly')}>Monthly</ToggleBtn>
          <ToggleBtn active={granularity === 'weekly'}  onClick={() => handleGranularity('weekly')}>
            {isPending ? 'Loading…' : 'Weekly'}
          </ToggleBtn>
        </div>
        <div className="flex items-center gap-1 rounded-lg border px-1 py-0.5">
          <ToggleBtn active={layout === 'stacked'} onClick={() => setLayout('stacked')}>Stacked</ToggleBtn>
          <ToggleBtn active={layout === 'grouped'} onClick={() => setLayout('grouped')}>Side by side</ToggleBtn>
        </div>
      </div>

      {isPending ? (
        <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">Loading weekly data…</div>
      ) : (
        <>
          {/* ── Received ── */}
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <p className="text-xs font-medium">Received</p>
              {receivedTrend !== null && (
                <p className="text-xs text-muted-foreground">
                  <span className={receivedTrend <= 0 ? 'text-green-600 dark:text-green-400' : 'text-amber-600'}>
                    {receivedTrend <= 0 ? '▼' : '▲'} {Math.abs(receivedTrend).toLocaleString()}
                  </span>
                  {' '}vs {complete[0].month}
                </p>
              )}
            </div>
            <ChartContainer config={receivedConfig} className="h-44 w-full">
              <BarChart data={data} barSize={barSize} barCategoryGap="20%">
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                {sharedXAxis}
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={40}
                  domain={[0, Math.ceil(maxReceived * 1.15)]} tickFormatter={tickFmt} />
                <ChartTooltip content={
                  <ChartTooltipContent
                    formatter={(v, n) => [Number(v).toLocaleString(), receivedConfig[n as keyof typeof receivedConfig]?.label ?? n]}
                    labelFormatter={partialLabelFmt}
                  />
                } />
                <ChartLegend content={<ChartLegendContent />} />
                {SEGMENTS.map((seg, i) => (
                  <Bar key={seg} dataKey={seg} stackId={layout === 'stacked' ? 'a' : undefined}
                    fill={`var(--color-${seg})`}
                    radius={layout === 'stacked' ? (i === SEGMENTS.length - 1 ? [4,4,0,0] : [0,0,0,0]) : [3,3,0,0]}>
                    {data.map((entry, idx) => <Cell key={idx} fillOpacity={entry.partial ? 0.4 : 1} />)}
                  </Bar>
                ))}
              </BarChart>
            </ChartContainer>
          </div>

          {/* ── Sent ── */}
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <p className="text-xs font-medium">Sent</p>
              {sentTrend !== null && (
                <p className="text-xs text-muted-foreground">
                  <span className={sentTrend <= 0 ? 'text-green-600 dark:text-green-400' : 'text-amber-600'}>
                    {sentTrend <= 0 ? '▼' : '▲'} {Math.abs(sentTrend).toLocaleString()}
                  </span>
                  {' '}vs {complete[0].month}
                </p>
              )}
              {complete.length > 0 && complete[complete.length - 1].total > 0 && (
                <p className="text-xs text-muted-foreground ml-auto">
                  {Math.round((complete[complete.length - 1].sent / complete[complete.length - 1].total) * 100)}% send rate
                  <span className="text-muted-foreground/50"> (most recent complete period)</span>
                </p>
              )}
            </div>
            <ChartContainer config={sentConfig} className="h-32 w-full">
              <BarChart data={data} barSize={barSize} barCategoryGap="20%">
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                {sharedXAxis}
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={40}
                  domain={[0, Math.ceil(maxSent * 1.15)]} tickFormatter={tickFmt} />
                <ChartTooltip content={
                  <ChartTooltipContent
                    formatter={(v) => [Number(v).toLocaleString(), 'Sent']}
                    labelFormatter={partialLabelFmt}
                  />
                } />
                <Bar dataKey="sent" fill="var(--color-sent)" radius={[4,4,0,0]}>
                  {data.map((entry, idx) => <Cell key={idx} fillOpacity={entry.partial ? 0.4 : 1} />)}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Gmail API counts · Personal = total minus categorised · <span className="opacity-50">Faded</span> = current period (incomplete)
      </p>
    </div>
  );
}
