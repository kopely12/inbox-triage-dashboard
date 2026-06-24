'use client';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartErrorBoundary } from './chart-error-boundary';
import { NoiseTrendChart, type NoiseTrendPoint } from './noise-trend-chart';
import { InboxVolumeChart } from './inbox-volume-chart';
import { Trash2, MailX } from 'lucide-react';
import type { VolumeMonth } from '@/app/actions/engagement';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InboxHealthData {
  cleanedCount:             number;   // senders unsubscribed or auto-archived
  unsubscribedCount:        number;   // strictly unsubscribed
  emailsPerMonthEliminated: number;   // estimated monthly volume removed
  currentNoisePct:          number | null;
  noisePctChange:           number | null;  // pts since earliest snapshot
  noiseTrendData:           NoiseTrendPoint[];
  volumeData:               VolumeMonth[];
  rangeLabel:               string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────


// ── KPI Tile ──────────────────────────────────────────────────────────────────

function KpiTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon:   React.ElementType;
  label:  string;
  value:  string;
  sub:    string;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted shrink-0">
            <Icon className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground leading-tight">{label}</p>
            <p className="text-xl font-semibold mt-1 leading-none">{value}</p>
            <p className={cn('text-xs mt-1', accent ?? 'text-muted-foreground')}>{sub}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

export function InboxHealthTab({ data }: { data: InboxHealthData }) {
  const {
    cleanedCount, unsubscribedCount,
    emailsPerMonthEliminated,
    currentNoisePct, noisePctChange,
    noiseTrendData, volumeData, rangeLabel,
  } = data;

  return (
    <div className="space-y-5">

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiTile
          icon={MailX}
          label="Senders cleaned up"
          value={cleanedCount.toLocaleString()}
          sub={unsubscribedCount > 0
            ? `${unsubscribedCount} unsubscribed`
            : 'Unsubscribe in Inbox Cleaner'}
          accent={cleanedCount > 0 ? 'text-green-600' : undefined}
        />

        <KpiTile
          icon={Trash2}
          label="Emails/month eliminated"
          value={emailsPerMonthEliminated > 0
            ? emailsPerMonthEliminated.toLocaleString()
            : '—'}
          sub={emailsPerMonthEliminated > 0
            ? 'no longer hitting your inbox'
            : 'Clean up senders to see impact'}
        />
      </div>

      {/* ── Noise trend ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Inbox noise over time</CardTitle>
          <CardDescription>
            % of senders classified as noise — lower is better.
            {currentNoisePct !== null && noisePctChange !== null && noisePctChange < 0 && (
              <span className="text-green-600 dark:text-green-400">
                {' '}Down {Math.abs(noisePctChange)} pts since you started cleaning.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartErrorBoundary title="Inbox noise trend">
            <NoiseTrendChart data={noiseTrendData} />
          </ChartErrorBoundary>
        </CardContent>
      </Card>

      {/* ── Inbox volume trend ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Inbox volume — {rangeLabel}</CardTitle>
          <CardDescription>
            Email volume by category. If Triago is working, total volume should trend down.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartErrorBoundary title="Inbox volume">
            <InboxVolumeChart data={volumeData} />
          </ChartErrorBoundary>
        </CardContent>
      </Card>

    </div>
  );
}
