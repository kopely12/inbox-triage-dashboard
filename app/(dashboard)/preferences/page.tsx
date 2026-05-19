import { auth }          from '@/auth';
import { supabaseAdmin }  from '@/lib/supabase';
import { redirect }       from 'next/navigation';
import { Info }           from 'lucide-react';
import { ExtensionPrefsForm } from '@/components/settings/extension-prefs-form';
import { PREFS_DEFAULTS, type ExtensionPrefs } from '@/app/actions/extension-prefs';

export const metadata = { title: 'Preferences — Inbox Triage' };

export default async function PreferencesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { data } = await supabaseAdmin
    .from('user_preferences')
    .select('prefs')
    .eq('user_id', session.user.id)
    .maybeSingle();

  // Merge DB prefs on top of defaults so every field is always present
  const prefs: ExtensionPrefs = { ...PREFS_DEFAULTS, ...(data?.prefs ?? {}) };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Extension preferences</h2>
        <p className="text-sm text-muted-foreground">
          Configure how the Inbox Triage extension scans, prioritises, and surfaces your email.
        </p>
      </div>

      {/* Sync note */}
      <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-4 py-3">
        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Changes are synced to your extension automatically. Reload Gmail or re-open the sidebar to apply them immediately.
        </p>
      </div>

      <ExtensionPrefsForm initialPrefs={prefs} />
    </div>
  );
}
