import { auth }          from '@/auth';
import { supabaseAdmin }  from '@/lib/supabase';
import { redirect }       from 'next/navigation';
import { SenderIntelligenceClient } from '@/components/sender-intelligence/sender-intelligence-client';

export const metadata = { title: 'Sender Intelligence — Inbox Triage' };

export default async function SenderIntelligencePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;

  // ── User refresh state ────────────────────────────────────────────────────────
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('engagement_refresh_status, engagement_last_refreshed, plan_tier')
    .eq('id', userId)
    .single();

  const refreshStatus    = user?.engagement_refresh_status  ?? 'never';
  const lastRefreshed    = user?.engagement_last_refreshed  ?? null;
  const planTier         = user?.plan_tier                  ?? 'free';

  // ── Sender data ───────────────────────────────────────────────────────────────
  const { data: senders, error } = await supabaseAdmin
    .from('sender_engagement')
    .select(`
      id,
      sender_email,
      sender_name,
      sender_domain,
      category,
      emails_received,
      emails_opened,
      emails_starred,
      emails_replied,
      emails_deleted,
      engagement_rate,
      last_email_date,
      has_unsubscribe_header,
      unsubscribe_status,
      unsubscribed_at,
      auto_archive_enabled,
      auto_archive_filter_id,
      ignored,
      period_days,
      updated_at
    `)
    .eq('user_id', userId)
    .eq('ignored', false)
    .order('emails_received', { ascending: false })
    .limit(500);

  // ── Summary ───────────────────────────────────────────────────────────────────
  const rows = senders ?? [];
  const summary = {
    total_senders:         rows.length,
    never_engage_count:    rows.filter((r) => r.category === 'never_engage').length,
    rarely_engage_count:   rows.filter((r) => r.category === 'rarely_engage').length,
    regular_count:         rows.filter((r) => r.category === 'regular').length,
    known_contact_count:   rows.filter((r) => r.category === 'known_contact').length,
    transactional_count:   rows.filter((r) => r.category === 'transactional').length,
    total_emails_analyzed: rows.reduce((s, r) => s + (r.emails_received || 0), 0),
    total_noise_emails:    rows
      .filter((r) => r.category === 'never_engage' || r.category === 'rarely_engage')
      .reduce((s, r) => s + (r.emails_received || 0), 0),
    noise_percentage:      0,
    period_days:           rows[0]?.period_days ?? 30,
    last_refreshed:        lastRefreshed,
    refresh_status:        refreshStatus,
  };

  if (summary.total_emails_analyzed > 0) {
    summary.noise_percentage = Math.round(
      (summary.total_noise_emails / summary.total_emails_analyzed) * 100,
    );
  }

  return (
    <SenderIntelligenceClient
      senders={rows}
      summary={summary}
      refreshStatus={refreshStatus}
      lastRefreshed={lastRefreshed}
      planTier={planTier}
      queryError={error?.message ?? null}
    />
  );
}
