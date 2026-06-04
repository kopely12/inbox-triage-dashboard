import { auth }          from '@/auth';
import { supabaseAdmin }  from '@/lib/supabase';
import { redirect }       from 'next/navigation';
import Link               from 'next/link';
import { Info, Download } from 'lucide-react';
import { ExtensionPrefsForm }   from '@/components/settings/extension-prefs-form';
import { PreferencesForm }      from '@/components/settings/preferences-form';
import { DeleteAccountDialog }  from '@/components/settings/delete-account-dialog';
import { GmailConnectionCard }  from '@/components/settings/gmail-connection-card';
import { PreferencesScrollSpy } from '@/components/settings/preferences-scroll-spy';
import { PreferencesSearch }    from '@/components/settings/preferences-search';
import { PREFS_DEFAULTS, type ExtensionPrefs } from '@/lib/extension-prefs';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button }    from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export const metadata = { title: 'Preferences — Inbox Triage' };

export default async function PreferencesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;

  const [{ data: prefs }, { data: user }] = await Promise.all([
    supabaseAdmin
      .from('user_preferences')
      .select('prefs')
      .eq('user_id', userId)
      .maybeSingle(),
    supabaseAdmin
      .from('users')
      .select('timezone, default_snooze_hours, name, email')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  const extensionPrefs: ExtensionPrefs = { ...PREFS_DEFAULTS, ...(prefs?.prefs ?? {}) };
  const timezone           = user?.timezone             ?? 'America/New_York';
  const defaultSnoozeHours = user?.default_snooze_hours ?? 24;
  const gmailEmail         = user?.email  ?? session.user.email ?? '';
  const gmailName          = user?.name   ?? session.user.name  ?? null;

  return (
    <div className="max-w-2xl space-y-6">
      <PreferencesScrollSpy />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Preferences</h2>
          <p className="text-sm text-muted-foreground">
            Configure how the extension scans, prioritises, and surfaces your email.
          </p>
        </div>
        <PreferencesSearch />
      </div>

      {/* Sync note */}
      <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-4 py-3">
        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Changes sync to your extension automatically. Reload Gmail or re-open the sidebar to apply them immediately.
        </p>
      </div>

      {/* Gmail connection */}
      <div id="gmail" className="scroll-mt-4">
        <GmailConnectionCard email={gmailEmail} name={gmailName} />
      </div>

      {/* Extension scan preferences */}
      <div>
        <ExtensionPrefsForm initialPrefs={extensionPrefs} />
      </div>

      {/* Timezone & snooze */}
      <Card id="time" className="scroll-mt-4">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium">Time &amp; reminders</CardTitle>
          <CardDescription>
            Controls how the extension schedules reminders and pre-fills snooze times.
            Your timezone is also used for bundle digest delivery.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PreferencesForm timezone={timezone} defaultSnoozeHours={defaultSnoozeHours} />
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card id="account" className="scroll-mt-4 border-destructive/40">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium text-destructive">Danger zone</CardTitle>
          <CardDescription>Irreversible actions — please proceed carefully.</CardDescription>
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
