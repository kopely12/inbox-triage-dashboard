'use client';

import { useState }   from 'react';
import { cn }         from '@/lib/utils';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { ChartErrorBoundary }                       from './chart-error-boundary';
import { CommitmentsPanel }                         from './commitments-panel';
import { CommitmentAgeChart, type AgeBucket }       from './commitment-age-chart';
import { SenderTable,        type SenderRow }       from './sender-table';
import type { CommitmentPoint }                     from './commitment-chart';

export interface CommitmentDataset {
  chartData:         CommitmentPoint[];
  keptRate:          number | null;
  overdueCount:      number;
  openCount:         number;
  thisWeekCreated:   number;
  lastWeekCreated:   number;
  avgResolutionDays: number | null;
  fulfillmentTrend:  number | null;
  ageBuckets:        AgeBucket[];
  avgAgeDays:        number | null;
  topCounterparties: SenderRow[];
  rangeLabel:        string;
}

export function CommitmentsSection({
  outgoing,
  assigned,
}: {
  outgoing: CommitmentDataset;
  assigned: CommitmentDataset;
}) {
  const [dir, setDir] = useState<'outgoing' | 'assigned'>('outgoing');
  const data = dir === 'outgoing' ? outgoing : assigned;

  return (
    <div className="space-y-5">
      {/* Section header with toggle */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">
            {dir === 'outgoing' ? 'My Promises' : 'Assigned to Me'}
          </p>
          <div className="flex gap-1 shrink-0 p-1 rounded-lg bg-muted">
            {(['outgoing', 'assigned'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDir(d)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  dir === d
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {d === 'outgoing' ? 'My Promises' : 'Assigned to Me'}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {dir === 'outgoing'
            ? 'Fulfillment rate, backlog health, and weekly created vs. resolved'
            : 'Tasks assigned by others — completion rate and backlog health'}
          {' — '}{data.rangeLabel}.
        </p>
      </div>

      {/* Accountability panel */}
      <Card>
        <CardContent className="pt-5">
          <ChartErrorBoundary title="Commitment accountability">
            <CommitmentsPanel
              chartData={data.chartData}
              keptRate={data.keptRate}
              overdueCount={data.overdueCount}
              openCount={data.openCount}
              fulfillmentTrend={data.fulfillmentTrend}
              rangeLabel={data.rangeLabel}
            />
          </ChartErrorBoundary>
        </CardContent>
      </Card>

      {/* Age + counterparties */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Open commitment ages</CardTitle>
            <CardDescription>
              How old your unresolved {dir === 'outgoing' ? 'promises' : 'tasks'} are.
              Older = higher risk of being forgotten. Shows all open items, regardless of the date range above.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartErrorBoundary title="Commitment age distribution">
              <CommitmentAgeChart
                buckets={data.ageBuckets}
                totalOpen={data.openCount}
                avgAgeDays={data.avgAgeDays}
              />
            </ChartErrorBoundary>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {dir === 'outgoing' ? 'Top counterparties' : 'Top assigners'}
            </CardTitle>
            <CardDescription>
              {dir === 'outgoing'
                ? "People you've made the most commitments to"
                : "People who've assigned you the most tasks"}
              {' — '}{data.rangeLabel}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartErrorBoundary title="Top counterparties">
              <SenderTable senders={data.topCounterparties} />
            </ChartErrorBoundary>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
