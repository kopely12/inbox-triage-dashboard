import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ActivityChart,     type ActivityPoint }     from '@/components/analytics/activity-chart';
import { CommitmentChart,   type CommitmentPoint }   from '@/components/analytics/commitment-chart';
import { SurfacingRateChart, type SurfacingPoint }   from '@/components/analytics/surfacing-rate-chart';
import { DayPatternChart,   type DayPoint }          from '@/components/analytics/day-pattern-chart';
import { RangeToggle,       type Range }             from '@/components/analytics/range-toggle';
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

const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0] as const; // Mon → Sun
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
  const validRange = (['4w', '12w', '6m'] as const).includes(range as Range) ? (range as Range) : '12w';
  const WEEKS = validRange === '4w' ? 4 : validRange === '6m' ? 26 : 12;

  const weeksAgo = new Date();
  weeksAgo.setUTCDate(weeksAgo.getUTCDate() - WEEKS * 7);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

  // ── fetch ─────────────────────────────────────────────────────────────────
  const [
    { data: sessionsRaw },
    { data: commitmentsRaw },
    { data: openResult },
    { data: allTimeResult },
  ] = await Promise.all([
    supabaseAdmin
      .from('triage_sessions')
      .select('triggered_at, emails_scanned, emails_surfaced')
      .eq('user_id', userId)
      .gte('triggered_at', weeksAgo.toISOString()),

    supabaseAdmin
      .from('commitments')
      .select('scanned_at, resolved_at, status')
      .eq('user_id', userId)
      .eq('direction', 'outgoing')
      .gte('scanned_at', weeksAgo.toISOString()),

    supabaseAdmin
      .from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'open')
      .eq('direction', 'outgoing'),

    supabaseAdmin
      .from('triage_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
  ]);

  const sessions    = sessionsRaw    ?? [];
  const commitments = commitmentsRaw ?? [];

  // ── 30-day overview stats ─────────────────────────────────────────────────
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();
  const sessions30d      = sessions.filter((s) => s.triggered_at >= thirtyDaysAgoISO);
  const triages30d       = sessions30d.length;
  const scanned30d       = sessions30d.reduce((a, s) => a + (s.emails_scanned  ?? 0), 0);
  const surfaced30d      = sessions30d.reduce((a, s) => a + (s.emails_surfaced ?? 0), 0);
  const surfacingAvg30d  = scanned30d > 0 ? Math.round((surfaced30d / scanned30d) * 100) : null;

  const commitments30d = commitments.filter((c) => c.scanned_at >= thirtyDaysAgoISO);
  const resolved30d    = commitments30d.filter((c) => c.status === 'done').length;
  const total30d       = commitments30d.length;
  const fulfillmentPct = total30d >= 5 ? Math.round((resolved30d / total30d) * 100) : null;

  const openCount      = (openResult    as unknown as { count: number } | null)?.count ?? 0;
  const allTimeTriages = (allTimeResult as unknown as { count: number } | null)?.count ?? 0;

  // ── weekly buckets ────────────────────────────────────────────────────────
  const weeks = buildWeeks(WEEKS);

  // Activity chart
  const activityMap = new Map(weeks.map(({ key }) => [key, { sessions: 0, scanned: 0, surfaced: 0 }]));
  sessions.forEach((s) => {
    const b = activityMap.get(toMondayKey(s.triggered_at));
    if (b) { b.sessions += 1; b.scanned += s.emails_scanned ?? 0; b.surfaced += s.emails_surfaced ?? 0; }
  });
  const activityData: ActivityPoint[] = weeks.map(({ key, label }) => ({ label, ...activityMap.get(key)! }));

  // Commitment chart
  const commitmentMap = new Map(weeks.map(({ key }) => [key, { created: 0, resolved: 0 }]));
  commitments.forEach((c) => {
    const cb = commitmentMap.get(toMondayKey(c.scanned_at));
    if (cb) cb.created += 1;
    if (c.status === 'done' && c.resolved_at) {
      const rb = commitmentMap.get(toMondayKey(c.resolved_at));
      if (rb) rb.resolved += 1;
    }
  });
  const commitmentData: CommitmentPoint[] = weeks.map(({ key, label }) => ({ label, ...commitmentMap.get(key)! }));

  // Surfacing rate chart
  const surfacingRateData: SurfacingPoint[] = weeks.map(({ key, label }) => {
    const b = activityMap.get(key)!;
    return {
      label,
      rate: b.scanned > 0 ? Math.round((b.surfaced / b.scanned) * 100) : null,
    };
  });
  const ratePoints   = surfacingRateData.filter((d) => d.rate !== null);
  const overallAvgRate = ratePoints.length > 0
    ? Math.round(ratePoints.reduce((a, d) => a + d.rate!, 0) / ratePoints.length)
    : null;

  // Day-of-week chart
  const dowMap = new Map<number, number>([[0, 0],[1, 0],[2, 0],[3, 0],[4, 0],[5, 0],[6, 0]]);
  sessions.forEach((s) => {
    const dow = new Date(s.triggered_at).getUTCDay();
    dowMap.set(dow, (dowMap.get(dow) ?? 0) + 1);
  });
  const dayData: DayPoint[] = DOW_ORDER.map((dow) => ({
    day:      DOW_LABELS[dow],
    sessions: dowMap.get(dow) ?? 0,
  }));

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
            Emails scanned and surfaced per week — last {validRange === '6m' ? '6 months' : validRange === '4w' ? '4 weeks' : '12 weeks'}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityChart data={activityData} />
        </CardContent>
      </Card>

      {/* Surfacing rate + Day pattern side by side on large screens */}
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
            <SurfacingRateChart data={surfacingRateData} avgRate={overallAvgRate} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Triage by day of week</CardTitle>
            <CardDescription>Which days you run the extension most — last {validRange === '6m' ? '6 months' : validRange === '4w' ? '4 weeks' : '12 weeks'}.</CardDescription>
          </CardHeader>
          <CardContent>
            <DayPatternChart data={dayData} />
          </CardContent>
        </Card>
      </div>

      {/* Commitment tracking */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Commitment tracking</CardTitle>
          <CardDescription>Outgoing commitments created vs. resolved per week.</CardDescription>
        </CardHeader>
        <CardContent>
          <CommitmentChart data={commitmentData} />
        </CardContent>
      </Card>

    </div>
  );
}
