import { auth }         from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { redirect }      from 'next/navigation';
import Link              from 'next/link';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import { Badge }   from '@/components/ui/badge';
import { Button }  from '@/components/ui/button';
import { MarkDoneButton }         from '@/components/commitments/commitment-row-actions';
import { DismissWaitingButton }   from '@/components/overview/dismiss-waiting-button';
import { InboxHealthCard }        from '@/components/overview/inbox-health-score';
import { getInboxHealth }         from '@/app/actions/engagement';
import {
  CheckSquare, AlertTriangle, ArrowUpRight,
  Inbox, ExternalLink, CalendarDays, Timer, Clock, Zap, TrendingUp,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const ms   = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function extensionHealth(lastTriageAt: string | null): {
  label: string; detail: string; variant: 'default' | 'secondary' | 'destructive' | 'outline';
} {
  if (!lastTriageAt) return { label: 'Not connected', detail: 'No triage sessions found', variant: 'outline' };
  const daysAgo = (Date.now() - new Date(lastTriageAt).getTime()) / 86_400_000;
  if (daysAgo < 1) return { label: 'Active',   detail: `Last triage ${relativeTime(lastTriageAt)}`, variant: 'default'     };
  if (daysAgo < 3) return { label: 'Recent',   detail: `Last triage ${relativeTime(lastTriageAt)}`, variant: 'secondary'   };
  if (daysAgo < 7) return { label: 'Idle',     detail: `Last triage ${Math.round(daysAgo)}d ago`,   variant: 'secondary'   };
  return               { label: 'Inactive', detail: `Last triage ${Math.round(daysAgo)}d ago`,   variant: 'destructive' };
}

function gmailThreadUrl(threadId: string | null) {
  if (!threadId || threadId.startsWith('compose_') || threadId.startsWith('manual_')) return null;
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}

function pageSubtitle(
  overdue: number, dueThisWeek: number, resolvedThisWeek: number,
): string {
  if (overdue > 0) {
    const noun = overdue === 1 ? 'commitment' : 'commitments';
    return `${overdue} overdue ${noun} need${overdue === 1 ? 's' : ''} attention.`;
  }
  if (dueThisWeek > 0) {
    const noun    = dueThisWeek === 1 ? 'commitment' : 'commitments';
    const trailer = resolvedThisWeek > 0 ? ` · ${resolvedThisWeek} resolved this week.` : '.';
    return `${dueThisWeek} ${noun} due this week${trailer}`;
  }
  if (resolvedThisWeek > 0) {
    return `All caught up — ${resolvedThisWeek} resolved this week. Nice work.`;
  }
  return "Here's where things stand.";
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function OverviewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;

  const now   = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

  // End of current week (Sunday)
  const endOfWeek = new Date(today);
  const dow = today.getDay(); // 0 = Sunday
  endOfWeek.setDate(today.getDate() + (dow === 0 ? 0 : 7 - dow));

  // Start of current week (Monday)
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));

  // Start of prior week
  const startOfPriorWeek = new Date(startOfWeek);
  startOfPriorWeek.setDate(startOfWeek.getDate() - 7);

  const todayISO          = today.toISOString().slice(0, 10);
  const endOfWeekISO      = endOfWeek.toISOString().slice(0, 10);
  const sevenAgoISO       = sevenDaysAgo.toISOString();
  const startOfWeekISO    = startOfWeek.toISOString();
  const startOfPriorWeekISO = startOfPriorWeek.toISOString();

  const weekLabel = `${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${
    endOfWeek.toLocaleDateString('en-US', { day: 'numeric' })}`;

  // ── Parallel fetches (DB + health score) ─────────────────────────────────────
  const [
    { data: lastSession },
    { count: openCount },
    { count: overdueCount },
    { count: dueThisWeekCount },
    { count: resolvedThisWeekCount },
    { data: urgentItems },
    waitingCountResult,
    waitingItemsResult,
    { count: thisWeekCreatedCount },
    { count: lastWeekCreatedCount },
    healthResult,
  ] = await Promise.all([

    // Last triage session
    supabaseAdmin
      .from('triage_sessions')
      .select('triggered_at')
      .eq('user_id', userId)
      .order('triggered_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // All open commitments
    supabaseAdmin.from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'open'),

    // Overdue: explicit due_date in the past only (no scanned_at fallback)
    supabaseAdmin.from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'open')
      .not('due_date', 'is', null)
      .lt('due_date', todayISO),

    // Due this week (today → end of week)
    supabaseAdmin.from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'open')
      .gte('due_date', todayISO)
      .lte('due_date', endOfWeekISO),

    // Resolved in the last 7 days
    supabaseAdmin.from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'done')
      .gte('resolved_at', sevenAgoISO),

    // Urgent list: items with a due_date up to end of week (overdue + due soon)
    supabaseAdmin.from('commitments')
      .select('id, direction, description, counterparty, counterparty_email, due_date, thread_id, status')
      .eq('user_id', userId)
      .eq('status', 'open')
      .not('due_date', 'is', null)
      .lte('due_date', endOfWeekISO)
      .order('due_date', { ascending: true })
      .limit(6),

    // Waiting items — count only (graceful if table absent)
    supabaseAdmin.from('waiting_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active')
      .then((r) => r, () => ({ count: null, data: null, error: null })),

    // Waiting items — list (graceful if table or columns absent)
    supabaseAdmin.from('waiting_items')
      .select('id, subject, counterparty, thread_id, sent_at, created_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(5)
      .then((r) => r, () => ({ data: null, error: null })),

    // Commitments created this week (for WoW delta)
    supabaseAdmin.from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('scanned_at', startOfWeekISO),

    // Commitments created last week (for WoW delta)
    supabaseAdmin.from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('scanned_at', startOfPriorWeekISO)
      .lt('scanned_at', startOfWeekISO),

    // Inbox health score (computed from sender_engagement)
    getInboxHealth(),
  ]);

  const extensionStatus = extensionHealth(lastSession?.triggered_at ?? null);
  const waitingCount    = (waitingCountResult  as any)?.count ?? null;
  const waitingItems    = (waitingItemsResult  as any)?.data  ?? null;
  const thisWeekCreated = thisWeekCreatedCount ?? 0;
  const lastWeekCreated = lastWeekCreatedCount ?? 0;
  const inboxHealth     = healthResult?.health ?? null;
  const wowDelta        = lastWeekCreated > 0
    ? Math.round(((thisWeekCreated - lastWeekCreated) / lastWeekCreated) * 100)
    : null;

  // Categorise urgent items: overdue vs due-soon
  const urgentList = (urgentItems ?? [])
    .map((c: any) => ({ ...c, isOverdue: !!c.due_date && c.due_date < todayISO }))
    .sort((a: any, b: any) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      return (a.due_date ?? '').localeCompare(b.due_date ?? '');
    });

  const name        = session.user.name?.split(' ')[0] ?? 'there';
  const hasSession  = !!lastSession;

  const overdue          = overdueCount         ?? 0;
  const dueThisWeek      = dueThisWeekCount     ?? 0;
  const resolvedThisWeek = resolvedThisWeekCount ?? 0;

  const hasWeekActivity = overdue > 0 || dueThisWeek > 0 || resolvedThisWeek > 0 || (waitingCount ?? 0) > 0;

  // ── New user: onboarding as primary content ──────────────────────────────────
  if (!hasSession) {
    return (
      <div className="max-w-4xl space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Hey, {name}</h2>
          <p className="text-sm text-muted-foreground">Welcome — let's get you set up.</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Get started in 3 steps</CardTitle>
            <CardDescription>
              Inbox Triage works from a Chrome extension — the dashboard fills in automatically after your first scan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {[
                {
                  step: '1',
                  title: 'Install the Chrome extension',
                  detail: 'Add Inbox Triage from the Chrome Web Store.',
                  action: (
                    <a href="https://chromewebstore.google.com" target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                      Open Chrome Web Store <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ),
                },
                {
                  step: '2',
                  title: 'Open Gmail and run a triage',
                  detail: 'Click the extension icon, then press "Run triage" to scan your inbox.',
                  action: (
                    <a href="https://mail.google.com" target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                      Open Gmail <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ),
                },
                {
                  step: '3',
                  title: 'Come back here',
                  detail: 'Your commitments, activity stats, and analytics will appear after your first scan.',
                  action: null,
                },
              ].map(({ step, title, detail, action }) => (
                <li key={step} className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0 mt-0.5">
                    {step}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
                    {action}
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Returning user: full dashboard ───────────────────────────────────────────
  return (
    <div className="max-w-4xl space-y-6">

      {/* Greeting + inline extension health */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Hey, {name}</h2>
          <p className="text-sm text-muted-foreground">
            {pageSubtitle(overdue, dueThisWeek, resolvedThisWeek)}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
          <Zap className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Badge variant={extensionStatus.variant} className="text-[10px] py-0">{extensionStatus.label}</Badge>
          <span className="text-xs text-muted-foreground hidden sm:inline">{extensionStatus.detail}</span>
          {extensionStatus.variant === 'destructive' && (
            <a
              href="https://mail.google.com/?inbox_triage_run=1"
              target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              Run now
            </a>
          )}
        </div>
      </div>

      {/* Inbox Health Score */}
      {inboxHealth && inboxHealth.score !== null && (
        <InboxHealthCard health={inboxHealth} />
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">

        {/* Open */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted shrink-0">
                <CheckSquare className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Open</p>
                <p className="text-2xl font-semibold">{openCount ?? 0}</p>
                {resolvedThisWeek > 0 ? (
                  <p className="text-xs text-green-600 dark:text-green-400">
                    ↓ {resolvedThisWeek} resolved this week
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">all open commitments</p>
                )}
                {thisWeekCreated > 0 && (
                  <p className={[
                    'text-xs mt-0.5',
                    wowDelta !== null && wowDelta > 0 ? 'text-amber-600 dark:text-amber-400' :
                    wowDelta !== null && wowDelta < 0 ? 'text-green-600 dark:text-green-400' :
                    'text-muted-foreground',
                  ].join(' ')}>
                    {wowDelta !== null
                      ? `${wowDelta > 0 ? '+' : ''}${wowDelta}% vs last week`
                      : `${thisWeekCreated} new this week`}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overdue */}
        <Card className={overdue > 0 ? 'border-red-200 dark:border-red-900' : ''}>
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <div className={[
                'flex items-center justify-center w-8 h-8 rounded-md shrink-0',
                overdue > 0 ? 'bg-red-50 dark:bg-red-950' : 'bg-muted',
              ].join(' ')}>
                <AlertTriangle className={[
                  'w-4 h-4',
                  overdue > 0 ? 'text-red-500' : 'text-muted-foreground',
                ].join(' ')} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Overdue</p>
                <p className={[
                  'text-2xl font-semibold',
                  overdue > 0 ? 'text-red-600 dark:text-red-400' : '',
                ].join(' ')}>{overdue}</p>
                <p className="text-xs text-muted-foreground">
                  {overdue > 0 ? 'need attention' : 'all on track'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Due this week */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted shrink-0">
                <CalendarDays className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Due this week</p>
                <p className="text-2xl font-semibold">{dueThisWeek}</p>
                <p className="text-xs text-muted-foreground">
                  by {endOfWeek.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 flex-wrap">
        <Button asChild variant="default" size="sm" className="gap-1.5">
          <a href="https://mail.google.com/?inbox_triage_run=1" target="_blank" rel="noopener noreferrer">
            <Inbox className="w-3.5 h-3.5" /> Run Triage
          </a>
        </Button>
        {overdue > 0 && (
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/commitments?status=overdue">
              <AlertTriangle className="w-3.5 h-3.5" /> Review {overdue} overdue
            </Link>
          </Button>
        )}
        {dueThisWeek > 0 && (
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/commitments?status=open&sort=due">
              <CalendarDays className="w-3.5 h-3.5" /> View due this week
            </Link>
          </Button>
        )}
      </div>

      {/* My Week */}
      {hasWeekActivity && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-muted-foreground" />
                  This week
                </CardTitle>
                <CardDescription>
                  {weekLabel} · Sorted by urgency: overdue first, then earliest due date
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
                <Link href="/commitments">View all <ArrowUpRight className="w-3 h-3" /></Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">

            {/* Stat chips */}
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm pb-3 border-b border-border">
              {overdue > 0 && (
                <Link href="/commitments?status=overdue"
                  className="flex items-center gap-1.5 text-red-600 dark:text-red-400 hover:underline">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <strong>{overdue}</strong> overdue
                </Link>
              )}
              {dueThisWeek > 0 && (
                <Link href="/commitments?status=open&sort=due"
                  className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 hover:underline">
                  <Timer className="w-3.5 h-3.5" />
                  <strong>{dueThisWeek}</strong> due by {endOfWeek.toLocaleDateString('en-US', { weekday: 'short' })}
                </Link>
              )}
              {resolvedThisWeek > 0 && (
                <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                  <CheckSquare className="w-3.5 h-3.5" />
                  <strong>{resolvedThisWeek}</strong> resolved
                </span>
              )}
              {waitingCount !== null && waitingCount > 0 && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  <strong className="text-foreground">{waitingCount}</strong> waiting on replies
                </span>
              )}
            </div>

            {/* Urgent list — actions always visible */}
            {urgentList.length > 0 && (
              <div className="divide-y divide-border">
                {urgentList.map((c: any) => {
                  const counterparty = c.counterparty || c.counterparty_email || '—';
                  const gmail        = gmailThreadUrl(c.thread_id);
                  const dueDateLabel = c.due_date
                    ? new Date(c.due_date + 'T00:00:00').toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric',
                      })
                    : null;

                  return (
                    <div key={c.id} className="flex items-start gap-3 py-2.5">
                      <span className="mt-0.5 shrink-0">
                        {c.isOverdue
                          ? <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                          : <Timer        className="w-3.5 h-3.5 text-amber-500" />}
                      </span>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{c.description}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>
                            {c.direction === 'outgoing' ? 'To' : 'From'}{' '}
                            <span className="font-medium text-foreground">{counterparty}</span>
                          </span>
                          {dueDateLabel && (
                            <span className={
                              c.isOverdue
                                ? 'text-red-500 font-medium'
                                : 'text-amber-600 dark:text-amber-400'
                            }>
                              Due {dueDateLabel}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Always visible — no hover-only opacity */}
                      <div className="flex items-center gap-1 shrink-0">
                        {gmail && (
                          <Button asChild variant="ghost" size="icon-sm" title="View in Gmail">
                            <a href={gmail} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </Button>
                        )}
                        <MarkDoneButton id={c.id} status={c.status} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Waiting on replies */}
      {waitingItems && waitingItems.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Waiting on replies
            </CardTitle>
            <CardDescription>
              Emails you've sent where a reply is still expected.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y divide-border">
              {waitingItems.map((w: any) => {
                const gmail = gmailThreadUrl(w.thread_id);
                const since = w.sent_at || w.created_at;

                return (
                  <div key={w.id} className="flex items-start gap-3 py-2.5">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{w.subject ?? '(no subject)'}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        {w.counterparty && (
                          <span>
                            Waiting on{' '}
                            <span className="font-medium text-foreground">{w.counterparty}</span>
                          </span>
                        )}
                        {since && <span>{relativeTime(since)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {gmail && (
                        <Button asChild variant="ghost" size="icon-sm" title="View in Gmail">
                          <a href={gmail} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </Button>
                      )}
                      <DismissWaitingButton id={w.id} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
