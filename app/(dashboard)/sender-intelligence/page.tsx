import { auth }          from '@/auth';
import { supabaseAdmin }  from '@/lib/supabase';
import { redirect }       from 'next/navigation';
import { SenderIntelligenceClient } from '@/components/sender-intelligence/sender-intelligence-client';
import type { FullSenderRow }       from '@/components/senders/senders-table';
import type { OptOutSender, EmailTypeStat } from '@/app/actions/engagement';
import type { RecentUnsubscribe }   from '@/components/sender-intelligence/sender-intelligence-client';
import { getScreenerQueue, getSenderTypeStats } from '@/app/actions/engagement';

export const metadata = { title: 'Inbox Cleaner — Inbox Triage' };

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeHealth(
  open: number,
  total: number,
  hasOverdue: boolean,
): FullSenderRow['health'] {
  if (hasOverdue) return 'red';
  const openRatio = total > 0 ? open / total : 0;
  if (openRatio > 0.5 || open >= 5) return 'yellow';
  return 'green';
}

// ── Page ──────────────────────────────────────────────────────────────────────

// Generic consumer email providers — if the user's domain matches one of these
// it's a personal inbox, not a company, so we don't treat it as "internal."
const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'yahoo.com', 'ymail.com', 'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me', 'fastmail.com', 'fastmail.fm',
  'hey.com', 'aol.com', 'msn.com', 'zoho.com',
]);

export default async function SenderIntelligencePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;

  // Derive the user's own company domain so internal senders can be excluded.
  const rawEmail   = session.user.email ?? '';
  const emailDomain = rawEmail.split('@')[1]?.toLowerCase() ?? '';
  const userDomain  = emailDomain && !GENERIC_EMAIL_DOMAINS.has(emailDomain) ? emailDomain : null;

  const todayISO = new Date().toISOString().slice(0, 10);

  // ── Parallel data fetch ───────────────────────────────────────────────────────
  const [
    { data: user },
    { data: senders, error },
    { data: scoresRaw },
    { data: commitmentsRaw },
    { data: rulesRaw },
    { data: optOutRaw },
    { data: recentUnsubRaw },
    screenerResult,
    typeStatsResult,
    { data: prefsRow },
    { data: failedUnsubRaw },
  ] = await Promise.all([

    // Refresh state + plan
    supabaseAdmin
      .from('users')
      .select('engagement_refresh_status, engagement_last_refreshed, plan_tier')
      .eq('id', userId)
      .single(),

    // Engagement / noise senders
    supabaseAdmin
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
        recent_engagement_rate,
        last_email_date,
        has_unsubscribe_header,
        unsubscribe_status,
        unsubscribed_at,
        auto_archive_enabled,
        auto_archive_filter_id,
        ignored,
        period_days,
        updated_at,
        emails_forwarded,
        engagement_score,
        opt_out_replied_at
      `)
      .eq('user_id', userId)
      .eq('ignored', false)
      .order('emails_received', { ascending: false })
      .limit(500),

    // Contacts: triage scores
    supabaseAdmin
      .from('sender_scores')
      .select('sender_email, score, reply_count, dismiss_count')
      .eq('user_id', userId),

    // Contacts: commitments (both directions)
    supabaseAdmin
      .from('commitments')
      .select('counterparty_email, counterparty, status, scanned_at, due_date')
      .eq('user_id', userId),

    // Contacts: sender rules (priority only)
    supabaseAdmin
      .from('sender_rules')
      .select('sender_email, sender_domain, rule_type, rule_value, created_at')
      .eq('user_id', userId)
      .eq('rule_type', 'priority')
      .order('created_at', { ascending: false }),

    // Opt-outs tab: senders the user asked to stop emailing them
    supabaseAdmin
      .from('sender_engagement')
      .select(`
        sender_email, sender_name, sender_domain,
        opt_out_replied_at, unsubscribe_status, last_email_date,
        emails_since_optout, has_unsubscribe_header,
        unsubscribe_http_url, unsubscribe_mailto, category
      `)
      .eq('user_id', userId)
      .not('opt_out_replied_at', 'is', null)
      .order('opt_out_replied_at', { ascending: false }),

    // Opt-outs tab: recently unsubscribed (not via manual opt-out) — for outcome monitoring
    supabaseAdmin
      .from('sender_engagement')
      .select(`
        sender_email, sender_name, sender_domain,
        unsubscribed_at, last_email_date, emails_received
      `)
      .eq('user_id', userId)
      .eq('unsubscribe_status', 'unsubscribed')
      .not('unsubscribed_at', 'is', null)
      .is('opt_out_replied_at', null)
      .gte('unsubscribed_at', new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString())
      .order('unsubscribed_at', { ascending: false })
      .limit(50),

    // New sender screener queue
    getScreenerQueue(),

    // Email type breakdowns
    getSenderTypeStats(),

    // Auto-clean prefs
    supabaseAdmin
      .from('user_preferences')
      .select('prefs')
      .eq('user_id', userId)
      .maybeSingle(),

    // Failed unsubscribes — attempted but no link found
    supabaseAdmin
      .from('sender_engagement')
      .select('sender_email, sender_name, sender_domain, category, emails_received, last_email_date')
      .eq('user_id', userId)
      .eq('unsubscribe_status', 'failed')
      .order('emails_received', { ascending: false })
      .limit(50),
  ]);

  const refreshStatus = user?.engagement_refresh_status ?? 'never';
  const lastRefreshed = user?.engagement_last_refreshed ?? null;
  const planTier      = user?.plan_tier                 ?? 'free';

  // ── Noise senders summary ─────────────────────────────────────────────────────
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

  // ── Contacts: build FullSenderRow[] from scores + commitments + rules ─────────
  const contactMap = new Map<string, {
    name:         string | null;
    score:        number | null;
    replyCount:   number;
    dismissCount: number;
    open:         number;
    done:         number;
    overdue:      number;
    hasOverdue:   boolean;
    lastDate:     string | null;
    rule:         'always' | 'never' | null;
  }>();

  // Layer 1: commitments
  for (const c of (commitmentsRaw ?? [])) {
    const email = (c.counterparty_email ?? '').toLowerCase().trim();
    if (!email) continue;

    if (!contactMap.has(email)) {
      contactMap.set(email, {
        name: c.counterparty ?? null,
        score: null, replyCount: 0, dismissCount: 0,
        open: 0, done: 0, overdue: 0, hasOverdue: false, lastDate: null, rule: null,
      });
    }
    const row = contactMap.get(email)!;
    if (!row.name && c.counterparty) row.name = c.counterparty;

    const isOpen    = c.status === 'open';
    const isDone    = c.status === 'done';
    const isOverdue = isOpen && !!c.due_date && c.due_date < todayISO;

    if (isOpen)  { row.open += 1; if (isOverdue) { row.overdue += 1; row.hasOverdue = true; } }
    if (isDone)    row.done += 1;
    if (!row.lastDate || c.scanned_at > row.lastDate) row.lastDate = c.scanned_at;
  }

  // Layer 2: triage scores
  for (const s of (scoresRaw ?? [])) {
    const email = (s.sender_email ?? '').toLowerCase().trim();
    if (!email) continue;

    if (!contactMap.has(email)) {
      contactMap.set(email, {
        name: null, score: null, replyCount: 0, dismissCount: 0,
        open: 0, done: 0, overdue: 0, hasOverdue: false, lastDate: null, rule: null,
      });
    }
    const row = contactMap.get(email)!;
    row.score        = s.score         ?? null;
    row.replyCount   = s.reply_count   ?? 0;
    row.dismissCount = s.dismiss_count ?? 0;
  }

  // Layer 3: sender rules
  for (const r of (rulesRaw ?? [])) {
    const email = (r.sender_email ?? '').toLowerCase().trim();
    if (!email) continue;
    const row = contactMap.get(email);
    if (row) row.rule = r.rule_value === 'always' ? 'always' : r.rule_value === 'never' ? 'never' : null;
  }

  const contacts: FullSenderRow[] = [...contactMap.entries()]
    .filter(([, r]) => r.open > 0 || r.done > 0 || r.replyCount > 0 || r.dismissCount > 0)
    .map(([email, r]) => ({
      email,
      name:         r.name,
      score:        r.score,
      replyCount:   r.replyCount,
      dismissCount: r.dismissCount,
      open:         r.open,
      done:         r.done,
      overdue:      r.overdue,
      hasOverdue:   r.hasOverdue,
      lastDate:     r.lastDate,
      rule:         r.rule,
      health:       computeHealth(r.open, r.open + r.done, r.hasOverdue),
    }))
    .sort((a, b) => {
      const hOrder = { red: 0, yellow: 1, green: 2 };
      const hDiff  = hOrder[a.health] - hOrder[b.health];
      if (hDiff !== 0) return hDiff;
      return (b.open + b.overdue) - (a.open + a.overdue);
    });

  const domainRulesCount = (rulesRaw ?? []).filter(
    (r) => r.sender_domain && !r.sender_email,
  ).length;

  // ── Opt-out senders: compute resolution for each ──────────────────────────────
  const optOutSenders: OptOutSender[] = (optOutRaw ?? []).map((s) => ({
    ...s,
    emails_since_optout: (s.emails_since_optout as number | null) ?? 0,
    resolution: s.unsubscribe_status === 'unsubscribed'
      ? 'unsubscribed'
      : (s.last_email_date && new Date(s.last_email_date) > new Date(s.opt_out_replied_at as string))
        ? 'still_sending'
        : 'went_quiet',
  })) as OptOutSender[];

  // ── Triage activity map — reply_count + dismiss_count per sender ─────────────
  const triageBySender: Record<string, { reply_count: number; dismiss_count: number }> = {};
  for (const s of (scoresRaw ?? [])) {
    if (s.sender_email && (s.reply_count > 0 || s.dismiss_count > 0)) {
      triageBySender[s.sender_email] = {
        reply_count:   s.reply_count   ?? 0,
        dismiss_count: s.dismiss_count ?? 0,
      };
    }
  }

  // ── Recent unsubscribes: for outcome monitoring ───────────────────────────────
  const recentUnsubscribes: RecentUnsubscribe[] = (recentUnsubRaw ?? []).map((s) => ({
    sender_email:   s.sender_email,
    sender_name:    s.sender_name,
    sender_domain:  s.sender_domain,
    unsubscribed_at: s.unsubscribed_at as string,
    last_email_date: s.last_email_date,
    emails_received: s.emails_received,
  }));

  const autoCleanPrefs = {
    auto_clean_calendar:      (prefsRow?.prefs?.auto_clean_calendar      as boolean) ?? false,
    auto_clean_calendar_days: (prefsRow?.prefs?.auto_clean_calendar_days as number)  ?? 7,
    auto_clean_otp:           (prefsRow?.prefs?.auto_clean_otp           as boolean) ?? false,
    auto_clean_promo:         (prefsRow?.prefs?.auto_clean_promo         as boolean) ?? false,
    auto_clean_promo_days:    (prefsRow?.prefs?.auto_clean_promo_days    as number)  ?? 60,
    auto_clean_shipping:      (prefsRow?.prefs?.auto_clean_shipping      as boolean) ?? false,
    auto_clean_social:        (prefsRow?.prefs?.auto_clean_social        as boolean) ?? false,
  };

  return (
    <SenderIntelligenceClient
      senders={rows}
      summary={summary}
      refreshStatus={refreshStatus}
      lastRefreshed={lastRefreshed}
      planTier={planTier}
      queryError={error?.message ?? null}
      contacts={contacts}
      domainRulesCount={domainRulesCount}
      optOutSenders={optOutSenders}
      recentUnsubscribes={recentUnsubscribes}
      screenerQueue={screenerResult.queue ?? []}
      screenerEnabled={screenerResult.settings?.enabled ?? false}
      typeStatsBySender={typeStatsResult.typeStatsBySender ?? {}}
      triageBySender={triageBySender}
      userDomain={userDomain}
      autoCleanPrefs={autoCleanPrefs}
      failedUnsubscribes={(failedUnsubRaw ?? []) as import('@/components/sender-intelligence/sender-intelligence-client').FailedUnsub[]}
    />
  );
}
