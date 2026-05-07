import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { EditName } from '@/components/account/edit-name';
import { Mail, Inbox, CheckSquare, Clock } from 'lucide-react';

export default async function AccountPage() {
  const session = await auth();
  const userId  = session!.user.id;

  // Fetch user record and usage stats in parallel
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartISO = monthStart.toISOString();

  const [
    { data: user },
    { data: sessions },
    { data: openCommitments },
    { data: resolvedCommitments },
    { data: lastTriage },
  ] = await Promise.all([
    supabaseAdmin.from('users').select('*').eq('id', userId).single(),

    // Triage sessions this month
    supabaseAdmin
      .from('triage_sessions')
      .select('emails_scanned, emails_surfaced')
      .eq('user_id', userId)
      .gte('triggered_at', monthStartISO),

    // Open commitments
    supabaseAdmin
      .from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'open')
      .eq('direction', 'outgoing'),

    // Commitments resolved this month
    supabaseAdmin
      .from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'done')
      .gte('resolved_at', monthStartISO),

    // Most recent triage session
    supabaseAdmin
      .from('triage_sessions')
      .select('triggered_at')
      .eq('user_id', userId)
      .order('triggered_at', { ascending: false })
      .limit(1)
      .single(),
  ]);

  const name     = user?.name ?? session!.user.name ?? '—';
  const email    = user?.email ?? session!.user.email ?? '—';
  const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const plan     = user?.plan_tier ?? 'free';
  const joined   = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—';

  const sessionCount    = sessions?.length ?? 0;
  const emailsScanned   = sessions?.reduce((s, r) => s + (r.emails_scanned  ?? 0), 0) ?? 0;
  const emailsSurfaced  = sessions?.reduce((s, r) => s + (r.emails_surfaced ?? 0), 0) ?? 0;
  const openCount       = (openCommitments as unknown as { count: number } | null)?.count
                          ?? openCommitments?.length ?? 0;
  const resolvedCount   = (resolvedCommitments as unknown as { count: number } | null)?.count
                          ?? resolvedCommitments?.length ?? 0;

  const lastTriageDate = lastTriage?.triggered_at
    ? new Date(lastTriage.triggered_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    : 'Never';

  const monthName = monthStart.toLocaleString('en-US', { month: 'long' });

  const stats = [
    {
      label: 'Triages in ' + monthName,
      value: sessionCount,
      sub:   `${emailsScanned.toLocaleString()} emails scanned`,
      icon:  Inbox,
    },
    {
      label: 'Emails surfaced',
      value: emailsSurfaced.toLocaleString(),
      sub:   'prioritised this month',
      icon:  Mail,
    },
    {
      label: 'Commitments resolved',
      value: resolvedCount,
      sub:   `${openCount} still open`,
      icon:  CheckSquare,
    },
    {
      label: 'Last triage',
      value: lastTriageDate,
      sub:   null,
      icon:  Clock,
      wide:  true,
    },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Account</h2>
        <p className="text-sm text-muted-foreground">Your profile and usage.</p>
      </div>

      {/* Profile card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium">Profile</CardTitle>
          <CardDescription>Synced from your Google account. Hover your name to edit it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="w-14 h-14">
              <AvatarImage src={session!.user.image ?? ''} />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-0.5">
              <EditName currentName={name} />
              <p className="text-sm text-muted-foreground">{email}</p>
            </div>
          </div>

          <Separator />

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="mt-0.5">
                <Badge variant={plan === 'pro' ? 'default' : 'secondary'} className="capitalize">
                  {plan}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Member since</dt>
              <dd className="mt-0.5 font-medium">{joined}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Role</dt>
              <dd className="mt-0.5 font-medium capitalize">{user?.org_role ?? 'member'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Google ID</dt>
              <dd className="mt-0.5 font-mono text-xs text-muted-foreground truncate">{user?.google_id ?? '—'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Usage stats */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium">Usage</CardTitle>
          <CardDescription>Activity from your Chrome extension this month.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {stats.map(({ label, value, sub, icon: Icon }) => (
              <div key={label} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                <div className="flex items-center justify-center w-8 h-8 rounded-md bg-background border border-border shrink-0">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-semibold text-sm mt-0.5 truncate">{value}</p>
                  {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
