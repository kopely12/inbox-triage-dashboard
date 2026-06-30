import { auth }         from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { redirect }      from 'next/navigation';

import type { Range }            from '@/components/analytics/range-toggle';
import type { CommitmentDataset } from '@/components/analytics/commitments-section';
import type { CommitmentPoint }  from '@/components/analytics/commitment-chart';
import type { AgeBucket }        from '@/components/analytics/commitment-age-chart';
import type { SenderRow }        from '@/components/analytics/sender-table';
import type { InboxHealthData }  from '@/components/analytics/inbox-health-tab';
import { Card, CardContent }     from '@/components/ui/card';
import { AnalyticsClient }       from '@/components/analytics/analytics-client';
import { getInboxVolume }        from '@/app/actions/engagement';

export const metadata = { title: 'Analytics — iinbox' };

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
  const keptRate = inRange.length >= 3
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
    { data: outgoingInRangeRaw },
    { data: outgoingOpenAllRaw },
    { data: outgoingSenderRaw  },
    { data: assignedInRangeRaw },
    { data: assignedOpenAllRaw },
    { data: assignedSenderRaw  },
    { data: noiseSnapshotsRaw  },
    { data: cleanupRaw        },
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

    // Cleanup stats — senders unsubscribed or auto-archived
    safe(supabaseAdmin
      .from('sender_engagement')
      .select('emails_received, period_days, unsubscribe_status, auto_archive_enabled')
      .eq('user_id', userId)
      .or('unsubscribe_status.eq.unsubscribed,auto_archive_enabled.eq.true'), []),

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

  const outgoingInRange = outgoingInRangeRaw ?? [];

  // ── Weekly buckets ────────────────────────────────────────────────────────
  const weeks = buildWeeks(effectiveWeeks);

  // ── Noise trend ───────────────────────────────────────────────────────────
  const noiseTrendData: import('@/components/analytics/noise-trend-chart').NoiseTrendPoint[] =
    (noiseSnapshotsRaw ?? []).map((s: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      date:       s.snapshot_date as string,
      noiseScore: s.noise_score   as number,
    }));

  // ── Commitment datasets ───────────────────────────────────────────────────
  const outgoingDataset = computeCommitmentDataset(
    outgoingInRangeRaw ?? [], outgoingOpenAllRaw ?? [], outgoingSenderRaw ?? [],
    weeks, thisWeekStartISO, lastWeekStartISO, lastWeekEndISO, midPointISO, todayISO, rangeLabel,
  );
  const assignedDataset = computeCommitmentDataset(
    assignedInRangeRaw ?? [], assignedOpenAllRaw ?? [], assignedSenderRaw ?? [],
    weeks, thisWeekStartISO, lastWeekStartISO, lastWeekEndISO, midPointISO, todayISO, rangeLabel,
  );

  // ── Inbox Health data ─────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cleanupSenders = (cleanupRaw ?? []) as any[];
  const unsubscribedCount = cleanupSenders.filter((s) => s.unsubscribe_status === 'unsubscribed').length;
  const autoArchivedOnlyCount = cleanupSenders.filter(
    (s) => s.auto_archive_enabled && s.unsubscribe_status !== 'unsubscribed',
  ).length;
  const cleanedCount             = unsubscribedCount + autoArchivedOnlyCount;
  const emailsPerMonthEliminated = Math.round(
    cleanupSenders.reduce((n, s) => n + (s.emails_received / (s.period_days || 90)) * 30, 0),
  );

  const latestSnapshot   = (noiseSnapshotsRaw ?? []).at(-1) as { noise_score: number } | undefined;
  const earliestSnapshot = (noiseSnapshotsRaw ?? [])[0]     as { noise_score: number } | undefined;
  const toNoisePct       = (score: number) => Math.round(((25 - score) / 25) * 100);
  const currentNoisePct  = latestSnapshot   ? toNoisePct(latestSnapshot.noise_score)   : null;
  const earliestNoisePct = earliestSnapshot ? toNoisePct(earliestSnapshot.noise_score) : null;
  const noisePctChange   = currentNoisePct !== null && earliestNoisePct !== null
    ? currentNoisePct - earliestNoisePct : null;

  const volumeGranularity = validRange === '4w' ? 'weekly' : 'monthly';
  const volumeMonths =
    validRange === '4w'  ? 1  :
    validRange === '12w' ? 3  :
    validRange === '6m'  ? 6  : undefined;
  const volumeData = await getInboxVolume(volumeGranularity, volumeMonths);

  const inboxHealthData: InboxHealthData = {
    cleanedCount,
    unsubscribedCount,
    emailsPerMonthEliminated,
    currentNoisePct,
    noisePctChange,
    noiseTrendData,
    volumeData,
    rangeLabel,
  };

  return (
    <AnalyticsClient
      validRange={validRange}
      rangeLabel={rangeLabel}
      inboxHealthData={inboxHealthData}
      outgoingDataset={outgoingDataset}
      assignedDataset={assignedDataset}
    />
  );
}
