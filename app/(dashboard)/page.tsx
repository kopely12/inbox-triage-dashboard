import { auth }            from '@/auth';
import { supabaseAdmin }   from '@/lib/supabase';
import { redirect }        from 'next/navigation';
import { getInboxHealth, getHomepageSummary } from '@/app/actions/engagement';
import { getProtectionAlerts } from '@/app/actions/protection';
import { InboxHealthClient } from '@/components/inbox-health/inbox-health-client';
import { WhatToDoNext }    from '@/components/inbox-health/what-to-do-next';

export const metadata = { title: 'Inbox Health — Inbox Triage' };

// ── Helpers ───────────────────────────────────────────────────────────────────

function extensionHealthLabel(lastTriageAt: string | null): {
  label:   string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  detail:  string;
} {
  if (!lastTriageAt) {
    return { label: 'Not connected', variant: 'outline', detail: 'No triage sessions found' };
  }
  const daysAgo = (Date.now() - new Date(lastTriageAt).getTime()) / 86_400_000;
  if (daysAgo < 1) return { label: 'Active',   variant: 'default',      detail: 'Active today'                               };
  if (daysAgo < 3) return { label: 'Recent',   variant: 'secondary',    detail: `Last triage ${Math.round(daysAgo)}d ago`   };
  if (daysAgo < 7) return { label: 'Idle',     variant: 'secondary',    detail: `Last triage ${Math.round(daysAgo)}d ago`   };
  return               { label: 'Inactive', variant: 'destructive',  detail: `Last triage ${Math.round(daysAgo)}d ago`   };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;

  const now      = new Date();
  const today    = new Date(now); today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString().slice(0, 10);

  // End of current week (Sunday)
  const endOfWeek = new Date(today);
  const dow = today.getDay();
  endOfWeek.setDate(today.getDate() + (dow === 0 ? 0 : 7 - dow));
  const endOfWeekISO = endOfWeek.toISOString().slice(0, 10);

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

  const [
    { data: lastSession },
    { count: overdueCount },
    { count: dueThisWeekCount },
    { count: resolvedThisWeekCount },
    healthResult,
    alertsResult,
    homepageSummary,
  ] = await Promise.all([

    // Last triage session — drives extension status
    supabaseAdmin
      .from('triage_sessions')
      .select('triggered_at')
      .eq('user_id', userId)
      .order('triggered_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Overdue: open commitments with an explicit past due_date
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
      .gte('resolved_at', sevenDaysAgo.toISOString()),

    // Inbox Health score + trend
    getInboxHealth(),

    // Protection alerts
    getProtectionAlerts(),

    // What to do next — action card data
    getHomepageSummary(),
  ]);

  const ext = extensionHealthLabel(lastSession?.triggered_at ?? null);

  const commitmentSummary = {
    overdue:          overdueCount          ?? 0,
    dueThisWeek:      dueThisWeekCount      ?? 0,
    resolvedThisWeek: resolvedThisWeekCount ?? 0,
    extensionLabel:   ext.label,
    extensionVariant: ext.variant as 'default' | 'secondary' | 'destructive' | 'outline',
    extensionDetail:  ext.detail,
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* What to do next — always visible, above Inbox Health score */}
      {homepageSummary && (
        <div className="px-6 pt-6 pb-4 shrink-0 border-b border-border">
          <WhatToDoNext summary={homepageSummary} />
        </div>
      )}
      <InboxHealthClient
        health={healthResult.health}
        commitmentSummary={commitmentSummary}
        initialAlerts={alertsResult.alerts ?? []}
      />
    </div>
  );
}
