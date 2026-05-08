import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { EditName } from '@/components/account/edit-name';
import { AccountBillingSection } from '@/components/account/account-billing-section';
import { PreferencesForm } from '@/components/settings/preferences-form';
import { OrgNameForm } from '@/components/settings/org-name-form';
import { DeleteAccountDialog } from '@/components/settings/delete-account-dialog';
import { Download } from 'lucide-react';
import Link from 'next/link';

export default async function AccountPage() {
  const session = await auth();
  const userId  = session!.user.id;
  const role    = session!.user.orgRole;
  const isAdmin = role === 'admin' || role === 'owner';

  const [{ data: user }, { data: membership }] = await Promise.all([
    supabaseAdmin.from('users').select('*').eq('id', userId).single(),

    isAdmin
      ? supabaseAdmin
          .from('org_members')
          .select('org_id, organizations(name)')
          .eq('user_id', userId)
          .eq('status', 'active')
          .single()
      : Promise.resolve({ data: null }),
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
  const orgName            = (membership?.organizations as any)?.name ?? '';

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

      {/* Billing */}
      <AccountBillingSection
        plan={plan}
        stripeCustomerId={user?.stripe_customer_id ?? null}
      />

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

      {/* Organization — admin/owner only */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-medium">Organization</CardTitle>
            <CardDescription>Visible to all members of your team.</CardDescription>
          </CardHeader>
          <CardContent>
            <OrgNameForm currentName={orgName} />
          </CardContent>
        </Card>
      )}

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
