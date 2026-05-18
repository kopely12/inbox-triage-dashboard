import { auth }         from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { redirect }      from 'next/navigation';
import Link              from 'next/link';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import { Badge }   from '@/components/ui/badge';
import { Button }  from '@/components/ui/button';
import {
  CheckSquare, Clock, AlertTriangle, ArrowUpRight,
  Inbox, ExternalLink, BarChart2, Zap,
} from 'lucide-react';

// ─── helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const ms   = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 2)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function extensionHealth(lastTriageAt: string | null): {
  label: string; detail: string; variant: 'default' | 'secondary' | 'destructive' | 'outline';
} {
  if (!lastTriageAt) {
    return { label: 'Not connected', detail: 'No triage sessions found', variant: 'outline' };
  }
  const daysAgo = (Date.now() - new Date(lastTriageAt).getTime()) / 86_400_000;
  if (daysAgo < 1)  return { label: 'Active',         detail: `Last triage ${relativeTime(lastTriageAt)}`,      variant: 'default' };
  if (daysAgo < 3)  return { label: 'Recent',         detail: `Last triage ${relativeTime(lastTriageAt)}`,      variant: 'secondary' };
  if (daysAgo < 7)  return { label: 'Idle',           detail: `Last triage ${Math.round(daysAgo)}d ago`,         variant: 'secondary' };
  return               { label: 'Inactive',         detail: `Last triage ${Math.round(daysAgo)}d ago`,         variant: 'destructive' };
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function OverviewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;

  const overdueThreshold = new Date();
  overdueThreshold.setUTCDate(overdueThreshold.getUTCDate() - 14);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

  const [
    { data: lastSession },
    { count: openCount },
    { count: overdueCount },
    { data: recentCommitments },
    { data: sessionStats },
  ] = await Promise.all([
    // Most recent triage session
    supabaseAdmin
      .from('triage_sessions')
      .select('triggered_at, emails_scanned, emails_surfaced')
      .eq('user_id', userId)
      .order('triggered_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Open commitment count
    supabaseAdmin
      .from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'open'),

    // Overdue count
    supabaseAdmin
      .from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'open')
      .or(`due_date.lt.${new Date().toISOString().slice(0, 10)},scanned_at.lte.${overdueThreshold.toISOString()}`),

    // Recent commitment activity
    supabaseAdmin
      .from('commitments')
      .select('id, direction, description, status, scanned_at, resolved_at, counterparty, counterparty_email')
      .eq('user_id', userId)
      .order('scanned_at', { ascending: false })
      .limit(6),

    // 30-day triage stats
    supabaseAdmin
      .from('triage_sessions')
      .select('emails_scanned, emails_surfaced')
      .eq('user_id', userId)
      .gte('triggered_at', thirtyDaysAgo.toISOString()),
  ]);

  const health = extensionHealth(lastSession?.triggered_at ?? null);

  const scanned30d  = (sessionStats ?? []).reduce((a: number, s: any) => a + (s.emails_scanned  ?? 0), 0);
  const surfaced30d = (sessionStats ?? []).reduce((a: number, s: any) => a + (s.emails_surfaced ?? 0), 0);
  const triages30d  = (sessionStats ?? []).length;

  const name = session.user.name?.split(' ')[0] ?? 'there';

  return (
    <div className="max-w-3xl space-y-6">

      {/* Greeting */}
      <div>
        <h2 className="text-lg font-semibold">Hey, {name}</h2>
        <p className="text-sm text-muted-foreground">
          {lastSession ? "Here's where things stand." : "Welcome to Inbox Triage — let's get you set up."}
        </p>
      </div>

      {/* Status row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">

        {/* Extension health */}
        <Card className="col-span-2 sm:col-span-2">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted shrink-0">
                <Zap className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Extension</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant={health.variant} className="text-[10px] py-0">{health.label}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{health.detail}</p>
                {!lastSession && (
                  <a
                    href="https://chromewebstore.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                  >
                    Install extension <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Open commitments */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted shrink-0">
                <CheckSquare className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Open</p>
                <p className="text-2xl font-semibold">{openCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">commitments</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overdue */}
        <Card className={(overdueCount ?? 0) > 0 ? 'border-red-200 dark:border-red-900' : ''}>
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <div className={[
                'flex items-center justify-center w-8 h-8 rounded-md shrink-0',
                (overdueCount ?? 0) > 0 ? 'bg-red-50 dark:bg-red-950' : 'bg-muted',
              ].join(' ')}>
                <AlertTriangle className={[
                  'w-4 h-4',
                  (overdueCount ?? 0) > 0 ? 'text-red-500' : 'text-muted-foreground',
                ].join(' ')} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Overdue</p>
                <p className={[
                  'text-2xl font-semibold',
                  (overdueCount ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : '',
                ].join(' ')}>{overdueCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">commitments</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <div className="flex gap-3 flex-wrap">
        <Button asChild variant="default" size="sm" className="gap-1.5">
          <a href="https://mail.google.com/?inbox_triage_run=1" target="_blank" rel="noopener noreferrer">
            <Inbox className="w-3.5 h-3.5" />
            Run Triage
          </a>
        </Button>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/commitments?status=overdue">
            <AlertTriangle className="w-3.5 h-3.5" />
            Review overdue
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/analytics">
            <BarChart2 className="w-3.5 h-3.5" />
            Analytics
          </Link>
        </Button>
      </div>

      {/* New-user onboarding — shown until the first triage session fires */}
      {!lastSession && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Get started in 3 steps</CardTitle>
            <CardDescription>
              Inbox Triage works from a Chrome extension that reads your Gmail — the dashboard
              fills in automatically once you run your first scan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {[
                {
                  icon: ExternalLink,
                  step: '1',
                  title: 'Install the Chrome extension',
                  detail: 'Add Inbox Triage from the Chrome Web Store.',
                  action: (
                    <a
                      href="https://chromewebstore.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                    >
                      Open Chrome Web Store <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ),
                },
                {
                  icon: Inbox,
                  step: '2',
                  title: 'Open Gmail and run a triage',
                  detail: 'Click the extension icon in your toolbar, then press "Run triage" to scan your inbox.',
                  action: (
                    <a
                      href="https://mail.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                    >
                      Open Gmail <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ),
                },
                {
                  icon: Clock,
                  step: '3',
                  title: 'Come back here',
                  detail: 'Your commitments, activity stats, and analytics will appear on this dashboard after your first scan.',
                  action: null,
                },
              ].map(({ icon: Icon, step, title, detail, action }) => (
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
      )}

      {/* 30-day triage summary */}
      {triages30d > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Last 30 days</CardTitle>
            <CardDescription>Triage activity from the extension.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Triages',        value: triages30d },
                { label: 'Emails scanned', value: scanned30d.toLocaleString() },
                { label: 'Surfaced',       value: surfaced30d.toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-semibold mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent commitment activity */}
      {(recentCommitments ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-medium">Recent commitments</CardTitle>
              <CardDescription>Latest promises detected by the extension.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
              <Link href="/commitments">
                View all <ArrowUpRight className="w-3 h-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y divide-border">
              {(recentCommitments ?? []).map((c: any) => {
                const counterparty = c.counterparty || c.counterparty_email || '—';
                return (
                  <div key={c.id} className="flex items-start gap-3 py-3">
                    <span
                      className="mt-0.5 shrink-0"
                      title={c.direction === 'outgoing' ? 'Your promise' : 'Assigned to you'}
                    >
                      <ArrowUpRight
                        className={[
                          'w-3.5 h-3.5',
                          c.direction === 'outgoing'
                            ? 'text-blue-500 dark:text-blue-400'
                            : 'rotate-180 text-amber-500 dark:text-amber-400',
                        ].join(' ')}
                      />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={[
                        'text-sm truncate',
                        c.status === 'done' ? 'line-through text-muted-foreground' : '',
                      ].join(' ')}>
                        {c.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.direction === 'outgoing' ? 'To' : 'From'} {counterparty}
                        {' · '}
                        {relativeTime(c.scanned_at)}
                      </p>
                    </div>
                    {c.status === 'done' && (
                      <Badge variant="secondary" className="text-[10px] py-0 shrink-0">Done</Badge>
                    )}
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
