import { auth }          from '@/auth';
import { supabaseAdmin }  from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { ActivityChart,            type ActivityPoint }           from '@/components/analytics/activity-chart';
import { CommitmentAgeChart,       type AgeBucket }               from '@/components/analytics/commitment-age-chart';
import { CommitmentsPanel }                                        from '@/components/analytics/commitments-panel';
import { DayPatternChart,          type DayPoint }                from '@/components/analytics/day-pattern-chart';
import { HabitHeatmap,             type HeatmapDay }              from '@/components/analytics/habit-heatmap';
import { InsightsStrip,            buildInsights }                from '@/components/analytics/insights-strip';
import { RangeToggle,              type Range }                    from '@/components/analytics/range-toggle';
import { ResponseTimeChart,        type ResponseTimePoint }       from '@/components/analytics/response-time-chart';
import { ResponseTimeDistribution, type RtBucket }                from '@/components/analytics/response-time-distribution';
import { SenderTable,              type SenderRow }               from '@/components/analytics/sender-table';
import { SurfacingRateChart,       type SurfacingPoint }          from '@/components/analytics/surfacing-rate-chart';
import { ActionRateChart,          type ActionBreakdown }         from '@/components/analytics/action-rate-chart';
import { ChartErrorBoundary }                                      from '@/components/analytics/chart-error-boundary';
import { CommitmentChart,          type CommitmentPoint }         from '@/components/analytics/commitment-chart';

import { Inbox, Mail, CheckSquare, TrendingUp } from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

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

const DOW_ORDER  = [1, 2, 3, 4, 5, 6, 0] as const;
const DOW_LABELS: Record<number, string> = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const safe = <T,>(p: any, fallback: T): Promise<{ data: T | null; error: unknown; count?: number | null }> =>
  Promise.resolve(p).catch(() => ({ data: fallback, error: null, count: null }));

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await auth();
  const userId  = session!.user.id;

  const { range = '12w' } = await searchParams;
  const validRange = (['4w', '12w', '6m', 'all'] as const).includes(range as Range)
    ? (range as Range)
    : '12w';

  const WEEKS = validRange === '4w' ? 4 : validRange === '6m' ? 26 : validRange === 'all' ? 52 : 12;

  const rangeLabel =
    validRange === '4w'  ? 'last 4 weeks'  :
    validRange === '6m'  ? 'last 6 months' :
    validRange === 'all' ? 'all time'      :
    'last 12 weeks';

  const weeksAgo = new Date();
  if (validRange !== 'all') {
    weeksAgo.setUTCDate(weeksAgo.getUTCDate() - WEEKS * 7);
  } else {
    weeksAgo.setFullYear(weeksAgo.getFullYear() - 10);
  }
  const weeksAgoISO = weeksAgo.toISOString();

  const overdueThreshold = new Date();
  overdueThreshold.setUTCDate(overdueThreshold.getUTCDate() - 14);
  const overdueThresholdISO = overdueThreshold.toISOString();

  // Heatmap always covers 52 weeks regardless of range toggle
  const fiftyTwoWeeksAgo = new Date();
  fiftyTwoWeeksAgo.setUTCDate(fiftyTwoWeeksAgo.getUTCDate() - 52 * 7);
  const fiftyTwoWeeksAgoISO = fiftyTwoWeeksAgo.toISOString();

  // Week-over-week windows
  const thisWeekStart = new Date(); thisWeekStart.setUTCDate(thisWeekStart.getUTCDate() - 6);  thisWeekStart.setUTCHours(0, 0, 0, 0);
  const lastWeekStart = new Date(); lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 13); lastWeekStart.setUTCHours(0, 0, 0, 0);
  const lastWeekEnd   = new Date(); lastWeekEnd.setUTCDate(lastWeekEnd.getUTCDate() - 7);      lastWeekEnd.setUTCHours(23, 59, 59, 999);

  const thisWeekStartISO = thisWeekStart.toISOString();
  const lastWeekStartISO = lastWeekStart.toISOString();
  const lastWeekEndISO   = lastWeekEnd.toISOString();

  // ── Primary fetches ────────────────────────────────────────────────────────
  const [
    { data: sessionsRaw },
    { data: commitmentsRaw },
    { data: openResult },
    { data: allTimeResult },
    { count: overdueCount },
    { data: heatmapSessionsRaw },
    { data: openCommitmentsForAge },
  ] = await Promise.all([
    safe(supabaseAdmin
      .from('triage_sessions')
      .select('id, triggered_at, emails_scanned, emails_surfaced')
      .eq('user_id', userId)
      .gte('triggered_at', weeksAgoISO), []),

    safe(supabaseAdmin
      .from('commitments')
      .select('scanned_at, resolved_at, status')
      .eq('user_id', userId)
      .eq('direction', 'outgoing')
      .gte('scanned_at', weeksAgoISO), []),

    safe(supabaseAdmin
      .from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'open')
      .eq('direction', 'outgoing'), null),

    safe(supabaseAdmin
      .from('triage_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId), null),

    safe(supabaseAdmin
      .from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'open')
      .eq('direction', 'outgoing')
      .lte('scanned_at', overdueThresholdISO), null),

    // Heatmap: fixed 52-week window, just need triggered_at
    safe(supabaseAdmin
      .from('triage_sessions')
      .select('triggered_at')
      .eq('user_id', userId)
      .gte('triggered_at', fiftyTwoWeeksAgoISO), []),

    // Commitment age distribution: all open outgoing commitments
    safe(supabaseAdmin
      .from('commitments')
      .select('scanned_at')
      .eq('user_id', userId)
      .eq('direction', 'outgoing')
      .eq('status', 'open'), []),
  ]);

  const sessions    = sessionsRaw    ?? [];
  const commitments = commitmentsRaw ?? [];

  // ── Secondary fetches (need session IDs) ──────────────────────────────────
  const sessionIds = sessions.map((s: any) => s.id);

  const [{ data: actionResultsRaw }, { data: senderRaw }] = await Promise.all([
    sessionIds.length > 0
      ? safe(supabaseAdmin
          .from('triage_results')
          .select('user_action, actioned_at, session_id')
          .in('session_id', sessionIds), [])
      : Promise.resolve({ data: [], error: null }),

    safe(supabaseAdmin
      .from('commitments')
      .select('counterparty_email, counterparty, status, scanned_at')
      .eq('user_id', userId)
      .eq('direction', 'outgoing')
      .gte('scanned_at', weeksAgoISO), []),
  ]);

  // ── Computed values ────────────────────────────────────────────────────────

  const openCount      = (openResult    as any)?.count ?? 0;
  const allTimeTriages = (allTimeResult as any)?.count ?? 0;
  const overdueTotal   = overdueCount   ?? 0;

  // ── Range-window aggregates (used by overview tiles) ──────────────────────
  const triagesInRange  = sessions.length;
  const scannedInRange  = sessions.reduce((a: number, s: any) => a + (s.emails_scanned  ?? 0), 0);
  const surfacedInRange = sessions.reduce((a: number, s: any) => a + (s.emails_surfaced ?? 0), 0);
  const resolvedInRange = commitments.filter((c: any) => c.status === 'done').length;
  const totalInRange    = commitments.length;
  const fulfillmentPct  = totalInRange >= 5
    ? Math.round((resolvedInRange / totalInRange) * 100)
    : null;

  // ── Week-over-week ─────────────────────────────────────────────────────────
  const thisWeekSessions = sessions.filter((s: any) => s.triggered_at >= thisWeekStartISO);
  const lastWeekSessions = sessions.filter((s: any) => s.triggered_at >= lastWeekStartISO && s.triggered_at <= lastWeekEndISO);

  const wow = {
    thisTriages:  thisWeekSessions.length,
    lastTriages:  lastWeekSessions.length,
    thisSurfaced: thisWeekSessions.reduce((a: number, s: any) => a + (s.emails_surfaced ?? 0), 0),
    lastSurfaced: lastWeekSessions.reduce((a: number, s: any) => a + (s.emails_surfaced ?? 0), 0),
    thisResolved: commitments.filter((c: any) => c.status === 'done' && c.resolved_at && c.resolved_at >= thisWeekStartISO).length,
    lastResolved: commitments.filter((c: any) => c.status === 'done' && c.resolved_at && c.resolved_at >= lastWeekStartISO && c.resolved_at <= lastWeekEndISO).length,
  };

  const thisWeekCreated = commitments.filter((c: any) => c.scanned_at >= thisWeekStartISO).length;
  const lastWeekCreated = commitments.filter((c: any) => c.scanned_at >= lastWeekStartISO && c.scanned_at <= lastWeekEndISO).length;

  // ── Weekly buckets ─────────────────────────────────────────────────────────
  const weeks = buildWeeks(WEEKS);

  const activityMap = new Map(weeks.map(({ key }) => [key, { sessions: 0, scanned: 0, surfaced: 0 }]));
  sessions.forEach((s: any) => {
    const b = activityMap.get(toMondayKey(s.triggered_at));
    if (b) { b.sessions += 1; b.scanned += s.emails_scanned ?? 0; b.surfaced += s.emails_surfaced ?? 0; }
  });
  const activityData: ActivityPoint[] = weeks.map(({ key, label }) => ({ label, ...activityMap.get(key)! }));

  const commitmentMap = new Map(weeks.map(({ key }) => [key, { created: 0, resolved: 0 }]));
  commitments.forEach((c: any) => {
    const cb = commitmentMap.get(toMondayKey(c.scanned_at));
    if (cb) cb.created += 1;
    if (c.status === 'done' && c.resolved_at) {
      const rb = commitmentMap.get(toMondayKey(c.resolved_at));
      if (rb) rb.resolved += 1;
    }
  });
  const commitmentData: CommitmentPoint[] = weeks.map(({ key, label }) => ({ label, ...commitmentMap.get(key)! }));

  // ── Action rate breakdown ──────────────────────────────────────────────────
  const actionResults    = actionResultsRaw ?? [];
  const actionBreakdown: ActionBreakdown = { replied: 0, snoozed: 0, dismissed: 0, pending: 0 };
  actionResults.forEach((r: any) => {
    const a = r.user_action as string | null;
    if (a === 'replied')   actionBreakdown.replied   += 1;
    else if (a === 'snoozed')   actionBreakdown.snoozed   += 1;
    else if (a === 'dismissed') actionBreakdown.dismissed += 1;
    else                        actionBreakdown.pending   += 1;
  });
  const totalActioned = actionBreakdown.replied + actionBreakdown.snoozed + actionBreakdown.dismissed + actionBreakdown.pending;

  // ── Response time ──────────────────────────────────────────────────────────
  const sessionTriagedAt = new Map((sessionsRaw ?? []).map((s: any) => [s.id, s.triggered_at]));
  const allResponseHours: number[] = [];
  const responseTimeMap = new Map(weeks.map(({ key }) => [key, { totalHours: 0, count: 0 }]));

  actionResults
    .filter((r: any) => r.user_action === 'replied' && r.actioned_at)
    .forEach((r: any) => {
      const sessionTs = sessionTriagedAt.get(r.session_id);
      if (!sessionTs) return;
      const diffHours = (new Date(r.actioned_at).getTime() - new Date(sessionTs).getTime()) / 3600000;
      if (diffHours < 0 || diffHours > 168) return;
      allResponseHours.push(diffHours);
      const b = responseTimeMap.get(toMondayKey(r.actioned_at));
      if (b) { b.totalHours += diffHours; b.count += 1; }
    });
  allResponseHours.sort((a, b) => a - b);

  const p50 = percentile(allResponseHours, 0.5);
  const p90 = allResponseHours.length >= 5 ? percentile(allResponseHours, 0.9) : null;

  const responseTimeData: ResponseTimePoint[] = weeks.map(({ key, label }) => {
    const b = responseTimeMap.get(key)!;
    return { label, avgHours: b.count >= 2 ? Math.round((b.totalHours / b.count) * 10) / 10 : null };
  });

  const RT_BUCKETS: { label: string; min: number; max: number; count: number }[] = [
    { label: '<1h',    min: 0,  max: 1,        count: 0 },
    { label: '1–4h',  min: 1,  max: 4,        count: 0 },
    { label: '4–12h', min: 4,  max: 12,       count: 0 },
    { label: '12–24h',min: 12, max: 24,       count: 0 },
    { label: '1–2d',  min: 24, max: 48,       count: 0 },
    { label: '>2d',   min: 48, max: Infinity,  count: 0 },
  ];
  allResponseHours.forEach((h) => {
    const bucket = RT_BUCKETS.find(({ min, max }) => h >= min && h < max);
    if (bucket) bucket.count += 1;
  });
  const rtBuckets: RtBucket[] = RT_BUCKETS.map(({ label, count }) => ({ label, count }));

  // ── Surfacing rate ─────────────────────────────────────────────────────────
  const surfacingRateData: SurfacingPoint[] = weeks.map(({ key, label }) => {
    const b = activityMap.get(key)!;
    return { label, rate: b.scanned > 0 ? Math.round((b.surfaced / b.scanned) * 100) : null };
  });
  const ratePoints     = surfacingRateData.filter((d) => d.rate !== null);
  const overallAvgRate = ratePoints.length > 0
    ? Math.round(ratePoints.reduce((a, d) => a + d.rate!, 0) / ratePoints.length)
    : null;

  // ── Completion rate (avg for the panel stat) ──────────────────────────────
  const completionRatePoints = weeks.map(({ key }) => {
    const b = commitmentMap.get(key)!;
    return b.created >= 2 ? Math.round((b.resolved / b.created) * 100) : null;
  }).filter((r): r is number => r !== null);
  const avgCompletionRate = completionRatePoints.length > 0
    ? Math.round(completionRatePoints.reduce((a, r) => a + r, 0) / completionRatePoints.length)
    : null;

  // ── Day-of-week pattern ────────────────────────────────────────────────────
  const dowMap = new Map<number, number>([[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0]]);
  sessions.forEach((s: any) => {
    const dow = new Date(s.triggered_at).getUTCDay();
    dowMap.set(dow, (dowMap.get(dow) ?? 0) + 1);
  });
  const dayData: DayPoint[] = DOW_ORDER.map((dow) => ({ day: DOW_LABELS[dow], sessions: dowMap.get(dow) ?? 0 }));

  // ── Habit heatmap ──────────────────────────────────────────────────────────
  const heatmapByDay = new Map<string, number>();
  (heatmapSessionsRaw ?? []).forEach((s: any) => {
    const day = s.triggered_at.slice(0, 10);
    heatmapByDay.set(day, (heatmapByDay.get(day) ?? 0) + 1);
  });
  const heatmapDays: HeatmapDay[] = [...heatmapByDay.entries()].map(([date, count]) => ({ date, count }));
  const heatmapTotal = (heatmapSessionsRaw ?? []).length;

  // ── Commitment age distribution ────────────────────────────────────────────
  const nowMs = Date.now();
  const AGE_BUCKETS_DEF = [
    { label: '0–3d',   min: 0,  max: 3,  isOverdue: false },
    { label: '4–7d',   min: 4,  max: 7,  isOverdue: false },
    { label: '8–14d',  min: 8,  max: 14, isOverdue: false },
    { label: '15–30d', min: 15, max: 30, isOverdue: true  },
    { label: '1–2mo',  min: 31, max: 60, isOverdue: true  },
    { label: '60d+',   min: 61, max: Infinity, isOverdue: true },
  ];
  // Keep min/max for bucketing logic; AgeBucket[] is a subset — strip at chart boundary
  const ageBucketsInternal = AGE_BUCKETS_DEF.map((def) => ({ ...def, count: 0 }));

  let totalAgeMs = 0;
  const openComms = openCommitmentsForAge ?? [];
  openComms.forEach((c: any) => {
    const ageDays = Math.floor((nowMs - new Date(c.scanned_at).getTime()) / 86_400_000);
    totalAgeMs += ageDays;
    const bucket = ageBucketsInternal.find((b) => ageDays >= b.min && ageDays <= b.max);
    if (bucket) bucket.count += 1;
  });
  const ageBuckets: AgeBucket[] = ageBucketsInternal.map(({ label, count, isOverdue }) => ({ label, count, isOverdue }));
  const avgAgeDays = openComms.length > 0 ? totalAgeMs / openComms.length : null;

  // ── Per-sender table ───────────────────────────────────────────────────────
  const midPointISO = new Date((weeksAgo.getTime() + Date.now()) / 2).toISOString();
  const senderMapInternal = new Map<string, {
    email: string; name: string | null;
    open: number; done: number; openFirst: number; openSecond: number;
    lastDate: string | null;
  }>();

  (senderRaw ?? []).forEach((c: any) => {
    const email = (c.counterparty_email || '').toLowerCase().trim();
    if (!email) return;
    if (!senderMapInternal.has(email)) {
      senderMapInternal.set(email, { email, name: c.counterparty || null, open: 0, done: 0, openFirst: 0, openSecond: 0, lastDate: null });
    }
    const row = senderMapInternal.get(email)!;
    if (c.status === 'open') {
      row.open += 1;
      if (c.scanned_at < midPointISO) row.openFirst += 1;
      else                            row.openSecond += 1;
    }
    if (c.status === 'done') row.done += 1;
    // Track most recent commitment date for this sender
    if (!row.lastDate || c.scanned_at > row.lastDate) row.lastDate = c.scanned_at;
  });

  const topSenders: SenderRow[] = [...senderMapInternal.values()]
    .sort((a, b) => (b.open + b.done) - (a.open + a.done))
    .slice(0, 10)
    .map((row) => {
      const total     = row.open + row.done;
      const openRatio = total > 0 ? row.open / total : 0;
      const health: SenderRow['health'] =
        openRatio > 0.6 || row.open >= 5 ? 'red' :
        openRatio > 0.3 || row.open >= 2 ? 'yellow' :
        'green';
      const trend: SenderRow['trend'] =
        row.openSecond > row.openFirst + 1 ? 'up' :
        row.openFirst  > row.openSecond + 1 ? 'down' : 'flat';
      return { email: row.email, name: row.name, open: row.open, done: row.done, health, trend, lastDate: row.lastDate };
    });

  // ── Overview tiles (range-aware) ───────────────────────────────────────────
  const tiles = [
    {
      label: `Triages`,
      value: triagesInRange.toLocaleString(),
      sub:   `${allTimeTriages.toLocaleString()} all time`,
      icon:  Inbox,
      wow:   { cur: wow.thisTriages, prev: wow.lastTriages },
    },
    {
      label: `Emails scanned`,
      value: scannedInRange.toLocaleString(),
      sub:   `${surfacedInRange.toLocaleString()} surfaced`,
      icon:  Mail,
      wow:   { cur: wow.thisSurfaced, prev: wow.lastSurfaced },
    },
    {
      label: `Commitments resolved`,
      value: resolvedInRange.toLocaleString(),
      sub:   `${openCount} still open`,
      icon:  CheckSquare,
      wow:   { cur: wow.thisResolved, prev: wow.lastResolved },
    },
    {
      label: `Fulfillment rate`,
      value: fulfillmentPct !== null
        ? `${fulfillmentPct}%`
        : totalInRange > 0 ? `${resolvedInRange}/${totalInRange}` : '—',
      sub: fulfillmentPct !== null
        ? `${resolvedInRange} of ${totalInRange} resolved`
        : totalInRange === 0 ? 'No commitments' : 'Need 5+ to show %',
      icon: TrendingUp,
      wow:  null,
    },
  ];

  // ── Insights ───────────────────────────────────────────────────────────────
  const insights = buildInsights({
    triageCount:   triagesInRange,
    rangeLabel,
    surfacingRate: overallAvgRate,
    replyCount:    actionBreakdown.replied,
    dismissCount:  actionBreakdown.dismissed,
    snoozedCount:  actionBreakdown.snoozed,
    totalActioned,
    p50Hours:      p50,
    openCount,
    overdueCount:  overdueTotal,
    avgAgeDays,
    keptRate:      fulfillmentPct,
  });

  return (
    <div className="max-w-4xl space-y-8">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Analytics</h2>
          <p className="text-sm text-muted-foreground">{rangeLabel} — triage, communication, and commitment data.</p>
        </div>
        <RangeToggle current={validRange} />
      </div>

      {/* ── Insights strip ─────────────────────────────────────────────────── */}
      <InsightsStrip insights={insights} />

      {/* ── Overview tiles (range-aware) ───────────────────────────────────── */}
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

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 1: TRIAGE ACTIVITY
      ════════════════════════════════════════════════════════════════════════ */}
      <div id="triage" className="space-y-5">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground">Triage Activity</h3>
          <div className="flex-1 h-px bg-border" />
          <p className="text-xs text-muted-foreground">Are you scanning enough? Is the AI surfacing the right things?</p>
        </div>

        {/* Habit heatmap — full width */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Triage habit</CardTitle>
            <CardDescription>Daily triage sessions over the last 52 weeks. Build the habit.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartErrorBoundary title="Habit heatmap">
              <HabitHeatmap days={heatmapDays} totalTriages={heatmapTotal} />
            </ChartErrorBoundary>
          </CardContent>
        </Card>

        {/* Email activity + signal quality side by side */}
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
                Of surfaced emails, what did you actually do with them?
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

        {/* Surfacing rate + day pattern side by side */}
        <div className="grid gap-5 lg:grid-cols-2">
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Triage by day of week</CardTitle>
              <CardDescription>Which days you run the extension most — {rangeLabel}.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartErrorBoundary title="Day pattern">
                <DayPatternChart data={dayData} />
              </ChartErrorBoundary>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 2: COMMUNICATION
      ════════════════════════════════════════════════════════════════════════ */}
      <div id="communication" className="space-y-5">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground">Communication</h3>
          <div className="flex-1 h-px bg-border" />
          <p className="text-xs text-muted-foreground">How quickly do you act on what the inbox surfaces?</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Time to action</CardTitle>
              <CardDescription>
                Avg hours from email being surfaced in triage to you replying in the sidebar — weeks with 2+ replies shown.
                {p90 !== null && (
                  <span className="ml-1 font-medium text-foreground">
                    P90 {p90 < 24 ? `${p90.toFixed(0)}h` : `${(p90 / 24).toFixed(1)}d`}
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartErrorBoundary title="Time to action">
                <ResponseTimeChart data={responseTimeData} p90={p90} />
              </ChartErrorBoundary>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Reply speed distribution</CardTitle>
              <CardDescription>
                How your reply speed breaks down across time windows — {rangeLabel}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartErrorBoundary title="Reply speed distribution">
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
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 3: COMMITMENTS
      ════════════════════════════════════════════════════════════════════════ */}
      <div id="commitments" className="space-y-5">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground">Commitments</h3>
          <div className="flex-1 h-px bg-border" />
          <p className="text-xs text-muted-foreground">Are you keeping your word? Which relationships need attention?</p>
        </div>

        {/* Consolidated commitments panel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Commitment accountability</CardTitle>
            <CardDescription>
              Fulfillment rate, backlog health, and weekly created vs. resolved — {rangeLabel}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartErrorBoundary title="Commitment accountability">
              <CommitmentsPanel
                chartData={commitmentData}
                keptRate={fulfillmentPct}
                overdueCount={overdueTotal}
                openCount={openCount}
                avgCompletionRate={avgCompletionRate}
                rangeLabel={rangeLabel}
                thisWeekCreated={thisWeekCreated}
                lastWeekCreated={lastWeekCreated}
              />
            </ChartErrorBoundary>
          </CardContent>
        </Card>

        {/* Age distribution + counterparties side by side */}
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Open commitment ages</CardTitle>
              <CardDescription>
                How old your unresolved commitments are. Older = higher risk of being forgotten.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartErrorBoundary title="Commitment age distribution">
                <CommitmentAgeChart
                  buckets={ageBuckets}
                  totalOpen={openCount}
                  avgAgeDays={avgAgeDays}
                />
              </ChartErrorBoundary>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Top counterparties</CardTitle>
              <CardDescription>
                People with the most commitments — health and trend for {rangeLabel}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartErrorBoundary title="Top counterparties">
                <SenderTable senders={topSenders} />
              </ChartErrorBoundary>
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  );
}
