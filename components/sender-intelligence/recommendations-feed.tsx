'use client';

import { useState, useEffect } from 'react';
import {
  X, Zap, Archive, MailX, AlertTriangle, Trash2,
  Sparkles, TrendingDown, Globe, ChevronDown,
} from 'lucide-react';
import { Button }      from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn }          from '@/lib/utils';
import type { SenderRow }    from './sender-intelligence-client';
import type { EmailTypeStat } from '@/app/actions/engagement';

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
  impactLabel: string;
  variant:     RecommendationVariant;
  actions?:    RecommendationAction[];
};

// ── localStorage key ──────────────────────────────────────────────────────────
const DISMISSED_RECS_KEY = 'inbox-triage:dismissed-recs';

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

const UNSUB_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

function isStillReceiving(s: SenderRow): boolean {
  if (s.unsubscribe_status !== 'unsubscribed' || !s.unsubscribed_at || !s.last_email_date) return false;
  return new Date(s.last_email_date).getTime() >
         new Date(s.unsubscribed_at).getTime() + UNSUB_GRACE_MS;
}

// ── Recommendation generation ─────────────────────────────────────────────────

export function generateRecommendations(
  allSenders:        SenderRow[],
  typeStatsBySender: Record<string, EmailTypeStat[]>,
  userDomain?:       string | null,
): Recommendation[] {
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
  const spammers = senders.filter(isStillReceiving);
  if (spammers.length >= 1) {
    spammers.forEach((s) => claimed.add(s.sender_email));
    const n = spammers.length;
    recs.push({
      id:          'report_spam',
      icon:        <AlertTriangle className="w-4 h-4" />,
      title:       `${n} sender${n > 1 ? 's are' : ' is'} ignoring your unsubscribe`,
      description: `You asked ${n > 1 ? 'these senders' : 'this sender'} to stop, but the emails kept coming.`,
      senders:     spammers,
      action:      'report_spam',
      actionLabel: 'Report as spam',
      impactLabel: `blocks ~${weeklyRate(spammers, periodDays)} emails/week`,
      variant:     'destructive',
    });
  }

  // ── 2. Tiered Never Engage cleanup ───────────────────────────────────────
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
    const n           = neverEngageAll.length;
    const totalEmails = neverEngageAll.reduce((sum, s) => sum + (s.emails_received ?? 0), 0);
    recs.push({
      id:          'tiered_never_engage',
      icon:        <Sparkles className="w-4 h-4" />,
      title:       `${n} senders you never open — ~${totalEmails.toLocaleString()} noise emails`,
      description: `${neverWithUnsub.length} have unsubscribe links; ${neverWithoutUnsub.length} don't.`,
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
      description: `You haven't opened a single email from ${n > 1 ? 'these senders' : 'this sender'}.`,
      senders:     neverUnsub,
      action:      'unsubscribe',
      actionLabel: n > 1 ? 'Unsubscribe all' : 'Unsubscribe',
      impactLabel: `stops ~${weeklyRate(neverUnsub, periodDays)} emails/week`,
      variant:     'default',
    });
  }

  // ── 4. High trash-rate senders ────────────────────────────────────────────
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
      description: `You trash over 60% of emails from ${n > 1 ? 'these senders' : 'this sender'} without opening them.`,
      senders:     highTrash,
      action:      'unsubscribe',
      actionLabel: n > 1 ? 'Unsubscribe all' : 'Unsubscribe',
      impactLabel: `stops ~${weeklyRate(highTrash, periodDays)} emails/week`,
      variant:     'default',
    });
  }

  // ── 5. High-frequency noise ───────────────────────────────────────────────
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
      description: `5+ emails per week, under 20% open rate.`,
      senders:     highFrequency,
      action:      'unsubscribe',
      actionLabel: n > 1 ? 'Unsubscribe all' : 'Unsubscribe',
      impactLabel: `stops ~${weeklyRate(highFrequency, periodDays)} emails/week`,
      variant:     'default',
    });
  }

  // ── 6. Engagement decay ───────────────────────────────────────────────────
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
      description: `Open rate is now under 12% — interest has faded.`,
      senders:     decaySenders,
      action:      'unsubscribe',
      actionLabel: n > 1 ? 'Unsubscribe all' : 'Unsubscribe',
      impactLabel: `stops ~${weeklyRate(decaySenders, periodDays)} emails/week`,
      variant:     'warning',
    });
  }

  // ── 7. Promo-heavy senders ────────────────────────────────────────────────
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
      title:       `${totalPromoEmails.toLocaleString()} unread promos from ${n} senders`,
      description: `Mostly promotions with under 10% open rate.`,
      senders:     promoHeavy,
      action:      'unsubscribe',
      actionLabel: n > 1 ? 'Unsubscribe all' : 'Unsubscribe',
      impactLabel: `stops ~${weeklyRate(promoHeavy, periodDays)} emails/week`,
      variant:     'default',
    });
  }

  // ── 8. Domain-level auto-archive ──────────────────────────────────────────
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
    const n           = clusterSenders.length;
    const totalEmails = clusterSenders.reduce((sum, s) => sum + s.emails_received, 0);
    recs.push({
      id:          'domain_cluster_archive',
      icon:        <Globe className="w-4 h-4" />,
      title:       `${n} noise senders from ${domain}`,
      description: `${totalEmails.toLocaleString()} emails combined — all low-engagement.`,
      senders:     clusterSenders,
      action:      'auto_archive',
      actionLabel: `Auto-archive ${domain}`,
      impactLabel: `keeps ~${weeklyRate(clusterSenders, periodDays)} emails/week out of inbox`,
      variant:     'default',
    });
  }

  // ── 9. High delete rate, no unsub link → auto-archive ───────────────────
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
      description: `Deleting 50%+ but no unsubscribe link — auto-archive keeps them out of inbox.`,
      senders:     highDeleteNoUnsub,
      action:      'auto_archive',
      actionLabel: n > 1 ? 'Auto-archive all' : 'Auto-archive',
      impactLabel: `keeps ~${weeklyRate(highDeleteNoUnsub, periodDays)} emails/week out of inbox`,
      variant:     'default',
    });
  }

  // ── 10. Low-engagement senders with no unsub link → auto-archive ─────────
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
      description: `No unsubscribe option, but you can keep them out of your inbox.`,
      senders:     archiveCandidates,
      action:      'auto_archive',
      actionLabel: n > 1 ? 'Auto-archive all' : 'Auto-archive',
      impactLabel: `keeps ~${weeklyRate(archiveCandidates, periodDays)} emails/week out of inbox`,
      variant:     'default',
    });
  }

  return recs.slice(0, 6);
}

// ── Clean-all rec (outside the 6-cap — always shown when qualifying) ──────────
// Separate from generateRecommendations because it's a distinct, destructive
// action (wipes existing email history) rather than a forward-looking suggestion.

export function generateCleanAllRec(
  allSenders:  SenderRow[],
  userDomain?: string | null,
): Recommendation | null {
  const senders = userDomain
    ? allSenders.filter(
        (s) => !(s.sender_domain === userDomain || s.sender_email.toLowerCase().endsWith('@' + userDomain)),
      )
    : allSenders;

  const neverEngage = senders.filter(
    (s) => s.category === 'never_engage' && s.emails_received >= 1,
  );
  if (neverEngage.length < 2) return null;

  const periodDays  = senders[0]?.period_days ?? 90;
  const totalEmails = neverEngage.reduce((n, s) => n + s.emails_received, 0);

  return {
    id:          'clean_never_engage',
    icon:        <Trash2 className="w-4 h-4" />,
    title:       `Wipe ${neverEngage.length} Never Open senders`,
    description: `Unsubscribes where possible and permanently deletes ${totalEmails.toLocaleString()} existing emails. Cannot be undone.`,
    senders:     neverEngage,
    action:      'clean_never_engage',
    actionLabel: 'Wipe & unsubscribe',
    impactLabel: `removes ~${totalEmails.toLocaleString()} existing emails · stops ~${weeklyRate(neverEngage, periodDays)}/week`,
    variant:     'destructive',
  };
}

// ── RecommendationsButton ─────────────────────────────────────────────────────

export function RecommendationsButton({
  senders,
  typeStatsBySender,
  onAction,
  onCleanNeverEngage,
  isFree,
  userDomain,
}: {
  senders:              SenderRow[];
  typeStatsBySender:    Record<string, EmailTypeStat[]>;
  onAction:             (action: string, senders: SenderRow[]) => void;
  onCleanNeverEngage?:  () => void;
  isFree?:              boolean;
  userDomain?:          string | null;
}) {
  const [dismissed,          setDismissed]          = useState<Set<string>>(new Set());
  const [localStorageLoaded, setLocalStorageLoaded] = useState(false);
  const [open,               setOpen]               = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISMISSED_RECS_KEY);
      if (stored) setDismissed(new Set(JSON.parse(stored) as string[]));
    } catch {}
    setLocalStorageLoaded(true);
  }, []);

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set([...prev, id]);
      try { localStorage.setItem(DISMISSED_RECS_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  if (!localStorageLoaded) return null;

  const recs     = generateRecommendations(senders, typeStatsBySender, userDomain)
    .filter((r) => !dismissed.has(r.id));
  const cleanRec = onCleanNeverEngage && !dismissed.has('clean_never_engage')
    ? generateCleanAllRec(senders, userDomain)
    : null;

  if (recs.length === 0 && !cleanRec) return null;

  const totalCount = recs.length + (cleanRec ? 1 : 0);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-8 text-xs border-amber-200 text-amber-700 hover:bg-amber-50 hover:border-amber-300"
        >
          <Zap className="w-3.5 h-3.5" />
          Actions · {totalCount}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="px-3 py-2 border-b border-border">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Recommended Actions
          </p>
        </div>
        {recs.map((rec, i) => (
          <div key={rec.id}>
            {i > 0 && <div className="border-t border-border/50 mx-3" />}
            <div className="px-3 py-2.5">
              <div className="flex items-start gap-2.5">
                {/* Icon */}
                <div className={cn(
                  'mt-0.5 shrink-0',
                  rec.variant === 'destructive' ? 'text-red-500' : 'text-amber-500',
                )}>
                  {rec.icon}
                </div>
                {/* Body */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug">{rec.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{rec.impactLabel}</p>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {isFree && rec.senders.length > 1 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs"
                        onClick={() => { setOpen(false); window.location.href = '/billing'; }}
                      >
                        Unlock with Pro
                        <span className="ml-1.5 text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded">Pro</span>
                      </Button>
                    ) : rec.actions && rec.actions.length > 0 ? (
                      rec.actions.map((a, j) => (
                        <Button
                          key={a.action + j}
                          size="sm"
                          variant={j === 0 ? 'default' : 'outline'}
                          className="h-6 text-xs"
                          onClick={() => { onAction(a.action, a.senders); setOpen(false); }}
                        >
                          {a.label}
                        </Button>
                      ))
                    ) : (
                      <Button
                        size="sm"
                        variant={rec.variant === 'destructive' ? 'destructive' : 'outline'}
                        className="h-6 text-xs"
                        onClick={() => { onAction(rec.action, rec.senders); setOpen(false); }}
                      >
                        {rec.actionLabel}
                      </Button>
                    )}
                  </div>
                </div>
                {/* Dismiss */}
                <button
                  onClick={(e) => { e.stopPropagation(); dismiss(rec.id); }}
                  className="text-muted-foreground/40 hover:text-muted-foreground transition-colors mt-0.5 shrink-0"
                  title="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* ── Clean Never Engage — destructive, always below a hard separator ── */}
        {cleanRec && (
          <>
            <div className="border-t-2 border-border mx-0 my-0" />
            <div className="px-3 py-2.5 bg-red-50/60">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 shrink-0 text-red-500">{cleanRec.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug text-red-900">{cleanRec.title}</p>
                  <p className="text-[11px] text-red-700/70 mt-0.5">{cleanRec.impactLabel}</p>
                  <p className="text-[11px] text-red-600/60 mt-0.5 italic">Cannot be undone.</p>
                  <div className="mt-2">
                    {isFree && cleanRec.senders.length > 1 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs"
                        onClick={() => { setOpen(false); window.location.href = '/billing'; }}
                      >
                        Unlock with Pro
                        <span className="ml-1.5 text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded">Pro</span>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-6 text-xs"
                        onClick={() => { onCleanNeverEngage!(); setOpen(false); }}
                      >
                        {cleanRec.actionLabel}
                      </Button>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); dismiss('clean_never_engage'); }}
                  className="text-red-300 hover:text-red-600 transition-colors mt-0.5 shrink-0"
                  title="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
