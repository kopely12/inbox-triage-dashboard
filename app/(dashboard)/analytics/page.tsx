import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ActivityChart, type ActivityPoint }     from '@/components/analytics/activity-chart';
import { CommitmentChart, type CommitmentPoint } from '@/components/analytics/commitment-chart';
import { Inbox, Mail, CheckSquare, TrendingUp } from 'lucide-react';

// ─── date helpers ────────────────────────────────────────────────────────────

/** ISO date string (YYYY-MM-DD) for the Monday that owns a given date. */
function toMondayKey(dateStr: string): string {
  const d = new Date(dateStr);
  const dow = d.getUTCDay(); // 0 = Sun
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Build an ordered array of the last `n` Monday keys + short labels. */
function buildWeeks(n: number): { key: string; label: string }[] {
  const result: { key: string; label: string }[] = [];
  const now = new Date();
  const dow = now.getUTCDay();
  const thisMonday = new Date(now);
  thisMonday.setUTCDate(now.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  thisMonday.setUTCHours(0, 0, 0, 0);

  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(thisMonday);
    d.setUTCDate(thisMonday.getUTCDate() - i * 7);
    result.push({
      key:   d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    });
  }
  return result;
}

// ─── page ────────────────────────────────────────────────────────────────────

export default async function AnalyticsPage() {
  const session = await auth();
  const userId  = session!.user.id;

  const WEEKS        = 12;
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setUTCDate(twelveWeeksAgo.getUTCDate() - WEEKS * 7);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

  // Fetch raw data in parallel
  const [
    { data: sessions12w },
    { data: commitments12w },
    { data: openCommitmentsResult },
    { data: allTimeSessionsResult },
  ] = await Promise.all([
    supabaseAdmin
      .from('triage_sessions')
      .select('triggered_at, emails_scanned, emails_surfaced')
      .eq('user_id', userId)
      .gte('triggered_at', twelveWeeksAgo.toISOString()),

    supabaseAdmin
      .from('commitments')
      .select('scanned_at, resolved_at, status')
      .eq('user_id', userId)
      .eq('direction', 'outgoing')
      .gte('scanned_at', twelveWeeksAgo.toISOString()),

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

  const sessions    = sessions12w    ?? [];
  const commitments = commitments12w ?? [];

  // ── 30-day overview stats ─────────────────────────────────────────────────
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

  const sessions30d   = sessions.filter((s) => s.triggered_at >= thirtyDaysAgoISO);
  const triages30d    = sessions30d.length;
  const scanned30d    = sessions30d.reduce((a, s) => a + (s.emails_scanned  ?? 0), 0);
  const surfaced30d   = sessions30d.reduce((a, s) => a + (s.emails_surfaced ?? 0), 0);

  const commitments30d = commitments.filter((c) => c.scanned_at >= thirtyDaysAgoISO);
  const resolved30d    = commitments30d.filter((c) => c.status === 'done').length;
  const total30d       = commitments30d.length;
  const fulfillmentPct = total30d >= 5
    ? Math.round((resolved30d / total30d) * 100)
    : null;

  const openCount      = (openCommitmentsResult as unknown as { count: number } | null)?.count ?? 0;
  const allTimeTriages = (allTimeSessionsResult  as unknown as { count: number } | null)?.count ?? 0;

  // ── weekly buckets ────────────────────────────────────────────────────────
  const weeks = buildWeeks(WEEKS);

  // Activity chart
  const activityMap = new Map<string, { sessions: number; scanned: number; surfaced: number }>();
  weeks.forEach(({ key }) => activityMap.set(key, { sessions: 0, scanned: 0, surfaced: 0 }));
  sessions.forEach((s) => {
    const key = toMondayKey(s.triggered_at);
    const bucket = activityMap.get(key);
    if (bucket) {
      bucket.sessions += 1;
      bucket.scanned  += s.emails_scanned  ?? 0;
      bucket.surfaced += s.emails_surfaced ?? 0;
    }
  });

  const activityData: ActivityPoint[] = weeks.map(({ key, label }) => ({
    label,
    ...activityMap.get(key)!,
  }));

  // Commitment chart
  const commitmentMap = new Map<string, { created: number; resolved: number }>();
  weeks.forEach(({ key }) => commitmentMap.set(key, { created: 0, resolved: 0 }));
  commitments.forEach((c) => {
    const createdKey = toMondayKey(c.scanned_at);
    const bucket = commitmentMap.get(createdKey);
    if (bucket) bucket.created += 1;

    if (c.status === 'done' && c.resolved_at) {
      const resolvedKey = toMondayKey(c.resolved_at);
      const rb = commitmentMap.get(resolvedKey);
      if (rb) rb.resolved += 1;
    }
  });

  const commitmentData: CommitmentPoint[] = weeks.map(({ key, label }) => ({
    label,
    ...commitmentMap.get(key)!,
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
      value: fulfillmentPct !== null ? `${fulfillmentPct}%` : total30d > 0 ? `${resolved30d}/${total30d}` : '—',
      sub:   fulfillmentPct !== null
        ? `${resolved30d} of ${total30d} resolved`
        : total30d === 0 ? 'No outgoing commitments' : 'Need 5+ to show %',
      icon:  TrendingUp,
    },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Analytics</h2>
        <p className="text-sm text-muted-foreground">Your triage and commitment activity over time.</p>
      </div>

      {/* Overview tiles */}
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

      {/* Activity chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Email activity</CardTitle>
          <CardDescription>Emails scanned and surfaced per week over the last 12 weeks.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityChart data={activityData} />
        </CardContent>
      </Card>

      {/* Commitment chart */}
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
