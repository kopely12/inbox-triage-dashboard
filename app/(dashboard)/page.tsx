import { auth }           from '@/auth';
import { redirect }       from 'next/navigation';
import { getInboxHealth } from '@/app/actions/engagement';
import { supabaseAdmin }  from '@/lib/supabase';
import Link               from 'next/link';
import {
  MessageSquare, ListChecks, SlidersHorizontal,
  ArrowRight, ExternalLink, CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Overview — iinbox' };

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;

  const todayISO  = new Date().toISOString().slice(0, 10);
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = session.user.name?.split(' ')[0] ?? session.user.email?.split('@')[0] ?? 'there';

  const [
    healthResult,
    { data: openCommitments },
    { count: needsReplyCount },
    { count: needsFollowupCount },
    { data: lastTriageRows },
  ] = await Promise.all([
    getInboxHealth(),
    supabaseAdmin
      .from('commitments')
      .select('due_date, direction')
      .eq('user_id', userId)
      .eq('status', 'open'),
    supabaseAdmin
      .from('active_nr_threads')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active'),
    supabaseAdmin
      .from('waiting_items')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .not('status', 'in', '("resolved","dismissed")')
      .or(`snoozed_until.is.null,snoozed_until.lte.${new Date().toISOString().slice(0, 10)}`),
    supabaseAdmin
      .from('triage_sessions')
      .select('completed_at')
      .eq('user_id', userId)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1),
  ]);

  const health  = healthResult.health;
  const commits = openCommitments ?? [];

  const lastTriagedAt = lastTriageRows?.[0]?.completed_at ?? null;
  const lastTriagedLabel = (() => {
    if (!lastTriagedAt) return null;
    const diffMs  = Date.now() - new Date(lastTriagedAt).getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1)  return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24)   return `${diffH}h ago`;
    return new Date(lastTriagedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  })();

  const myPromise    = commits.filter((c) => c.direction === 'outgoing').length;
  const assignedToMe = commits.filter((c) => c.direction === 'assigned').length;
  const totalTasks   = myPromise + assignedToMe;
  const overdueCount = commits.filter((c) => c.due_date && c.due_date < todayISO).length;

  const lastScanDate  = health?.trend?.length ? health.trend[health.trend.length - 1].snapshot_date : null;
  const lastScanLabel = (() => {
    if (!lastScanDate) return null;
    if (lastScanDate === todayISO) return 'today';
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    if (lastScanDate === yesterday) return 'yesterday';
    return new Date(lastScanDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })();

  // Derived urgency states
  const composeTotalCount = (needsReplyCount ?? 0) + (needsFollowupCount ?? 0);
  const composeAllClear   = composeTotalCount === 0;
  const trackOnTrack      = overdueCount === 0;
  const topRec            = health?.recommendations?.[0];

  // Narrative header
  const summaryParts: string[] = [];
  if (overdueCount > 0)        summaryParts.push(`${overdueCount} task${overdueCount === 1 ? '' : 's'} overdue`);
  if (composeTotalCount > 0)   summaryParts.push(`${composeTotalCount} item${composeTotalCount === 1 ? '' : 's'} to compose`);
  const allCaughtUp = summaryParts.length === 0;

  // Flat stat lines (no pills)
  const composeStatParts = [
    (needsReplyCount ?? 0) > 0    ? `${needsReplyCount} need${needsReplyCount === 1 ? 's' : ''} a reply` : null,
    (needsFollowupCount ?? 0) > 0 ? `${needsFollowupCount} follow-up${needsFollowupCount === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ');

  const trackStatParts = [
    totalTasks > 0 ? `${totalTasks} total` : null,
    assignedToMe > 0 ? `${assignedToMe} assigned` : null,
    myPromise > 0 ? `${myPromise} my promise${myPromise === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-6">

      {/* Narrative header */}
      <div>
        <h2 className="text-xl font-semibold">{greeting}, {firstName}</h2>
        <p className="text-sm mt-0.5">
          {allCaughtUp
            ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">You&apos;re all caught up</span>
            : <span className="text-muted-foreground">{summaryParts.join(' · ')}</span>
          }
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* ── Compose ── */}
        <div className={cn(
          'rounded-2xl border p-6 flex flex-col gap-4',
          composeAllClear
            ? 'border-emerald-100 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40'
            : 'border-blue-100 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40',
        )}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-background/70">
              <MessageSquare className={cn('w-5 h-5', composeAllClear ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400')} />
            </div>
            <div>
              <h2 className="text-base font-semibold">Compose</h2>
              <p className={cn('text-xs font-medium', composeAllClear ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400')}>
                Know what needs you. Act in minutes.
              </p>
            </div>
          </div>

          <div className="flex-1 py-1">
            {composeAllClear ? (
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 dark:text-emerald-400 shrink-0" />
                <div>
                  <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">All clear</div>
                  <div className="text-sm text-muted-foreground">No emails need a reply</div>
                </div>
              </div>
            ) : (
              <div>
                <div className="text-5xl font-bold tabular-nums text-blue-700 dark:text-blue-300">{composeTotalCount}</div>
                <div className="text-sm font-medium text-muted-foreground mt-0.5">item{composeTotalCount === 1 ? '' : 's'} to compose</div>
              </div>
            )}
          </div>

          {/* Flat stats */}
          <div className="space-y-0.5 min-h-[40px]">
            {composeStatParts && (
              <p className="text-sm font-medium">{composeStatParts}</p>
            )}
            {lastTriagedLabel && (
              <p className="text-xs text-muted-foreground">Triaged {lastTriagedLabel}</p>
            )}
          </div>

          <div className={cn('h-px', composeAllClear ? 'bg-emerald-100 dark:bg-emerald-900' : 'bg-blue-100 dark:bg-blue-900')} />

          <a
            href={`https://mail.google.com/mail/u/${encodeURIComponent(session.user.email ?? '')}/`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex items-center gap-1.5 text-sm font-medium transition-colors',
              composeAllClear
                ? 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300'
                : 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300',
            )}
          >
            {composeAllClear
              ? <><span>Open Gmail</span><ExternalLink className="w-3.5 h-3.5" /></>
              : (needsReplyCount ?? 0) > 0
                ? <><span>Draft {needsReplyCount} repl{needsReplyCount === 1 ? 'y' : 'ies'}</span><ExternalLink className="w-3.5 h-3.5" /></>
                : <><span>Review {needsFollowupCount} follow-up{needsFollowupCount === 1 ? '' : 's'}</span><ExternalLink className="w-3.5 h-3.5" /></>
            }
          </a>
        </div>

        {/* ── Track ── */}
        <div className={cn(
          'rounded-2xl border p-6 flex flex-col gap-4',
          trackOnTrack
            ? 'border-emerald-100 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40'
            : 'border-red-100 dark:border-red-800 bg-red-50 dark:bg-red-950/40',
        )}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-background/70">
              <ListChecks className={cn('w-5 h-5', trackOnTrack ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')} />
            </div>
            <div>
              <h2 className="text-base font-semibold">Track</h2>
              <p className={cn('text-xs font-medium', trackOnTrack ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                Never drop a ball. Never miss a follow-up.
              </p>
            </div>
          </div>

          <div className="flex-1 py-1">
            {trackOnTrack ? (
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 dark:text-emerald-400 shrink-0" />
                <div>
                  <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">On track</div>
                  <div className="text-sm text-muted-foreground">{totalTasks} task{totalTasks === 1 ? '' : 's'}, none overdue</div>
                </div>
              </div>
            ) : (
              <div>
                <div className="text-5xl font-bold tabular-nums text-red-600 dark:text-red-400">{overdueCount}</div>
                <div className="text-sm font-medium text-muted-foreground mt-0.5">task{overdueCount === 1 ? '' : 's'} overdue</div>
              </div>
            )}
          </div>

          {/* Flat stats */}
          <div className="space-y-0.5 min-h-[40px]">
            {trackStatParts && (
              <p className="text-sm font-medium">{trackStatParts}</p>
            )}
          </div>

          <div className={cn('h-px', trackOnTrack ? 'bg-emerald-100 dark:bg-emerald-900' : 'bg-red-100 dark:bg-red-900')} />

          <Link
            href="/track"
            className={cn(
              'inline-flex items-center gap-1.5 text-sm font-medium transition-colors',
              trackOnTrack
                ? 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300'
                : 'text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300',
            )}
          >
            {trackOnTrack
              ? <><span>View tasks</span><ArrowRight className="w-3.5 h-3.5" /></>
              : <><span>Review {overdueCount} overdue</span><ArrowRight className="w-3.5 h-3.5" /></>
            }
          </Link>
        </div>

        {/* ── Tune ── */}
        <div className="rounded-2xl border border-violet-100 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-background/70">
              <SlidersHorizontal className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Tune</h2>
              <p className="text-xs font-medium text-violet-600 dark:text-violet-400">Tune out the noise, automatically.</p>
            </div>
          </div>

          <div className="flex-1 py-1">
            {health && health.score !== null ? (
              <div>
                {/* Score + grade — grade proportional to the number */}
                <div className="flex items-center gap-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-5xl font-bold tabular-nums">{health.score}</span>
                    <span className="text-base text-muted-foreground">/100</span>
                  </div>
                  <span className={cn(
                    'text-2xl font-black px-3 py-1 rounded-xl',
                    health.score >= 70
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : health.score >= 40
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
                  )}>
                    {health.grade}
                  </span>
                </div>
                {topRec && (
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    Top fix: {topRec.label}
                    {topRec.points_gained > 0 && (
                      <span className="ml-1.5 text-violet-600 dark:text-violet-400 font-medium">+{topRec.points_gained} pts</span>
                    )}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <div className="text-lg font-semibold text-muted-foreground">No score yet</div>
                <div className="text-sm text-muted-foreground mt-0.5">Run your first inbox analysis to see your Noise Score.</div>
              </div>
            )}
          </div>

          {/* Flat stats */}
          <div className="space-y-0.5 min-h-[40px]">
            {health && (
              <p className="text-sm font-medium">{health.metadata.noise_senders} noise senders</p>
            )}
            {lastScanLabel && (
              <p className="text-xs text-muted-foreground">Scanned {lastScanLabel}</p>
            )}
          </div>

          <div className="h-px bg-violet-100 dark:bg-violet-900" />

          <Link
            href="/sender-intelligence"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
          >
            {(health?.recommendations?.length ?? 0) > 0
              ? <><span>Apply {health!.recommendations.length} recommendation{health!.recommendations.length === 1 ? '' : 's'}</span><ArrowRight className="w-3.5 h-3.5" /></>
              : <><span>Open Tune</span><ArrowRight className="w-3.5 h-3.5" /></>
            }
          </Link>
        </div>

      </div>
    </div>
  );
}
