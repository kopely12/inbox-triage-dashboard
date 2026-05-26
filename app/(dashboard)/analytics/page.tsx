import { auth }         from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { redirect }      from 'next/navigation';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';

import { ActivityChart,            type ActivityPoint }           from '@/components/analytics/activity-chart';
import { CommitmentAgeChart,       type AgeBucket }               from '@/components/analytics/commitment-age-chart';
import { CommitmentsSection,       type CommitmentDataset }       from '@/components/analytics/commitments-section';
import { HabitHeatmap,             type HeatmapDay }              from '@/components/analytics/habit-heatmap';
import { InsightsStrip,            buildInsights }                from '@/components/analytics/insights-strip';
import { RangeToggle,              type Range }                    from '@/components/analytics/range-toggle';
import { ResponseTimeDistribution, type RtBucket }                from '@/components/analytics/response-time-distribution';
import { SenderTable,              type SenderRow }               from '@/components/analytics/sender-table';
import { SurfacingRateChart,       type SurfacingPoint }          from '@/components/analytics/surfacing-rate-chart';
import { ActionRateChart,          type ActionBreakdown }         from '@/components/analytics/action-rate-chart';
import { ChartErrorBoundary }                                      from '@/components/analytics/chart-error-boundary';
import type { CommitmentPoint }                                    from '@/components/analytics/commitment-chart';

import { Inbox, Mail, CheckSquare, TrendingUp, Download } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Analytics — Inbox Triage' };

// ─── helpers ──────────────────────────────────────────────────────────────────

function toMondayKey(dateStr: string): string {
  const d = new Date(dateStr);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

function buildWeeks(n: number): { key: string; label: string }[] {
  const result: { key: string; label: string }[] = [];
  const now = new Date();
  const dow = now.getUTCDay();
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  monday.setUTCHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() - i * 7);
    result.push({
      key:   d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    });
  }
  return result;
}

function percentile(sorted: number[], frac: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(Math.floor(sorted.length * frac), sorted.length - 1)];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const safe = <T,>(p: any, fallback: T): Promise<{ data: T | null; error: unknown; count?: number | null }> =>
  Promise.resolve(p).catch(() => ({ data: fallback, error: null, count: null }));

// ─── commitment dataset builder ───────────────────────────────────────────────

function computeCommitmentDataset(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inRange:    any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openAll:    any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  senderRaw:  any[],
  weeks:            { key: string; label: string }[],
  thisWeekStartISO: string,
  lastWeekStartISO: string,
  lastWeekEndISO:   string,
  midPointISO:      string,
  todayISO:         string,
  rangeLabel:       string,
): CommitmentDataset {
  const nowMs = Date.now();

  // Weekly chart
  const commitmentMap = new Map(weeks.map(({ key }) => [key, { created: 0, resolved: 0 }]));
  inRange.forEach((c) => {
    const cb = commitmentMap.get(toMondayKey(c.scanned_at));
    if (cb) cb.created += 1;
    if (c.status === 'done' && c.resolved_at) {
      const rb = commitmentMap.get(toMondayKey(c.resolved_at));
      if (rb) rb.resolved += 1;
    }
  });
  const chartData: CommitmentPoint[] = weeks.map(({ key, label }) => ({ label, ...commitmentMap.get(key)! }));

  // Fulfillment
  const resolvedInRange = inRange.filter((c) => c.status === 'done').length;
  const keptRate = inRange.length >= 5
    ? Math.round((resolvedInRange / inRange.length) * 100)
    : null;

  // Trend: recent half vs prior half
  const priorHalf  = inRange.filter((c) => c.scanned_at <  midPointISO);
  const recentHalf = inRange.filter((c) => c.scanned_at >= midPointISO);
  const priorRate  = priorHalf.length  >= 3 ? Math.round((priorHalf.filter((c)  => c.status === 'done').length / priorHalf.length)  * 100) : null;
  const recentRate = recentHalf.length >= 3 ? Math.round((recentHalf.filter((c) => c.status === 'done').length / recentHalf.length) * 100) : null;
  const fulfillmentTrend = (priorRate !== null && recentRate !== null) ? (recentRate - priorRate) : null;

  // Open + overdue (from all-open dataset)
  const openCount    = openAll.length;
  const overdueCount = openAll.filter((c) => c.due_date && c.due_date < todayISO).length;

  // Avg resolution days
  const resolutionDaysArr = inRange
    .filter((c) => c.status === 'done' && c.resolved_at && c.scanned_at)
    .map((c) => (new Date(c.resolved_at).getTime() - new Date(c.scanned_at).getTime()) / 86_400_000);
  const avgResolutionDays = resolutionDaysArr.length > 0
    ? resolutionDaysArr.reduce((a, b) => a + b, 0) / resolutionDaysArr.length
    : null;

  // WoW created
  const thisWeekCreated = inRange.filter((c) => c.scanned_at >= thisWeekStartISO).length;
  const lastWeekCreated = inRange.filter((c) => c.scanned_at >= lastWeekStartISO && c.scanned_at <= lastWeekEndISO).length;

  // Age distribution
  const AGE_BUCKETS_DEF = [
    { label: '0–3d',   min: 0,  max: 3,        isOverdue: false },
    { label: '4–7d',   min: 4,  max: 7,        isOverdue: false },
    { label: '8–14d',  min: 8,  max: 14,       isOverdue: false },
    { label: '15–30d', min: 15, max: 30,       isOverdue: true  },
    { label: '1–2mo',  min: 31, max: 60,       isOverdue: true  },
    { label: '60d+',   min: 61, max: Infinity, isOverdue: true  },
  ];
  const ageBucketsInternal = AGE_BUCKETS_DEF.map((def) => ({ ...def, count: 0 }));
  let totalAgeMs = 0;
  openAll.forEach((c) => {
    const ageDays = Math.floor((nowMs - new Date(c.scanned_at).getTime()) / 86_400_000);
    totalAgeMs += ageDays;
    const bucket = ageBucketsInternal.find((b) => ageDays >= b.min && ageDays <= b.max);
    if (bucket) bucket.count += 1;
  });
  const ageBuckets: AgeBucket[] = ageBucketsInternal.map(({ label, count, isOverdue }) => ({ label, count, isOverdue }));
  const avgAgeDays = openAll.length > 0 ? totalAgeMs / openAll.length : null;

  // Top counterparties
  const senderMapInternal = new Map<string, {
    email: string; name: string | null;
    open: number; done: number; openFirst: number; openSecond: number;
    lastDate: string | null; hasOverdue: boolean;
  }>();
  senderRaw.forEach((c) => {
    const email = (c.counterparty_email || '').toLowerCase().trim();
    if (!email) return;
    if (!senderMapInternal.has(email)) {
      senderMapInternal.set(email, {
        email, name: c.counterparty || null,
        open: 0, done: 0, openFirst: 0, openSecond: 0,
        lastDate: null, hasOverdue: false,
      });
    }
    const row = senderMapInternal.get(email)!;
    if (c.status === 'open') {
      row.open += 1;
      if (c.scanned_at < midPointISO) row.openFirst += 1;
      else                            row.openSecond += 1;
      if (c.due_date && c.due_date < todayISO) row.hasOverdue = true;
    }
    if (c.status === 'done') row.done += 1;
    if (!row.lastDate || c.scanned_at > row.lastDate) row.lastDate = c.scanned_at;
  });
  const topCounterparties: SenderRow[] = [...senderMapInternal.values()]
    .sort((a, b) => (b.open + b.done) - (a.open + a.done))
    .slice(0, 10)
    .map((row) => {
      const total     = row.open + row.done;
      const openRatio = total > 0 ? row.open / total : 0;
      const health: SenderRow['health'] =
        row.hasOverdue                     ? 'red'    :
        openRatio > 0.5 || row.open >= 5  ? 'yellow' :
        'green';
      const trend: SenderRow['trend'] =
        row.openSecond > row.openFirst + 1  ? 'up'   :
        row.openFirst  > row.openSecond + 1 ? 'down' : 'flat';
      return {
        email: row.email, name: row.name,
        open: row.open, done: row.done,
        health, trend, lastDate: row.lastDate,
      };
    });

  return {
    chartData, keptRate, overdueCount, openCount,
    thisWeekCreated, lastWeekCreated, avgResolutionDays, fulfillmentTrend,
    ageBuckets, avgAgeDays, topCounterparties, rangeLabel,
  };
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;

  const { range = '12w' } = await searchParams;
  const validRange = (['4w', '12w', '6m', 'all'] as const).includes(range as Range)
    ? (range as Range)
    : '12w';

  // 'all' is honest: we display 52 weekly buckets max
  const effectiveWeeks =
    validRange === '4w'  ? 4  :
    validRange === '6m'  ? 26 :
    validRange === 'all' ? 52 : 12;

  const rangeLabel =
    validRange === '4w'  ? 'last 4 weeks'  :
    validRange === '6m'  ? 'last 6 months' :
    validRange === 'all' ? 'last 52 weeks' :
    'last 12 weeks';

  const weeksAgo = new Date();
  weeksAgo.setUTCDate(weeksAgo.getUTCDate() - effectiveWeeks * 7);
  const weeksAgoISO = weeksAgo.toISOString();

  const todayISO = new Date().toISOString().slice(0, 10);

  const fiftyTwoWeeksAgo = new Date();
  fiftyTwoWeeksAgo.setUTCDate(fiftyTwoWeeksAgo.getUTCDate() - 52 * 7);
  const fiftyTwoWeeksAgoISO = fiftyTwoWeeksAgo.toISOString();

  const thisWeekStart = new Date(); thisWeekStart.setUTCDate(thisWeekStart.getUTCDate() - 6);  thisWeekStart.setUTCHours(0, 0, 0, 0);
  const lastWeekStart = new Date(); lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 13); lastWeekStart.setUTCHours(0, 0, 0, 0);
  const lastWeekEnd   = new Date(); lastWeekEnd.setUTCDate(lastWeekEnd.getUTCDate() - 7);      lastWeekEnd.setUTCHours(23, 59, 59, 999);

  const thisWeekStartISO = thisWeekStart.toISOString();
  const lastWeekStartISO = lastWeekStart.toISOString();
  const lastWeekEndISO   = lastWeekEnd.toISOString();
  const midPointISO      = new Date((weeksAgo.getTime() + Date.now()) / 2).toISOString();

  // ── Parallel fetches ───────────────────────────────────────────────────────
  const [
    { data: sessionsRaw },
    { count: allTimeTriagesCount },
    { data: heatmapSessionsRaw },
    { data: outgoingInRangeRaw },
    { data: outgoingOpenAllRaw },
    { data: outgoingSenderRaw  },
    { data: assignedInRangeRaw },
    { data: assignedOpenAllRaw },
    { data: assignedSenderRaw  },
  ] = await Promise.all([
    safe(supabaseAdmin
      .from('triage_sessions')
      .select('id, triggered_at, emails_scanned, emails_surfaced')
      .eq('user_id', userId)
      .gte('triggered_at', weeksAgoISO), []),

    safe(supabaseAdmin
      .from('triage_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId), null),

    safe(supabaseAdmin
      .from('triage_sessions')
      .select('triggered_at')
      .eq('user_id', userId)
      .gte('triggered_at', fiftyTwoWeeksAgoISO), []),

    // Outgoing commitments in range
    safe(supabaseAdmin
      .from('commitments')
      .select('scanned_at, resolved_at, status, due_date')
      .eq('user_id', userId)
      .eq('direction', 'outgoing')
      .gte('scanned_at', weeksAgoISO), []),

    // All open outgoing (for age + overdue)
    safe(supabaseAdmin
      .from('commitments')
      .select('scanned_at, due_date')
      .eq('user_id', userId)
      .eq('direction', 'outgoing')
      .eq('status', 'open'), []),

    // Outgoing senders
    safe(supabaseAdmin
      .from('commitments')
      .select('counterparty_email, counterparty, status, scanned_at, due_date')
      .eq('user_id', userId)
      .eq('direction', 'outgoing')
      .gte('scanned_at', weeksAgoISO), []),

    // Assigned commitments in range
    safe(supabaseAdmin
      .from('commitments')
      .select('scanned_at, resolved_at, status, due_date')
      .eq('user_id', userId)
      .eq('direction', 'assigned')
      .gte('scanned_at', weeksAgoISO), []),

    // All open assigned
    safe(supabaseAdmin
      .from('commitments')
      .select('scanned_at, due_date')
      .eq('user_id', userId)
      .eq('direction', 'assigned')
      .eq('status', 'open'), []),

    // Assigned senders
    safe(supabaseAdmin
      .from('commitments')
      .select('counterparty_email, counterparty, status, scanned_at, due_date')
      .eq('user_id', userId)
      .eq('direction', 'assigned')
      .gte('scanned_at', weeksAgoISO), []),
  ]);

  const sessions       = sessionsRaw ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTimeTriages = allTimeTriagesCount ?? 0;

  // ── Empty state ────────────────────────────────────────────────────────────
  if (allTimeTriages === 0) {
    return (
      <div className="max-w-4xl space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Your triage, communication, and commitment data will appear here.
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <p className="text-sm font-medium">No data yet</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Open Gmail, run your first triage session, and come back here —
              your analytics will start building immediately.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Secondary fetch: action results ───────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionIds = sessions.map((s: any) => s.id);
  const { data: actionResultsRaw } = sessionIds.length > 0
    ? await safe(supabaseAdmin
        .from('triage_results')
        .select('user_action, actioned_at, session_id')
        .in('session_id', sessionIds), [])
    : { data: [] };

  // ── Session aggregates ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const triagesInRange  = sessions.length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannedInRange  = sessions.reduce((a: number, s: any) => a + (s.emails_scanned  ?? 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const surfacedInRange = sessions.reduce((a: number, s: any) => a + (s.emails_surfaced ?? 0), 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const thisWeekSessions = sessions.filter((s: any) => s.triggered_at >= thisWeekStartISO);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastWeekSessions = sessions.filter((s: any) => s.triggered_at >= lastWeekStartISO && s.triggered_at <= lastWeekEndISO);

  const outgoingInRange = outgoingInRangeRaw ?? [];

  const wow = {
    thisTriages:  thisWeekSessions.length,
    lastTriages:  lastWeekSessions.length,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    thisScanned:  thisWeekSessions.reduce((a: number, s: any) => a + (s.emails_scanned  ?? 0), 0),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lastScanned:  lastWeekSessions.reduce((a: number, s: any) => a + (s.emails_scanned  ?? 0), 0),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    thisResolved: outgoingInRange.filter((c: any) => c.status === 'done' && c.resolved_at && c.resolved_at >= thisWeekStartISO).length,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lastResolved: outgoingInRange.filter((c: any) => c.status === 'done' && c.resolved_at && c.resolved_at >= lastWeekStartISO && c.resolved_at <= lastWeekEndISO).length,
  };

  // ── Weekly buckets for activity chart ────────────────────────────────────
  const weeks = buildWeeks(effectiveWeeks);

  const activityMap = new Map(weeks.map(({ key }) => [key, { sessions: 0, scanned: 0, surfaced: 0 }]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessions.forEach((s: any) => {
    const b = activityMap.get(toMondayKey(s.triggered_at));
    if (b) { b.sessions += 1; b.scanned += s.emails_scanned ?? 0; b.surfaced += s.emails_surfaced ?? 0; }
  });
  const activityData: ActivityPoint[] = weeks.map(({ key, label }) => ({ label, ...activityMap.get(key)! }));

  // ── Action breakdown ──────────────────────────────────────────────────────
  const actionResults = actionResultsRaw ?? [];
  const actionBreakdown: ActionBreakdown = { replied: 0, snoozed: 0, dismissed: 0, pending: 0 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actionResults.forEach((r: any) => {
    const a = r.user_action as string | null;
    if (a === 'replied')        actionBreakdown.replied   += 1;
    else if (a === 'snoozed')   actionBreakdown.snoozed   += 1;
    else if (a === 'dismissed') actionBreakdown.dismissed += 1;
    else                        actionBreakdown.pending   += 1;
  });
  const totalActioned = actionBreakdown.replied + actionBreakdown.snoozed + actionBreakdown.dismissed + actionBreakdown.pending;

  // ── Response time ─────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionTriagedAt = new Map((sessionsRaw ?? []).map((s: any) => [s.id, s.triggered_at]));
  const allResponseHours: number[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actionResults
    .filter((r: any) => r.user_action === 'replied' && r.actioned_at)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .forEach((r: any) => {
      const sessionTs = sessionTriagedAt.get(r.session_id);
      if (!sessionTs) return;
      const diffHours = (new Date(r.actioned_at).getTime() - new Date(sessionTs).getTime()) / 3600000;
      if (diffHours < 0 || diffHours > 168) return;
      allResponseHours.push(diffHours);
    });
  allResponseHours.sort((a, b) => a - b);
  const p50 = percentile(allResponseHours, 0.5);
  const p90 = allResponseHours.length >= 5 ? percentile(allResponseHours, 0.9) : null;

  const RT_BUCKETS: { label: string; min: number; max: number; count: number }[] = [
    { label: '<1h',    min: 0,  max: 1,        count: 0 },
    { label: '1–4h',  min: 1,  max: 4,        count: 0 },
    { label: '4–12h', min: 4,  max: 12,       count: 0 },
    { label: '12–24h', min: 12, max: 24,      count: 0 },
    { label: '1–2d',  min: 24, max: 48,       count: 0 },
    { label: '>2d',   min: 48, max: Infinity,  count: 0 },
  ];
  allResponseHours.forEach((h) => {
    const bucket = RT_BUCKETS.find(({ min, max }) => h >= min && h < max);
    if (bucket) bucket.count += 1;
  });
  const rtBuckets: RtBucket[] = RT_BUCKETS.map(({ label, count }) => ({ label, count }));

  // ── Surfacing rate ────────────────────────────────────────────────────────
  const surfacingRateData: SurfacingPoint[] = weeks.map(({ key, label }) => {
    const b = activityMap.get(key)!;
    return { label, rate: b.scanned > 0 ? Math.round((b.surfaced / b.scanned) * 100) : null };
  });
  const ratePoints     = surfacingRateData.filter((d) => d.rate !== null);
  const overallAvgRate = ratePoints.length > 0
    ? Math.round(ratePoints.reduce((a, d) => a + d.rate!, 0) / ratePoints.length)
    : null;

  // ── Heatmap ───────────────────────────────────────────────────────────────
  const heatmapByDay = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (heatmapSessionsRaw ?? []).forEach((s: any) => {
    const day = s.triggered_at.slice(0, 10);
    heatmapByDay.set(day, (heatmapByDay.get(day) ?? 0) + 1);
  });
  const heatmapDays: HeatmapDay[]  = [...heatmapByDay.entries()].map(([date, count]) => ({ date, count }));
  const heatmapTotal                = (heatmapSessionsRaw ?? []).length;

  // ── Commitment datasets ───────────────────────────────────────────────────
  const outgoingDataset = computeCommitmentDataset(
    outgoingInRangeRaw ?? [], outgoingOpenAllRaw ?? [], outgoingSenderRaw ?? [],
    weeks, thisWeekStartISO, lastWeekStartISO, lastWeekEndISO, midPointISO, todayISO, rangeLabel,
  );
  const assignedDataset = computeCommitmentDataset(
    assignedInRangeRaw ?? [], assignedOpenAllRaw ?? [], assignedSenderRaw ?? [],
    weeks, thisWeekStartISO, lastWeekStartISO, lastWeekEndISO, midPointISO, todayISO, rangeLabel,
  );

  // ── Overview tiles ────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outgoingResolved = outgoingInRange.filter((c: any) => c.status === 'done').length;
  const outgoingTotal    = outgoingInRange.length;
  const fulfillmentPct   = outgoingTotal >= 5
    ? Math.round((outgoingResolved / outgoingTotal) * 100)
    : null;
  const outgoingOpenCount = (outgoingOpenAllRaw ?? []).length;

  const tiles = [
    {
      label: 'Triages',
      value: triagesInRange.toLocaleString(),
      sub:   `${allTimeTriages.toLocaleString()} all time`,
      icon:  Inbox,
      wow:   { cur: wow.thisTriages, prev: wow.lastTriages },
    },
    {
      label: 'Emails scanned',
      value: scannedInRange.toLocaleString(),
      sub:   `${surfacedInRange.toLocaleString()} surfaced`,
      icon:  Mail,
      wow:   { cur: wow.thisScanned, prev: wow.lastScanned },
    },
    {
      label: 'Commitments resolved',
      value: outgoingResolved.toLocaleString(),
      sub:   `${outgoingOpenCount} still open`,
      icon:  CheckSquare,
      wow:   { cur: wow.thisResolved, prev: wow.lastResolved },
    },
    {
      label: 'Fulfillment rate',
      value: fulfillmentPct !== null
        ? `${fulfillmentPct}%`
        : outgoingTotal > 0 ? `${outgoingResolved}/${outgoingTotal}` : '—',
      sub: fulfillmentPct !== null
        ? `${outgoingResolved} of ${outgoingTotal} resolved`
        : outgoingTotal === 0 ? 'No commitments' : 'Need 5+ to show %',
      icon: TrendingUp,
      wow:  null,
    },
  ];

  // ── Insights ──────────────────────────────────────────────────────────────
  const insights = buildInsights({
    triageCount:   triagesInRange,
    rangeLabel,
    surfacingRate: overallAvgRate,
    replyCount:    actionBreakdown.replied,
    dismissCount:  actionBreakdown.dismissed,
    snoozedCount:  actionBreakdown.snoozed,
    totalActioned,
    p50Hours:      p50,
    openCount:     outgoingOpenCount,
    overdueCount:  outgoingDataset.overdueCount,
    avgAgeDays:    outgoingDataset.avgAgeDays,
    keptRate:      fulfillmentPct,
  });

  return (
    <div className="max-w-4xl space-y-8">

      {/* Header */}
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

      {/* Insights strip */}
      <InsightsStrip insights={insights} />

      {/* Overview tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(({ label, value, sub, icon: Icon, wow: tileWow }) => {
          const pct = tileWow && tileWow.prev > 0
            ? Math.round(((tileWow.cur - tileWow.prev) / tileWow.prev) * 100)
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
                      <p className={`text-xs mt-0.5 font-medium ${pct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
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

      {/* ═══ SECTION 1: TRIAGE ACTIVITY ═══════════════════════════════════════ */}
      <div id="triage" className="space-y-5">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground">Triage Activity</h3>
          <div className="flex-1 h-px bg-border" />
          <p className="text-xs text-muted-foreground">
            Are you scanning enough? Is the AI surfacing the right things?
          </p>
        </div>

        {/* Habit heatmap */}
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

        {/* Activity + signal quality */}
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
              <CardTitle className="text-sm font-medium">Signal quality</CardTitle>
              <CardDescription>
                Of surfaced emails, what did you do with them?
                A high dismiss rate means the AI is surfacing noise.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartErrorBoundary title="Signal quality">
                <ActionRateChart data={actionBreakdown} />
              </ChartErrorBoundary>
            </CardContent>
          </Card>
        </div>

        {/* Surfacing rate — full width */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Surfacing rate</CardTitle>
            <CardDescription>
              % of scanned emails surfaced. Healthy range: 10–25%.
              {overallAvgRate !== null && (
                <span className={`ml-1 font-medium ${overallAvgRate > 35 ? 'text-amber-500' : overallAvgRate < 5 ? 'text-amber-500' : 'text-foreground'}`}>
                  Avg {overallAvgRate}%
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartErrorBoundary title="Surfacing rate">
              <SurfacingRateChart data={surfacingRateData} avgRate={overallAvgRate} />
            </ChartErrorBoundary>
          </CardContent>
        </Card>
      </div>

      {/* ═══ SECTION 2: COMMUNICATION ════════════════════════════════════════ */}
      <div id="communication" className="space-y-5">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground">Communication</h3>
          <div className="flex-1 h-px bg-border" />
          <p className="text-xs text-muted-foreground">
            How quickly do you act on what the inbox surfaces?
          </p>
        </div>

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
                totalReplies={allResponseHours.length}
                p50={p50}
                p90={p90}
              />
            </ChartErrorBoundary>
          </CardContent>
        </Card>
      </div>

      {/* ═══ SECTION 3: COMMITMENTS ══════════════════════════════════════════ */}
      <div id="commitments" className="space-y-5">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground">Commitments</h3>
          <div className="flex-1 h-px bg-border" />
          <p className="text-xs text-muted-foreground">
            Are you keeping your word? Which relationships need attention?
          </p>
        </div>

        <CommitmentsSection outgoing={outgoingDataset} assigned={assignedDataset} />
      </div>

    </div>
  );
}
