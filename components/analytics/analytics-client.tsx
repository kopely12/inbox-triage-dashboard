'use client';

import { useState } from 'react';
import { Inbox, Mail, CheckSquare, TrendingUp, Download } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartErrorBoundary }        from './chart-error-boundary';
import { ActivityChart }             from './activity-chart';
import { HabitHeatmap }              from './habit-heatmap';
import { InsightsStrip }             from './insights-strip';
import { RangeToggle }               from './range-toggle';
import { ResponseTimeDistribution }  from './response-time-distribution';
import { CommitmentsSection }        from './commitments-section';
import { SignalQualityTrendChart }   from './signal-quality-trend-chart';
import { NoiseTrendChart }           from './noise-trend-chart';
import { FulfillmentTrendChart }     from './fulfillment-trend-chart';
import type { Range }                from './range-toggle';
import type { Insight }              from './insights-strip';
import type { ActivityPoint }        from './activity-chart';
import type { HeatmapDay }           from './habit-heatmap';
import type { RtBucket }             from './response-time-distribution';
import type { CommitmentDataset }    from './commitments-section';
import type { SignalQualityPoint }   from './signal-quality-trend-chart';
import type { NoiseTrendPoint }      from './noise-trend-chart';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'triage' | 'communication' | 'commitments';

export interface AnalyticsSummary {
  triagesInRange:   number;
  allTimeTriages:   number;
  scannedInRange:   number;
  surfacedInRange:  number;
  outgoingResolved: number;
  outgoingTotal:    number;
  outgoingOpenCount: number;
  fulfillmentPct:   number | null;
  wow: {
    thisTriages:  number; lastTriages:  number;
    thisScanned:  number; lastScanned:  number;
    thisResolved: number; lastResolved: number;
  };
}

interface Props {
  validRange:          Range;
  rangeLabel:          string;
  summary:             AnalyticsSummary;
  insights:            Insight[];
  // Triage tab
  heatmapDays:         HeatmapDay[];
  heatmapTotal:        number;
  activityData:        ActivityPoint[];
  signalQualityData:   SignalQualityPoint[];
  noiseTrendData:      NoiseTrendPoint[];
  // Communication tab
  rtBuckets:           RtBucket[];
  totalReplies:        number;
  p50:                 number | null;
  p90:                 number | null;
  // Commitments tab
  outgoingDataset:     CommitmentDataset;
  assignedDataset:     CommitmentDataset;
}

// ── Tile row ──────────────────────────────────────────────────────────────────

const TILE_ICONS = {
  inbox:     Inbox,
  mail:      Mail,
  check:     CheckSquare,
  trending:  TrendingUp,
} as const;

type TileIconKey = keyof typeof TILE_ICONS;

interface TileData {
  label:   string;
  value:   string;
  sub:     string;
  iconKey: TileIconKey;
  wow:     { cur: number; prev: number } | null;
}

function buildTiles(s: AnalyticsSummary): TileData[] {
  return [
    {
      label:   'Triages',
      value:   s.triagesInRange.toLocaleString(),
      sub:     `${s.allTimeTriages.toLocaleString()} all time`,
      iconKey: 'inbox',
      wow:     { cur: s.wow.thisTriages, prev: s.wow.lastTriages },
    },
    {
      label:   'Emails scanned',
      value:   s.scannedInRange.toLocaleString(),
      sub:     `${s.surfacedInRange.toLocaleString()} surfaced`,
      iconKey: 'mail',
      wow:     { cur: s.wow.thisScanned, prev: s.wow.lastScanned },
    },
    {
      label:   'Commitments resolved',
      value:   s.outgoingResolved.toLocaleString(),
      sub:     `${s.outgoingOpenCount} still open`,
      iconKey: 'check',
      wow:     { cur: s.wow.thisResolved, prev: s.wow.lastResolved },
    },
    {
      label:   'Fulfillment rate',
      value:   s.fulfillmentPct !== null
        ? `${s.fulfillmentPct}%`
        : s.outgoingTotal > 0 ? `${s.outgoingResolved}/${s.outgoingTotal}` : '—',
      sub:     s.fulfillmentPct !== null
        ? `${s.outgoingResolved} of ${s.outgoingTotal} resolved`
        : s.outgoingTotal === 0 ? 'No commitments' : 'Need 5+ to show %',
      iconKey: 'trending',
      wow:     null,
    },
  ];
}

// ── Main component ────────────────────────────────────────────────────────────

export function AnalyticsClient({
  validRange, rangeLabel, summary, insights,
  heatmapDays, heatmapTotal, activityData,
  signalQualityData, noiseTrendData,
  rtBuckets, totalReplies, p50, p90,
  outgoingDataset, assignedDataset,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('triage');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'triage',        label: 'Triage Activity' },
    { id: 'communication', label: 'Communication'   },
    { id: 'commitments',   label: 'Commitments'     },
  ];

  const tiles = buildTiles(summary);

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Analytics</h2>
          <p className="text-sm text-muted-foreground">
            {rangeLabel} — triage, communication, and commitment data.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <Link href={`/api/analytics/export?range=${validRange}`}>
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </Link>
          </Button>
          <RangeToggle current={validRange} />
        </div>
      </div>

      {/* ── Insights strip ── */}
      <InsightsStrip insights={insights} />

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(({ label, value, sub, iconKey, wow }) => {
          const Icon = TILE_ICONS[iconKey];
          const pct  = wow && wow.prev > 0
            ? Math.round(((wow.cur - wow.prev) / wow.prev) * 100)
            : null;
          return (
            <Card key={label}>
              <CardContent className="pt-5">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted shrink-0">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground leading-tight">{label}</p>
                    <p className="text-xl font-semibold mt-1 leading-none">{value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{sub}</p>
                    {pct !== null && (
                      <p className={cn('text-xs mt-0.5 font-medium', pct >= 0 ? 'text-green-600' : 'text-red-500')}>
                        {pct > 0 ? '+' : ''}{pct}% this week
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Tab bar ── */}
      <div className="flex items-center border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="space-y-5">

        {/* Triage Activity */}
        {activeTab === 'triage' && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Triage habit</CardTitle>
                <CardDescription>
                  Daily triage sessions over the last 52 weeks — fixed window, independent of the range toggle above.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartErrorBoundary title="Habit heatmap">
                  <HabitHeatmap days={heatmapDays} totalTriages={heatmapTotal} />
                </ChartErrorBoundary>
              </CardContent>
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Email activity</CardTitle>
                  <CardDescription>Emails scanned and surfaced per week — {rangeLabel}.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartErrorBoundary title="Email activity">
                    <ActivityChart data={activityData} />
                  </ChartErrorBoundary>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Signal quality trend</CardTitle>
                  <CardDescription>
                    Weekly reply vs. dismiss rate — a rising reply rate means the AI is surfacing better signal.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartErrorBoundary title="Signal quality trend">
                    <SignalQualityTrendChart data={signalQualityData} />
                  </ChartErrorBoundary>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Inbox noise trend</CardTitle>
                <CardDescription>
                  % of senders classified as noise over time — lower is better.
                  Drops when you take action in Inbox Cleaner.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartErrorBoundary title="Inbox noise trend">
                  <NoiseTrendChart data={noiseTrendData} />
                </ChartErrorBoundary>
              </CardContent>
            </Card>
          </>
        )}

        {/* Communication */}
        {activeTab === 'communication' && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Reply speed</CardTitle>
              <CardDescription>
                Time from email being surfaced to reply — {rangeLabel}.
                Based on replies recorded in the extension sidebar only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartErrorBoundary title="Reply speed">
                <ResponseTimeDistribution
                  buckets={rtBuckets}
                  totalReplies={totalReplies}
                  p50={p50}
                  p90={p90}
                />
              </ChartErrorBoundary>
            </CardContent>
          </Card>
        )}

        {/* Commitments */}
        {activeTab === 'commitments' && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Resolution throughput</CardTitle>
                <CardDescription>
                  Are you resolving commitments as fast as you create them?
                  Above 100% means you&apos;re clearing your backlog.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartErrorBoundary title="Resolution throughput">
                  <FulfillmentTrendChart data={outgoingDataset.chartData} />
                </ChartErrorBoundary>
              </CardContent>
            </Card>
            <CommitmentsSection outgoing={outgoingDataset} assigned={assignedDataset} />
          </>
        )}

      </div>
    </div>
  );
}
