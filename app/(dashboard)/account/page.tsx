import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
// Note: AccountBillingSection moved to /billing page; OrgNameForm moved to /team page
import { EditName } from '@/components/account/edit-name';
import { PreferencesForm } from '@/components/settings/preferences-form';
import { DeleteAccountDialog } from '@/components/settings/delete-account-dialog';
import { Download, Zap, ExternalLink } from 'lucide-react';
import Link from 'next/link';

function extensionHealth(lastTriageAt: string | null): {
  label: string; detail: string; variant: 'default' | 'secondary' | 'destructive' | 'outline';
} {
  if (!lastTriageAt) return { label: 'Not connected', detail: 'No triage sessions found', variant: 'outline' };
  const daysAgo = (Date.now() - new Date(lastTriageAt).getTime()) / 86_400_000;
  const rel = (() => {
    const ms   = Date.now() - new Date(lastTriageAt).getTime();
    const mins = Math.floor(ms / 60_000);
    if (mins < 2)  return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7)  return `${days}d ago`;
    return new Date(lastTriageAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })();
  if (daysAgo < 1) return { label: 'Active',    detail: `Last triage ${rel}`,                         variant: 'default' };
  if (daysAgo < 3) return { label: 'Recent',    detail: `Last triage ${rel}`,                         variant: 'secondary' };
  if (daysAgo < 7) return { label: 'Idle',      detail: `Last triage ${Math.round(daysAgo)}d ago`,    variant: 'secondary' };
  return              { label: 'Inactive', detail: `Last triage ${Math.round(daysAgo)}d ago`,    variant: 'destructive' };
}

export default async function AccountPage() {
  const session = await auth();
  const userId  = session!.user.id;

  const [{ data: user }, { data: lastSession }] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single(),
    supabaseAdmin
      .from('triage_sessions')
      .select('triggered_at, emails_scanned, emails_surfaced')
      .eq('user_id', userId)
      .order('triggered_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const name     = user?.name ?? session!.user.name ?? '—';
  const email    = user?.email ?? session!.user.email ?? '—';
  const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const plan     = user?.plan_tier ?? 'free';
  const joined   = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—';

  const timezone           = user?.timezone            ?? 'UTC';
  const defaultSnoozeHours = user?.default_snooze_hours ?? 24;

  const health = extensionHealth(lastSession?.triggered_at ?? null);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Account</h2>
        <p className="text-sm text-muted-foreground">Your profile, preferences, and account settings.</p>
      </div>

      {/* Profile */}
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

          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Plan</dt>
              <dd className="mt-0.5">
                <Badge variant={plan === 'pro' ? 'default' : 'secondary'} className="capitalize">
                  {plan}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Member since</dt>
              <dd className="mt-0.5 font-medium text-sm">{joined}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Role</dt>
              <dd className="mt-0.5 font-medium text-sm capitalize">{user?.org_role ?? 'member'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Extension status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Extension</CardTitle>
          <CardDescription>Status of the Inbox Triage Chrome extension.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted shrink-0">
              <Zap className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant={health.variant} className="text-[10px] py-0">{health.label}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{health.detail}</p>
              {lastSession && (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 mt-3 text-xs max-w-xs">
                  <div>
                    <dt className="text-muted-foreground">Emails scanned (last run)</dt>
                    <dd className="font-medium mt-0.5">{(lastSession.emails_scanned ?? 0).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Surfaced (last run)</dt>
                    <dd className="font-medium mt-0.5">{(lastSession.emails_surfaced ?? 0).toLocaleString()}</dd>
                  </div>
                </dl>
              )}
              {!lastSession && (
                <a
                  href="https://chromewebstore.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                >
                  Install extension <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium">Preferences</CardTitle>
          <CardDescription>Controls how the extension schedules reminders and pre-fills snooze times.</CardDescription>
        </CardHeader>
        <CardContent>
          <PreferencesForm timezone={timezone} defaultSnoozeHours={defaultSnoozeHours} />
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/40">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium text-destructive">Danger zone</CardTitle>
          <CardDescription>Irreversible actions. Please proceed carefully.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Download my data</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Export your profile, triage sessions, and commitments as JSON.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
              <Link href="/api/account/download" target="_blank">
                <Download className="w-3.5 h-3.5" />
                Download
              </Link>
            </Button>
          </div>

          <Separator />

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Delete account</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permanently remove your account and all associated data.
              </p>
            </div>
            <div className="shrink-0">
              <DeleteAccountDialog />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
