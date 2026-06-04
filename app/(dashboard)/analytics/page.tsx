import { auth }         from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { redirect }      from 'next/navigation';

import { buildInsights }                                          from '@/components/analytics/insights-strip';
import type { Range }                                             from '@/components/analytics/range-toggle';
import type { ActivityPoint }                                     from '@/components/analytics/activity-chart';
import type { ActionBreakdown }                                   from '@/components/analytics/action-rate-chart';
import type { CommitmentDataset }                                 from '@/components/analytics/commitments-section';
import type { HeatmapDay }                                        from '@/components/analytics/habit-heatmap';
import type { SurfacingPoint }                                    from '@/components/analytics/surfacing-rate-chart';
import type { RtBucket }                                          from '@/components/analytics/response-time-distribution';
import type { CommitmentPoint }                                   from '@/components/analytics/commitment-chart';
import type { AgeBucket }                                         from '@/components/analytics/commitment-age-chart';
import type { SenderRow }                                         from '@/components/analytics/sender-table';
import { Card, CardContent }                                      from '@/components/ui/card';
import { AnalyticsClient }                                        from '@/components/analytics/analytics-client';

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
    { data: noiseSnapshotsRaw  },
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

    // Noise trend — daily snapshots for the range period
    safe(supabaseAdmin
      .from('inbox_health_snapshots')
      .select('noise_score, snapshot_date')
      .eq('user_id', userId)
      .gte('snapshot_date', weeksAgoISO.slice(0, 10))
      .order('snapshot_date', { ascending: true })
      .limit(52), []),
  ]);

  const sessions       = sessionsRaw ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTimeTriages = allTimeTriagesCount ?? 0;

  // ── Empty state ────────────────────────────────────────────────────────────
  if (allTimeTriages === 0) {
    return (
      <div className="space-y-6">
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

  // ── Weekly signal quality trend ───────────────────────────────────────────
  // Bucket triage_results by the week of their session to show reply/dismiss trends.
  const sessionTriagedAt = new Map((sessionsRaw ?? []).map((s: any) => [s.id, s.triggered_at])); // eslint-disable-line @typescript-eslint/no-explicit-any
  const signalMap = new Map(weeks.map(({ key }) => [key, { replied: 0, dismissed: 0, total: 0 }]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actionResults.forEach((r: any) => {
    const sessionTs = sessionTriagedAt.get(r.session_id);
    if (!sessionTs) return;
    const bucket = signalMap.get(toMondayKey(sessionTs));
    if (!bucket) return;
    bucket.total += 1;
    if (r.user_action === 'replied')        bucket.replied   += 1;
    else if (r.user_action === 'dismissed') bucket.dismissed += 1;
  });
  const signalQualityData: import('@/components/analytics/signal-quality-trend-chart').SignalQualityPoint[] =
    weeks.map(({ key, label }) => {
      const b = signalMap.get(key)!;
      return {
        label,
        replyRate:   b.total >= 3 ? Math.round((b.replied   / b.total) * 100) : null,
        dismissRate: b.total >= 3 ? Math.round((b.dismissed / b.total) * 100) : null,
      };
    });

  // ── Noise trend ───────────────────────────────────────────────────────────
  const noiseTrendData: import('@/components/analytics/noise-trend-chart').NoiseTrendPoint[] =
    (noiseSnapshotsRaw ?? []).map((s: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      date:       s.snapshot_date as string,
      noiseScore: s.noise_score   as number,
    }));

  // ── Response time ─────────────────────────────────────────────────────────
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
    <AnalyticsClient
      validRange={validRange}
      rangeLabel={rangeLabel}
      summary={{
        triagesInRange,
        allTimeTriages,
        scannedInRange,
        surfacedInRange,
        outgoingResolved,
        outgoingTotal,
        outgoingOpenCount,
        fulfillmentPct,
        wow,
      }}
      insights={insights}
      heatmapDays={heatmapDays}
      heatmapTotal={heatmapTotal}
      activityData={activityData}
      signalQualityData={signalQualityData}
      noiseTrendData={noiseTrendData}
      rtBuckets={rtBuckets}
      totalReplies={allResponseHours.length}
      p50={p50}
      p90={p90}
      outgoingDataset={outgoingDataset}
      assignedDataset={assignedDataset}
    />
  );
}
