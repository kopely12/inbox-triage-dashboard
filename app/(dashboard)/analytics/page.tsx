import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ActivityChart,              type ActivityPoint }              from '@/components/analytics/activity-chart';
import { CommitmentChart,            type CommitmentPoint }            from '@/components/analytics/commitment-chart';
import { SurfacingRateChart,         type SurfacingPoint }             from '@/components/analytics/surfacing-rate-chart';
import { DayPatternChart,            type DayPoint }                   from '@/components/analytics/day-pattern-chart';
import { RangeToggle,                type Range }                      from '@/components/analytics/range-toggle';
import { ResponseTimeChart,          type ResponseTimePoint }          from '@/components/analytics/response-time-chart';
import { ResponseTimeDistribution,   type RtBucket }                   from '@/components/analytics/response-time-distribution';
import { CompletionRateChart,        type CompletionRatePoint }        from '@/components/analytics/completion-rate-chart';
import { SenderTable,                type SenderRow }                  from '@/components/analytics/sender-table';
import { PromiseAccountability }                                        from '@/components/analytics/promise-accountability';
import { ChartErrorBoundary }                                           from '@/components/analytics/chart-error-boundary';
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

/** Percentile from a pre-sorted array (0–1 fraction). */
function percentile(sorted: number[], frac: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(Math.floor(sorted.length * frac), sorted.length - 1);
  return sorted[idx];
}

const DOW_ORDER  = [1, 2, 3, 4, 5, 6, 0] as const;
const DOW_LABELS: Record<number, string> = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };

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

  // 'all' maps to 52 weeks of display buckets but fetches without a lower date bound
  const WEEKS = validRange === '4w' ? 4 : validRange === '6m' ? 26 : validRange === 'all' ? 52 : 12;

  const rangeLabel =
    validRange === '4w'  ? '4 weeks' :
    validRange === '6m'  ? '6 months' :
    validRange === 'all' ? 'all time' :
    '12 weeks';

  // Lower bound for date-filtered queries (null = no bound for 'all')
  const weeksAgo = new Date();
  if (validRange !== 'all') {
    weeksAgo.setUTCDate(weeksAgo.getUTCDate() - WEEKS * 7);
  } else {
    weeksAgo.setFullYear(weeksAgo.getFullYear() - 10); // effectively all time
  }
  const weeksAgoISO = weeksAgo.toISOString();

  const thirtyDaysAgo    = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

  const overdueThreshold = new Date();
  overdueThreshold.setUTCDate(overdueThreshold.getUTCDate() - 14);
  const overdueThresholdISO = overdueThreshold.toISOString();

  // ── fetch (each query gets an independent fallback so one failure can't blank the whole page) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safe = <T,>(p: any, fallback: T): Promise<{ data: T | null; error: unknown; count?: number | null }> =>
    Promise.resolve(p).catch(() => ({ data: fallback, error: null, count: null }));

  const [
    { data: sessionsRaw },
    { data: commitmentsRaw },
    { data: openResult },
    { data: allTimeResult },
    { count: overdueCount },
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
  ]);

  const sessions    = sessionsRaw    ?? [];
  const commitments = commitmentsRaw ?? [];

  // ── secondary fetches ─────────────────────────────────────────────────────
  const sessionIds = sessions.map((s: any) => s.id);

  const [{ data: repliedResultsRaw }, { data: senderRaw }] = await Promise.all([
    sessionIds.length > 0
      ? safe(supabaseAdmin
          .from('triage_results')
          .select('session_id, actioned_at')
          .eq('user_action', 'replied')
          .not('actioned_at', 'is', null)
          .in('session_id', sessionIds), [])
      : Promise.resolve({ data: [], error: null }),

    safe(supabaseAdmin
      .from('commitments')
      .select('counterparty_email, counterparty, status, scanned_at')
      .eq('user_id', userId)
      .eq('direction', 'outgoing')
      .gte('scanned_at', weeksAgoISO), []),
  ]);

  // ── 30-day overview stats ─────────────────────────────────────────────────
  const sessions30d      = sessions.filter((s: any) => s.triggered_at >= thirtyDaysAgoISO);
  const triages30d       = sessions30d.length;
  const scanned30d       = sessions30d.reduce((a: number, s: any) => a + (s.emails_scanned  ?? 0), 0);
  const surfaced30d      = sessions30d.reduce((a: number, s: any) => a + (s.emails_surfaced ?? 0), 0);

  const commitments30d   = commitments.filter((c: any) => c.scanned_at >= thirtyDaysAgoISO);
  const resolved30d      = commitments30d.filter((c: any) => c.status === 'done').length;
  const total30d         = commitments30d.length;
  const fulfillmentPct   = total30d >= 5 ? Math.round((resolved30d / total30d) * 100) : null;

  const openCount        = (openResult    as unknown as { count: number } | null)?.count ?? 0;
  const allTimeTriages   = (allTimeResult as unknown as { count: number } | null)?.count ?? 0;
  const overdueTotal     = overdueCount ?? 0;

  // ── week-over-week windows ────────────────────────────────────────────────
  const thisWeekStart = new Date(); thisWeekStart.setUTCDate(thisWeekStart.getUTCDate() - 6);   thisWeekStart.setUTCHours(0, 0, 0, 0);
  const lastWeekStart = new Date(); lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 13);  lastWeekStart.setUTCHours(0, 0, 0, 0);
  const lastWeekEnd   = new Date(); lastWeekEnd.setUTCDate(lastWeekEnd.getUTCDate() - 7);       lastWeekEnd.setUTCHours(23, 59, 59, 999);

  const thisWeekStartISO = thisWeekStart.toISOString();
  const lastWeekStartISO = lastWeekStart.toISOString();
  const lastWeekEndISO   = lastWeekEnd.toISOString();

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

  // Promise accountability WoW commitment volume
  const thisWeekCreated = commitments.filter((c: any) => c.scanned_at >= thisWeekStartISO).length;
  const lastWeekCreated = commitments.filter((c: any) => c.scanned_at >= lastWeekStartISO && c.scanned_at <= lastWeekEndISO).length;

  // ── weekly buckets ────────────────────────────────────────────────────────
  const weeks = buildWeeks(WEEKS);

  // Activity chart
  const activityMap = new Map(weeks.map(({ key }) => [key, { sessions: 0, scanned: 0, surfaced: 0 }]));
  sessions.forEach((s: any) => {
    const b = activityMap.get(toMondayKey(s.triggered_at));
    if (b) { b.sessions += 1; b.scanned += s.emails_scanned ?? 0; b.surfaced += s.emails_surfaced ?? 0; }
  });
  const activityData: ActivityPoint[] = weeks.map(({ key, label }) => ({ label, ...activityMap.get(key)! }));

  // Commitment chart
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

  // Response time — collect all raw hours, compute percentiles + histogram
  const sessionTriagedAt  = new Map((sessionsRaw ?? []).map((s: any) => [s.id, s.triggered_at]));
  const repliedResults    = repliedResultsRaw ?? [];
  const allResponseHours: number[] = [];

  const responseTimeMap = new Map(weeks.map(({ key }) => [key, { totalHours: 0, count: 0 }]));
  repliedResults.forEach((r: any) => {
    const sessionTs = sessionTriagedAt.get(r.session_id);
    if (!sessionTs || !r.actioned_at) return;
    const diffHours = (new Date(r.actioned_at).getTime() - new Date(sessionTs).getTime()) / 3600000;
    if (diffHours < 0 || diffHours > 168) return;
    allResponseHours.push(diffHours);
    const weekKey = toMondayKey(r.actioned_at);
    const b = responseTimeMap.get(weekKey);
    if (b) { b.totalHours += diffHours; b.count += 1; }
  });
  allResponseHours.sort((a, b) => a - b);

  const p50 = percentile(allResponseHours, 0.5);
  const p90 = allResponseHours.length >= 5 ? percentile(allResponseHours, 0.9) : null;

  const responseTimeData: ResponseTimePoint[] = weeks.map(({ key, label }) => {
    const b = responseTimeMap.get(key)!;
    return { label, avgHours: b.count >= 2 ? Math.round((b.totalHours / b.count) * 10) / 10 : null };
  });

  // Response-time histogram buckets
  const RT_BUCKETS: { label: string; min: number; max: number; count: number }[] = [
    { label: '<1h',    min: 0,   max: 1,        count: 0 },
    { label: '1–4h',  min: 1,   max: 4,        count: 0 },
    { label: '4–12h', min: 4,   max: 12,       count: 0 },
    { label: '12–24h',min: 12,  max: 24,       count: 0 },
    { label: '1–2d',  min: 24,  max: 48,       count: 0 },
    { label: '>2d',   min: 48,  max: Infinity,  count: 0 },
  ];
  allResponseHours.forEach((h) => {
    const bucket = RT_BUCKETS.find(({ min, max }) => h >= min && h < max);
    if (bucket) bucket.count += 1;
  });
  const rtBuckets: RtBucket[] = RT_BUCKETS.map(({ label, count }) => ({ label, count }));

  // Completion rate chart
  const completionRateData: CompletionRatePoint[] = weeks.map(({ key, label }) => {
    const b = commitmentMap.get(key)!;
    const rate = b.created >= 2 ? Math.round((b.resolved / b.created) * 100) : null;
    return { label, rate };
  });
  const ratePoints2       = completionRateData.filter((d) => d.rate !== null);
  const avgCompletionRate = ratePoints2.length > 0
    ? Math.round(ratePoints2.reduce((a, d) => a + d.rate!, 0) / ratePoints2.length)
    : null;

  // Surfacing rate chart
  const surfacingRateData: SurfacingPoint[] = weeks.map(({ key, label }) => {
    const b = activityMap.get(key)!;
    return { label, rate: b.scanned > 0 ? Math.round((b.surfaced / b.scanned) * 100) : null };
  });
  const ratePoints     = surfacingRateData.filter((d) => d.rate !== null);
  const overallAvgRate = ratePoints.length > 0
    ? Math.round(ratePoints.reduce((a, d) => a + d.rate!, 0) / ratePoints.length)
    : null;

  // Day-of-week chart
  const dowMap = new Map<number, number>([[0, 0],[1, 0],[2, 0],[3, 0],[4, 0],[5, 0],[6, 0]]);
  sessions.forEach((s: any) => {
    const dow = new Date(s.triggered_at).getUTCDay();
    dowMap.set(dow, (dowMap.get(dow) ?? 0) + 1);
  });
  const dayData: DayPoint[] = DOW_ORDER.map((dow) => ({
    day:      DOW_LABELS[dow],
    sessions: dowMap.get(dow) ?? 0,
  }));

  // Per-sender aggregation with health + trend
  // midPoint divides the selected range in half for trend comparison
  const midPointISO = new Date((weeksAgo.getTime() + Date.now()) / 2).toISOString();

  const senderMapInternal = new Map<string, {
    email: string; name: string | null;
    open: number; done: number;
    openFirst: number; openSecond: number;
  }>();

  (senderRaw ?? []).forEach((c: any) => {
    const email = (c.counterparty_email || '').toLowerCase().trim();
    if (!email) return;
    if (!senderMapInternal.has(email)) {
      senderMapInternal.set(email, { email, name: c.counterparty || null, open: 0, done: 0, openFirst: 0, openSecond: 0 });
    }
    const row = senderMapInternal.get(email)!;
    if (c.status === 'open') {
      row.open += 1;
      if (c.scanned_at < midPointISO) row.openFirst += 1;
      else                            row.openSecond += 1;
    }
    if (c.status === 'done') row.done += 1;
  });

  const topSenders: SenderRow[] = [...senderMapInternal.values()]
    .sort((a, b) => (b.open + b.done) - (a.open + a.done))
    .slice(0, 10)
    .map((row) => {
      const total       = row.open + row.done;
      const fulfillment = total > 0 ? row.done / total : 1;

      const health: SenderRow['health'] =
        row.open >= 4 || fulfillment < 0.5 ? 'red' :
        row.open >= 2 || fulfillment < 0.8 ? 'yellow' :
        'green';

      const trend: SenderRow['trend'] =
        row.openSecond > row.openFirst + 1 ? 'up' :
        row.openFirst  > row.openSecond + 1 ? 'down' :
        'flat';

      return { email: row.email, name: row.name, open: row.open, done: row.done, health, trend };
    });

  // ── overview tiles ────────────────────────────────────────────────────────
  const tiles = [
    {
      label: 'Triages (30 days)',
      value: triages30d.toLocaleString(),
      sub:   `${allTimeTriages.toLocaleString()} all time`,
      icon:  Inbox,
    },
    {
      label: 'Emails scanned (30 days)',
      value: scanned30d.toLocaleString(),
      sub:   `${surfaced30d.toLocaleString()} surfaced`,
      icon:  Mail,
    },
    {
      label: 'Commitments resolved (30 days)',
      value: resolved30d.toLocaleString(),
      sub:   `${openCount} still open`,
      icon:  CheckSquare,
    },
    {
      label: 'Fulfillment rate (30 days)',
      value: fulfillmentPct !== null
        ? `${fulfillmentPct}%`
        : total30d > 0 ? `${resolved30d}/${total30d}` : '—',
      sub: fulfillmentPct !== null
        ? `${resolved30d} of ${total30d} resolved`
        : total30d === 0 ? 'No outgoing commitments' : 'Need 5+ to show %',
      icon: TrendingUp,
    },
  ];

  return (
    <div className="max-w-4xl space-y-6">

      {/* Header + range toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Analytics</h2>
          <p className="text-sm text-muted-foreground">Your triage and commitment activity over time.</p>
        </div>
        <RangeToggle current={validRange} />
      </div>

      {/* Overview tiles — always 30-day window regardless of chart range */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(({ label, value, sub, icon: Icon }) => (
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
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Email activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Email activity</CardTitle>
          <CardDescription>
            Emails scanned and surfaced per week — {rangeLabel}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartErrorBoundary title="Email activity">
            <ActivityChart data={activityData} />
          </ChartErrorBoundary>
        </CardContent>
      </Card>

      {/* Surfacing rate + Day pattern side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Surfacing rate</CardTitle>
            <CardDescription>
              % of scanned emails the AI surfaced as worth your attention.
              {overallAvgRate !== null && (
                <span className="ml-1 font-medium text-foreground">Avg {overallAvgRate}%</span>
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

      {/* Commitment tracking */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Commitment tracking</CardTitle>
          <CardDescription>Outgoing commitments created vs. resolved per week — {rangeLabel}.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartErrorBoundary title="Commitment tracking">
            <CommitmentChart data={commitmentData} />
          </ChartErrorBoundary>
        </CardContent>
      </Card>

      {/* Promise accountability */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Promise accountability</CardTitle>
          <CardDescription>How well you&apos;re keeping up with commitments you&apos;ve made.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartErrorBoundary title="Promise accountability">
            <PromiseAccountability
              keptRate={fulfillmentPct}
              overdueCount={overdueTotal}
              thisWeekCreated={thisWeekCreated}
              lastWeekCreated={lastWeekCreated}
              total30d={total30d}
            />
          </ChartErrorBoundary>
        </CardContent>
      </Card>

      {/* This week vs last week */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">This week vs last week</CardTitle>
          <CardDescription>Key metrics compared to the prior 7 days.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Triages',        thisVal: wow.thisTriages,  lastVal: wow.lastTriages,  lowerIsBetter: false },
              { label: 'Surfaced',       thisVal: wow.thisSurfaced, lastVal: wow.lastSurfaced, lowerIsBetter: false },
              { label: 'Tasks resolved', thisVal: wow.thisResolved, lastVal: wow.lastResolved, lowerIsBetter: false },
            ].map(({ label, thisVal, lastVal, lowerIsBetter }) => {
              const pct  = lastVal > 0 ? Math.round(((thisVal - lastVal) / lastVal) * 100) : null;
              const good = pct === null ? null : lowerIsBetter ? pct <= 0 : pct >= 0;
              return (
                <div key={label} className="space-y-1">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-semibold">{thisVal}</p>
                  <p className="text-xs text-muted-foreground">
                    {pct !== null ? (
                      <span className={good ? 'text-green-600 dark:text-green-400' : 'text-red-500'}>
                        {pct > 0 ? '+' : ''}{pct}%
                      </span>
                    ) : '—'}{' '}
                    {lastVal > 0 ? `vs ${lastVal}` : 'no prior data'}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Response time trend + distribution side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Response time trend</CardTitle>
            <CardDescription>
              Avg hours from triage surfacing to your reply — weeks with 2+ replies shown.
              {p90 !== null && (
                <span className="ml-1 font-medium text-foreground">
                  P90 {p90 < 24 ? `${p90.toFixed(0)}h` : `${(p90 / 24).toFixed(1)}d`}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartErrorBoundary title="Response time trend">
              <ResponseTimeChart data={responseTimeData} p90={p90} />
            </ChartErrorBoundary>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Response time distribution</CardTitle>
            <CardDescription>
              How your reply speed is distributed across time buckets — {rangeLabel}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartErrorBoundary title="Response time distribution">
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

      {/* Completion rate + sender table side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Commitment completion rate</CardTitle>
            <CardDescription>
              % of commitments resolved each week.
              {avgCompletionRate !== null && (
                <span className="ml-1 font-medium text-foreground">Avg {avgCompletionRate}%</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartErrorBoundary title="Completion rate">
              <CompletionRateChart data={completionRateData} avgRate={avgCompletionRate} />
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
  );
}
