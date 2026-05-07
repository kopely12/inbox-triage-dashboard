import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { PreferencesForm } from '@/components/settings/preferences-form';
import { OrgNameForm } from '@/components/settings/org-name-form';
import { DeleteAccountDialog } from '@/components/settings/delete-account-dialog';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default async function SettingsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const userId  = session.user.id;
  const role    = session!.user.orgRole;
  const isAdmin = role === 'admin' || role === 'owner';

  // Fetch user preferences and (if admin) org name in parallel
  const [{ data: user }, { data: membership }] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select('timezone, default_snooze_hours')
      .eq('id', userId)
      .single(),

    isAdmin
      ? supabaseAdmin
          .from('org_members')
          .select('org_id, organizations(name)')
          .eq('user_id', userId)
          .eq('status', 'active')
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const timezone           = user?.timezone            ?? 'UTC';
  const defaultSnoozeHours = user?.default_snooze_hours ?? 24;
  const orgName            = (membership?.organizations as any)?.name ?? '';

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">Your preferences and account options.</p>
      </div>

      {/* Preferences */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium">Preferences</CardTitle>
          <CardDescription>Controls how the extension schedules reminders and pre-fills snooze times.</CardDescription>
        </CardHeader>
        <CardContent>
          <PreferencesForm
            timezone={timezone}
            defaultSnoozeHours={defaultSnoozeHours}
          />
        </CardContent>
      </Card>

      {/* Organisation — admin/owner only */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-medium">Organisation</CardTitle>
            <CardDescription>Visible to all members of your team.</CardDescription>
          </CardHeader>
          <CardContent>
            <OrgNameForm currentName={orgName} />
          </CardContent>
        </Card>
      )}

      {/* Danger Zone */}
      <Card className="border-destructive/40">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium text-destructive">Danger zone</CardTitle>
          <CardDescription>Irreversible actions. Please proceed carefully.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Download */}
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

          {/* Delete */}
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
