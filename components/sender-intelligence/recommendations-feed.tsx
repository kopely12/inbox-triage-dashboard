'use client';

// recommendations-feed.tsx
//
// Generates and renders actionable inbox recommendations from existing sender
// engagement data. No new backend calls — purely derived from what the page
// already fetched.

import { useState }    from 'react';
import {
  X, Zap, Archive, MailX, AlertTriangle, Trash2,
  Sparkles, TrendingDown, Globe, Loader2,
} from 'lucide-react';
import { toast }       from 'sonner';
import { Button }      from '@/components/ui/button';
import { cn }          from '@/lib/utils';
import type { SenderRow }    from './sender-intelligence-client';
import type { EmailTypeStat, FilterSuggestion } from '@/app/actions/engagement';
import { getFilterSuggestions, executeBulkAction } from '@/app/actions/engagement';

// ── Types ─────────────────────────────────────────────────────────────────────

type RecommendationVariant = 'default' | 'warning' | 'destructive';

export type RecommendationAction = {
  label:   string;
  action:  string;
  senders: SenderRow[];
};

export type Recommendation = {
  id:          string;
  icon:        React.ReactNode;
  title:       string;
  description: string;
  senders:     SenderRow[];
  action:      string;
  actionLabel: string;
  impactLabel: string;   // "stops ~12 emails/week"
  variant:     RecommendationVariant;
  actions?:    RecommendationAction[];  // multi-step cards (tiered flow)
};

// ── localStorage keys ─────────────────────────────────────────────────────────
const DISMISSED_RECS_KEY         = 'inbox-triage:dismissed-recs';
const DISMISSED_SUGGESTIONS_KEY  = 'inbox-triage:dismissed-suggestions';

// ── Email type emoji map ──────────────────────────────────────────────────────
const TYPE_EMOJI: Record<string, string> = {
  receipt: '📦', newsletter: '📰', promotion: '🔥',
  alert: '🔔', social: '👥', update: '🔄', personal: '✉️',
};

// ── Pure helpers ──────────────────────────────────────────────────────────────

function weeklyRate(senders: SenderRow[], periodDays: number): number {
  const total = senders.reduce((n, s) => n + (s.emails_received ?? 0), 0);
  return Math.max(1, Math.round((total / Math.max(periodDays, 1)) * 7));
}

// 14-day grace period: legitimate email platforms can take up to 2 weeks to process.
const UNSUB_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

function isStillReceiving(s: SenderRow): boolean {
  if (s.unsubscribe_status !== 'unsubscribed' || !s.unsubscribed_at || !s.last_email_date) return false;
  return new Date(s.last_email_date).getTime() >
         new Date(s.unsubscribed_at).getTime() + UNSUB_GRACE_MS;
}

// ── Recommendation generation ─────────────────────────────────────────────────
// Priority order matters — claimed senders are excluded from later recs.

export function generateRecommendations(
  allSenders:        SenderRow[],
  typeStatsBySender: Record<string, EmailTypeStat[]>,
  userDomain?:       string | null,
): Recommendation[] {
  // Exclude internal senders (same company domain) from all recommendations.
  const senders = userDomain
    ? allSenders.filter(
        (s) => !(s.sender_domain === userDomain || s.sender_email.toLowerCase().endsWith('@' + userDomain)),
      )
    : allSenders;
  if (!senders.length) return [];
  const periodDays = senders[0]?.period_days ?? 90;
  const claimed    = new Set<string>();
  const recs: Recommendation[] = [];

  // ── 1. Post-unsubscribe violators → report as spam ───────────────────────
  // Highest priority: sender already ignored an explicit opt-out request.
  const spammers = senders.filter(isStillReceiving);
  if (spammers.length >= 1) {
    spammers.forEach((s) => claimed.add(s.sender_email));
    const n = spammers.length;
    recs.push({
      id:          'report_spam',
      icon:        <AlertTriangle className="w-4 h-4" />,
      title:       `${n} sender${n > 1 ? 's are' : ' is'} ignoring your unsubscribe`,
      description: `You asked ${n > 1 ? 'these senders' : 'this sender'} to stop, but the emails kept coming. Reporting as spam tells Gmail to block future messages automatically.`,
      senders:     spammers,
      action:      'report_spam',
      actionLabel: 'Report as spam',
      impactLabel: `blocks ~${weeklyRate(spammers, periodDays)} emails/week`,
      variant:     'destructive',
    });
  }

  // ── 2. Tiered Never Engage cleanup ───────────────────────────────────────
  // Fires when there are enough never-engage senders of both types (unsub + no-unsub).
  // Presents a two-button card so users see exactly what will happen to each group.
  const neverEngageAll = senders.filter((s) =>
    !claimed.has(s.sender_email) &&
    s.category === 'never_engage' &&
    s.unsubscribe_status !== 'unsubscribed' &&
    !s.auto_archive_enabled,
  );
  const neverWithUnsub    = neverEngageAll.filter((s) => s.has_unsubscribe_header);
  const neverWithoutUnsub = neverEngageAll.filter((s) => !s.has_unsubscribe_header);

  if (neverEngageAll.length >= 5 && neverWithUnsub.length >= 2 && neverWithoutUnsub.length >= 2) {
    neverEngageAll.forEach((s) => claimed.add(s.sender_email));
    const n = neverEngageAll.length;
    recs.push({
      id:          'tiered_never_engage',
      icon:        <Sparkles className="w-4 h-4" />,
      title:       `Clean up ${n} Never Open senders in one go`,
      description: `${neverWithUnsub.length} have unsubscribe links (we'll opt you out) and ${neverWithoutUnsub.length} don't (we'll auto-archive them). Both handled with the buttons below.`,
      senders:     neverEngageAll,
      action:      'unsubscribe',
      actionLabel: 'Clean all',
      impactLabel: `stops ~${weeklyRate(neverEngageAll, periodDays)} emails/week`,
      variant:     'default',
      actions: [
        ...(neverWithUnsub.length > 0
          ? [{ label: `Unsubscribe ${neverWithUnsub.length}`,    action: 'unsubscribe',  senders: neverWithUnsub    }]
          : []),
        ...(neverWithoutUnsub.length > 0
          ? [{ label: `Auto-archive ${neverWithoutUnsub.length}`, action: 'auto_archive', senders: neverWithoutUnsub }]
          : []),
      ],
    });
  }

  // ── 3. Never-opened senders with unsubscribe links (fallback) ────────────
  // Only fires when tiered card didn't claim these senders.
  const neverUnsub = senders.filter((s) =>
    !claimed.has(s.sender_email) &&
    s.category === 'never_engage' &&
    s.has_unsubscribe_header &&
    s.unsubscribe_status !== 'unsubscribed',
  );
  if (neverUnsub.length >= 1) {
    neverUnsub.forEach((s) => claimed.add(s.sender_email));
    const n = neverUnsub.length;
    recs.push({
      id:          'unsubscribe_never_engaged',
      icon:        <MailX className="w-4 h-4" />,
      title:       `Unsubscribe from ${n} sender${n > 1 ? 's' : ''} you've never opened`,
      description: `You haven't opened a single email from ${n > 1 ? 'these senders' : 'this sender'}. ${n > 1 ? 'They all have' : 'It has'} an unsubscribe link — clean ${n > 1 ? 'them' : 'it'} out in one go.`,
      senders:     neverUnsub,
      action:      'unsubscribe',
      actionLabel: n > 1 ? 'Unsubscribe all' : 'Unsubscribe',
      impactLabel: `stops ~${weeklyRate(neverUnsub, periodDays)} emails/week`,
      variant:     'default',
    });
  }

  // ── 4. High trash-rate senders (you keep deleting, haven't unsubscribed) ──
  // Revealed preference: if you trash >60% of emails, you're done with them.
  const highTrash = senders.filter((s) => {
    if (claimed.has(s.sender_email)) return false;
    const trashRate = (s.emails_deleted ?? 0) / Math.max(s.emails_received, 1);
    return (
      trashRate >= 0.6 &&
      s.emails_received >= 5 &&
      s.has_unsubscribe_header &&
      s.unsubscribe_status !== 'unsubscribed'
    );
  });
  if (highTrash.length >= 1) {
    highTrash.forEach((s) => claimed.add(s.sender_email));
    const n = highTrash.length;
    recs.push({
      id:          'unsubscribe_high_trash',
      icon:        <Trash2 className="w-4 h-4" />,
      title:       `You delete most emails from ${n} sender${n > 1 ? 's' : ''} — time to unsubscribe`,
      description: `You trash over 60% of emails from ${n > 1 ? 'these senders' : 'this sender'} without opening them. Unsubscribing stops them from arriving in the first place.`,
      senders:     highTrash,
      action:      'unsubscribe',
      actionLabel: n > 1 ? 'Unsubscribe all' : 'Unsubscribe',
      impactLabel: `stops ~${weeklyRate(highTrash, periodDays)} emails/week`,
      variant:     'default',
    });
  }

  // ── 5. High-frequency noise (5+/week, <20% open rate) ────────────────────
  // Even if category isn't "never", daily streams with low engagement are worth stopping.
  const highFrequency = senders.filter((s) => {
    if (claimed.has(s.sender_email)) return false;
    const perWeek = (s.emails_received / Math.max(periodDays, 1)) * 7;
    return (
      perWeek >= 5 &&
      (s.engagement_rate ?? 0) < 0.2 &&
      s.has_unsubscribe_header &&
      s.unsubscribe_status !== 'unsubscribed'
    );
  });
  if (highFrequency.length >= 1) {
    highFrequency.forEach((s) => claimed.add(s.sender_email));
    const n = highFrequency.length;
    recs.push({
      id:          'high_frequency_noise',
      icon:        <span className="text-sm leading-none">📬</span>,
      title:       `${n} sender${n > 1 ? 's send' : ' sends'} daily but you rarely open`,
      description: `${n > 1 ? 'These senders flood' : 'This sender floods'} your inbox at 5+ emails per week but you open less than 20% of them. Unsubscribing stops the daily stream immediately.`,
      senders:     highFrequency,
      action:      'unsubscribe',
      actionLabel: n > 1 ? 'Unsubscribe all' : 'Unsubscribe',
      impactLabel: `stops ~${weeklyRate(highFrequency, periodDays)} emails/week`,
      variant:     'default',
    });
  }

  // ── 6. Engagement decay (rarely_engage, <12% open rate) ──────────────────
  // Proxy for "used to read, stopped caring." Different from never_engage:
  // these senders have at least some historical opens, but engagement has dried up.
  const decaySenders = senders.filter((s) => {
    if (claimed.has(s.sender_email)) return false;
    return (
      s.category === 'rarely_engage' &&
      s.emails_received >= 8 &&
      (s.engagement_rate ?? 0) < 0.12 &&
      s.has_unsubscribe_header &&
      s.unsubscribe_status !== 'unsubscribed'
    );
  });
  if (decaySenders.length >= 2) {
    decaySenders.forEach((s) => claimed.add(s.sender_email));
    const n = decaySenders.length;
    recs.push({
      id:          'engagement_decay',
      icon:        <TrendingDown className="w-4 h-4" />,
      title:       `You've stopped reading ${n} sender${n > 1 ? 's' : ''} you once opened`,
      description: `You opened some emails from ${n > 1 ? 'these senders' : 'this sender'} at some point, but open rate is now under 12% — a sign interest has faded. Clean them out before they pile up further.`,
      senders:     decaySenders,
      action:      'unsubscribe',
      actionLabel: n > 1 ? 'Unsubscribe all' : 'Unsubscribe',
      impactLabel: `stops ~${weeklyRate(decaySenders, periodDays)} emails/week`,
      variant:     'warning',
    });
  }

  // ── 7. Promo-heavy senders with <10% open rate (type-aware) ──────────────
  // Only fires when type classification data is available.
  const promoHeavy = senders.filter((s) => {
    if (claimed.has(s.sender_email)) return false;
    const types = typeStatsBySender[s.sender_email];
    if (!types?.length) return false;
    const total    = types.reduce((n, t) => n + t.email_count, 0);
    const promo    = types.find((t) => t.email_type === 'promotion');
    if (!promo || promo.email_count < 3) return false;
    const promoShare = promo.email_count / Math.max(total, 1);
    const openRate   = promo.open_count  / Math.max(promo.email_count, 1);
    return (
      promoShare >= 0.5 &&
      openRate   <  0.1 &&
      s.has_unsubscribe_header &&
      s.unsubscribe_status !== 'unsubscribed'
    );
  });
  if (promoHeavy.length >= 2) {
    promoHeavy.forEach((s) => claimed.add(s.sender_email));
    const totalPromoEmails = promoHeavy.reduce((n, s) => {
      const promo = (typeStatsBySender[s.sender_email] ?? []).find((t) => t.email_type === 'promotion');
      return n + (promo?.email_count ?? 0);
    }, 0);
    const n = promoHeavy.length;
    recs.push({
      id:          'unsubscribe_promo_heavy',
      icon:        <span className="text-sm leading-none">🔥</span>,
      title:       `${totalPromoEmails.toLocaleString()} unread promotional emails from ${n} senders`,
      description: `${n > 1 ? 'These senders are' : 'This sender is'} mostly sending promotions with less than 10% open rate. You're not reading them — unsubscribing clears the backlog and stops more arriving.`,
      senders:     promoHeavy,
      action:      'unsubscribe',
      actionLabel: n > 1 ? 'Unsubscribe all' : 'Unsubscribe',
      impactLabel: `stops ~${weeklyRate(promoHeavy, periodDays)} emails/week`,
      variant:     'default',
    });
  }

  // ── 8. Domain-level auto-archive (3+ noise senders from same domain) ──────
  // Pattern detection: if a whole domain is noise, archive it at the domain level.
  // Only the single largest qualifying cluster is surfaced (to avoid card explosion).
  const domainMap = new Map<string, SenderRow[]>();
  for (const s of senders) {
    if (claimed.has(s.sender_email)) continue;
    if (s.category !== 'never_engage' && s.category !== 'rarely_engage') continue;
    if (s.auto_archive_enabled) continue;
    const domain = s.sender_domain || s.sender_email.split('@')[1] || '';
    if (!domain) continue;
    if (!domainMap.has(domain)) domainMap.set(domain, []);
    domainMap.get(domain)!.push(s);
  }
  const biggestCluster = [...domainMap.entries()]
    .filter(([, g]) => g.length >= 3)
    .sort(([, a], [, b]) =>
      b.reduce((n, s) => n + s.emails_received, 0) -
      a.reduce((n, s) => n + s.emails_received, 0),
    )[0];

  if (biggestCluster) {
    const [domain, clusterSenders] = biggestCluster;
    clusterSenders.forEach((s) => claimed.add(s.sender_email));
    const n          = clusterSenders.length;
    const totalEmails = clusterSenders.reduce((sum, s) => sum + s.emails_received, 0);
    recs.push({
      id:          'domain_cluster_archive',
      icon:        <Globe className="w-4 h-4" />,
      title:       `${n} noise senders from ${domain}`,
      description: `All ${n} addresses from ${domain} are low-engagement (${totalEmails.toLocaleString()} emails combined). Auto-archiving the whole domain keeps their mail out of your inbox while staying accessible in All Mail.`,
      senders:     clusterSenders,
      action:      'auto_archive',
      actionLabel: `Auto-archive ${domain}`,
      impactLabel: `keeps ~${weeklyRate(clusterSenders, periodDays)} emails/week out of inbox`,
      variant:     'default',
    });
  }

  // ── 9. High delete rate, no unsub link → auto-archive ───────────────────
  // Revealed preference via trashing, but can't unsubscribe. Auto-archive
  // stops the inbox interruption without losing the emails.
  const highDeleteNoUnsub = senders.filter((s) => {
    if (claimed.has(s.sender_email)) return false;
    const trashRate = (s.emails_deleted ?? 0) / Math.max(s.emails_received, 1);
    return (
      trashRate >= 0.5 &&
      s.emails_received >= 5 &&
      !s.has_unsubscribe_header &&
      !s.auto_archive_enabled &&
      s.category !== 'transactional' &&
      s.category !== 'known_contact'
    );
  });
  if (highDeleteNoUnsub.length >= 1) {
    highDeleteNoUnsub.forEach((s) => claimed.add(s.sender_email));
    const n = highDeleteNoUnsub.length;
    recs.push({
      id:          'auto_archive_high_delete',
      icon:        <Trash2 className="w-4 h-4" />,
      title:       `You trash most emails from ${n} sender${n > 1 ? 's' : ''} — auto-archive ${n > 1 ? 'them' : 'it'}`,
      description: `You're deleting 50%+ of emails from ${n > 1 ? 'these senders' : 'this sender'} without reading ${n > 1 ? 'them' : 'it'}, but ${n > 1 ? 'they don\'t have' : 'it doesn\'t have'} an unsubscribe link. Auto-archiving clears ${n > 1 ? 'them' : 'it'} from your inbox while keeping the emails reachable in All Mail.`,
      senders:     highDeleteNoUnsub,
      action:      'auto_archive',
      actionLabel: n > 1 ? 'Auto-archive all' : 'Auto-archive',
      impactLabel: `keeps ~${weeklyRate(highDeleteNoUnsub, periodDays)} emails/week out of inbox`,
      variant:     'default',
    });
  }

  // ── 10. Low-engagement senders with no unsub link → auto-archive ─────────
  // Can't unsubscribe, but can push them out of the inbox.
  const archiveCandidates = senders.filter((s) =>
    !claimed.has(s.sender_email) &&
    (s.category === 'never_engage' || s.category === 'rarely_engage') &&
    !s.auto_archive_enabled &&
    !s.has_unsubscribe_header &&
    s.emails_received >= 5,
  );
  if (archiveCandidates.length >= 2) {
    archiveCandidates.forEach((s) => claimed.add(s.sender_email));
    const n = archiveCandidates.length;
    recs.push({
      id:          'auto_archive_noise',
      icon:        <Archive className="w-4 h-4" />,
      title:       `Auto-archive ${n} low-engagement senders`,
      description: `${n > 1 ? 'These senders don\'t' : 'This sender doesn\'t'} have an unsubscribe option, but you can keep ${n > 1 ? 'their emails' : 'the emails'} out of your inbox automatically. Still accessible in All Mail whenever you need them.`,
      senders:     archiveCandidates,
      action:      'auto_archive',
      actionLabel: n > 1 ? 'Auto-archive all' : 'Auto-archive',
      impactLabel: `keeps ~${weeklyRate(archiveCandidates, periodDays)} emails/week out of inbox`,
      variant:     'default',
    });
  }

  // Cap at 6
  return recs.slice(0, 6);
}

// ── RecommendationCard ────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<RecommendationVariant, { card: string; action: 'default' | 'destructive' }> = {
  default:     { card: 'border-amber-200 bg-amber-50',       action: 'default'     },
  warning:     { card: 'border-amber-300 bg-amber-100',      action: 'default'     },
  destructive: { card: 'border-red-200 bg-red-50',           action: 'destructive' },
};

const DOT_COLORS: Record<RecommendationVariant, string> = {
  default:     'bg-amber-500',
  warning:     'bg-amber-600',
  destructive: 'bg-red-500',
};

function RecommendationCard({
  rec,
  index,
  onAction,
  onDismiss,
  isFree,
}: {
  rec:       Recommendation;
  index:     number;
  onAction:  (action: string, senders: SenderRow[]) => void;
  onDismiss: () => void;
  isFree?:   boolean;
}) {
  const styles = VARIANT_STYLES[rec.variant];

  return (
    <div className={cn('rounded-lg border p-4 flex items-start gap-4', styles.card)}>

      {/* Priority number dot */}
      <div className={cn(
        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5',
        DOT_COLORS[rec.variant],
      )}>
        {index + 1}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug">{rec.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{rec.impactLabel}</p>
      </div>

      {/* Right: action(s) + dismiss */}
      <div className="flex flex-col items-end gap-2 shrink-0">
        {isFree && rec.senders.length > 1 ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => { window.location.href = '/billing'; }}
            >
              Unlock with Pro
              <span className="ml-1.5 text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded">Pro</span>
            </Button>
            <span className="text-[10px] text-muted-foreground">Free plan: one sender at a time</span>
          </>
        ) : rec.actions && rec.actions.length > 0 ? (
          /* Multi-action (tiered) */
          <div className="flex items-center gap-1.5">
            {rec.actions.map((a, i) => (
              <Button
                key={a.action + i}
                size="sm"
                variant={i === 0 ? styles.action : 'outline'}
                className="h-7 text-xs"
                onClick={() => onAction(a.action, a.senders)}
              >
                {a.label}
              </Button>
            ))}
          </div>
        ) : (
          /* Single action */
          <Button
            size="sm"
            variant={styles.action}
            className="h-7 text-xs"
            onClick={() => onAction(rec.action, rec.senders)}
          >
            {rec.actionLabel}
          </Button>
        )}

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className={cn(
            'transition-colors',
            rec.variant === 'destructive'
              ? 'text-red-300 hover:text-red-600'
              : 'text-amber-400 hover:text-amber-700',
          )}
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

    </div>
  );
}

// ── SuggestionCard ────────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion: s,
  index,
  isActing,
  onAction,
  onDismiss,
}: {
  suggestion: FilterSuggestion;
  index:      number;
  isActing:   boolean;
  onAction:   () => void;
  onDismiss:  () => void;
}) {
  const actionLabel = s.kind === 'unsubscribe_noise' ? 'Unsubscribe' : 'Auto-archive';
  const noiseDesc   = s.noise_types
    .slice(0, 2)
    .map((t) => `${TYPE_EMOJI[t.email_type] ?? '📧'} ${t.email_type}s (${Math.round(t.open_rate * 100)}% opened)`)
    .join(' · ');

  return (
    <div className="rounded-lg border p-4 flex items-start gap-4 border-amber-200 bg-amber-50">

      {/* Priority number dot */}
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5 bg-amber-500">
        {index + 1}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium leading-snug">{s.sender_name || s.sender_email}</p>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 shrink-0">
            Selective filter
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{noiseDesc}</p>
      </div>

      {/* Right: action + dismiss */}
      <div className="flex flex-col items-end gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-amber-200 hover:bg-amber-50"
          onClick={onAction}
          disabled={isActing}
        >
          {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : actionLabel}
        </Button>
        <button
          onClick={onDismiss}
          className="text-amber-400 hover:text-amber-700 transition-colors"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

    </div>
  );
}

// ── RecommendationsFeed ───────────────────────────────────────────────────────

export function RecommendationsFeed({
  senders,
  typeStatsBySender,
  onAction,
  isFree,
  userDomain,
}: {
  senders:           SenderRow[];
  typeStatsBySender: Record<string, EmailTypeStat[]>;
  onAction:          (action: string, senders: SenderRow[]) => void;
  isFree?:           boolean;
  userDomain?:       string | null;
}) {
  // ── Dismissed recs ────────────────────────────────────────────────────────
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(DISMISSED_RECS_KEY);
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set([...prev, id]);
      try { localStorage.setItem(DISMISSED_RECS_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  // ── Suggestions state ─────────────────────────────────────────────────────
  const [suggestions,        setSuggestions]        = useState<FilterSuggestion[] | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [actingSuggestions,  setActingSuggestions]  = useState<Set<string>>(new Set());
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(DISMISSED_SUGGESTIONS_KEY);
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  async function loadSuggestions() {
    setSuggestionsLoading(true);
    const { suggestions: data, error } = await getFilterSuggestions();
    setSuggestionsLoading(false);
    if (error) toast.error(`Could not load suggestions: ${error}`);
    else setSuggestions(data);
  }

  async function handleSuggestionAction(s: FilterSuggestion) {
    setActingSuggestions((prev) => new Set(prev).add(s.sender_email));
    const action = s.kind === 'unsubscribe_noise' ? 'unsubscribe' : 'auto_archive';
    const { succeeded, error } = await executeBulkAction(action, [s.sender_email]);
    setActingSuggestions((prev) => { const n = new Set(prev); n.delete(s.sender_email); return n; });
    if (error || succeeded === 0) {
      toast.error(`Could not action ${s.sender_name || s.sender_email}`);
    } else {
      toast.success(`Done — ${s.sender_name || s.sender_email} updated.`);
      setSuggestions((prev) => prev ? prev.filter((x) => x.sender_email !== s.sender_email) : prev);
    }
  }

  function dismissSuggestion(email: string) {
    setDismissedSuggestions((prev) => {
      const next = new Set([...prev, email]);
      try { localStorage.setItem(DISMISSED_SUGGESTIONS_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  const recs = generateRecommendations(senders, typeStatsBySender, userDomain)
    .filter((r) => !dismissed.has(r.id));

  const visibleSuggestions = (suggestions ?? [])
    .filter((s) => !dismissedSuggestions.has(s.sender_email));

  if (recs.length === 0 && suggestions === null) return null;

  // ── Projected weekly impact ───────────────────────────────────────────────
  // Expressed as emails/week — more defensible than noise % projection.
  const periodDays = senders[0]?.period_days ?? 90;
  const recSenderEmails = new Set<string>();
  recs.forEach((r) => r.senders.forEach((s) => recSenderEmails.add(s.sender_email)));
  const weeklyEmailsRemoved = Math.round(
    senders
      .filter((s) => recSenderEmails.has(s.sender_email))
      .reduce((n, s) => n + s.emails_received, 0) / Math.max(periodDays, 1) * 7,
  );
  const showImpact = recs.length >= 2 && weeklyEmailsRemoved >= 5;

  const totalCount = recs.length + visibleSuggestions.length;

  return (
    <div className="px-6 pt-3 pb-4 bg-background border-b border-border">

      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 uppercase tracking-wide">
          <Zap className="w-3 h-3 text-amber-500" />
          Actions{totalCount > 0 ? ` · ${totalCount}` : ''}
        </span>
        {showImpact && (
          <span className="text-[10px] font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full border border-green-200">
            Acting on all removes ~{weeklyEmailsRemoved} emails/week
          </span>
        )}
        {/* Analyse for more — shown until suggestions are loaded */}
        {suggestions === null && (
          <button
            onClick={loadSuggestions}
            disabled={suggestionsLoading}
            className="ml-auto flex items-center gap-1 text-[10px] font-medium text-amber-600 hover:text-amber-800 transition-colors disabled:opacity-50"
          >
            {suggestionsLoading ? (
              <><Loader2 className="w-3 h-3 animate-spin" />Analysing…</>
            ) : (
              <><Sparkles className="w-3 h-3" />Analyse for more</>
            )}
          </button>
        )}
        {suggestions !== null && (
          <button
            onClick={loadSuggestions}
            disabled={suggestionsLoading}
            className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {suggestionsLoading
              ? <><Loader2 className="w-3 h-3 animate-spin" />Analysing…</>
              : 'Re-analyse'
            }
          </button>
        )}
      </div>

      <div className="space-y-2">
        {recs.map((rec, i) => (
          <RecommendationCard
            key={rec.id}
            rec={rec}
            index={i}
            onAction={onAction}
            onDismiss={() => dismiss(rec.id)}
            isFree={isFree}
          />
        ))}

        {visibleSuggestions.map((s, i) => (
          <SuggestionCard
            key={s.sender_email}
            suggestion={s}
            index={recs.length + i}
            isActing={actingSuggestions.has(s.sender_email)}
            onAction={() => handleSuggestionAction(s)}
            onDismiss={() => dismissSuggestion(s.sender_email)}
          />
        ))}

        {suggestions !== null && visibleSuggestions.length === 0 && (
          <p className="text-xs text-muted-foreground py-1">
            No mixed-signal senders found — all your senders look clean or are already handled.
          </p>
        )}
      </div>

    </div>
  );
}
