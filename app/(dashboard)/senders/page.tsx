import { auth }         from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { redirect }      from 'next/navigation';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Pin, EyeOff, Users } from 'lucide-react';
import { SendersTable, type FullSenderRow } from '@/components/senders/senders-table';
import Link from 'next/link';

export const metadata = { title: 'Senders — Inbox Triage' };

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

export default async function SendersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;

  const todayISO = new Date().toISOString().slice(0, 10);

  const [
    { data: scoresRaw },
    { data: commitmentsRaw },
    { data: rulesRaw },
  ] = await Promise.all([
    supabaseAdmin
      .from('sender_scores')
      .select('sender_email, score, reply_count, dismiss_count')
      .eq('user_id', userId),

    // Both directions — full relationship picture
    supabaseAdmin
      .from('commitments')
      .select('counterparty_email, counterparty, status, scanned_at, due_date')
      .eq('user_id', userId),

    supabaseAdmin
      .from('sender_rules')
      .select('sender_email, sender_domain, rule_type, rule_value, created_at')
      .eq('user_id', userId)
      .eq('rule_type', 'priority')
      .order('created_at', { ascending: false }),
  ]);

  const map = new Map<string, {
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

  // Layer 1: commitments (both directions)
  for (const c of (commitmentsRaw ?? [])) {
    const email = (c.counterparty_email ?? '').toLowerCase().trim();
    if (!email) continue;

    if (!map.has(email)) {
      map.set(email, {
        name: c.counterparty ?? null,
        score: null, replyCount: 0, dismissCount: 0,
        open: 0, done: 0, overdue: 0, hasOverdue: false, lastDate: null, rule: null,
      });
    }
    const row = map.get(email)!;

    if (!row.name && c.counterparty) row.name = c.counterparty;

    const isOpen    = c.status === 'open';
    const isDone    = c.status === 'done';
    // Overdue = open AND has a past due_date
    const isOverdue = isOpen && !!c.due_date && c.due_date < todayISO;

    if (isOpen) {
      row.open += 1;
      if (isOverdue) { row.overdue += 1; row.hasOverdue = true; }
    }
    if (isDone) row.done += 1;
    if (!row.lastDate || c.scanned_at > row.lastDate) row.lastDate = c.scanned_at;
  }

  // Layer 2: triage scores
  for (const s of (scoresRaw ?? [])) {
    const email = (s.sender_email ?? '').toLowerCase().trim();
    if (!email) continue;

    if (!map.has(email)) {
      map.set(email, {
        name: null, score: null, replyCount: 0, dismissCount: 0,
        open: 0, done: 0, overdue: 0, hasOverdue: false, lastDate: null, rule: null,
      });
    }
    const row = map.get(email)!;
    row.score        = s.score         ?? null;
    row.replyCount   = s.reply_count   ?? 0;
    row.dismissCount = s.dismiss_count ?? 0;
  }

  // Layer 3: email-level rules
  for (const r of (rulesRaw ?? [])) {
    const email = (r.sender_email ?? '').toLowerCase().trim();
    if (!email) continue;
    const row = map.get(email);
    if (row) row.rule = r.rule_value === 'always' ? 'always' : r.rule_value === 'never' ? 'never' : null;
  }

  const rows: FullSenderRow[] = [...map.entries()]
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

  // Summary stats
  const totalSenders    = rows.length;
  const needsAttention  = rows.filter((r) => r.health === 'red').length;
  const withOverdue     = rows.filter((r) => r.overdue > 0).length;
  const pinnedCount     = (rulesRaw ?? []).filter((r) => r.rule_value === 'always').length;
  const suppressedCount = (rulesRaw ?? []).filter((r) => r.rule_value === 'never').length;

  // Domain-level rules (shown as a link, not a full card)
  const domainRulesCount = (rulesRaw ?? []).filter(
    (r) => r.sender_domain && !r.sender_email,
  ).length;

  // Empty state
  if (rows.length === 0) {
    return (
      <div className="max-w-4xl space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Senders</h2>
          <p className="text-sm text-muted-foreground">
            Relationship health, triage signal, and commitment status for everyone in your inbox.
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <p className="text-sm font-medium">No sender data yet</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Run a triage session and the extension will start building your sender profile automatically.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Senders</h2>
          <p className="text-sm text-muted-foreground">
            Relationship health, triage signal, and commitment status for everyone in your inbox.
          </p>
        </div>
      </div>

      {/* Summary stat chips */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="w-3.5 h-3.5" />
          <span>
            <strong className="text-foreground">{totalSenders}</strong>{' '}
            sender{totalSenders !== 1 ? 's' : ''}
          </span>
        </div>
        {needsAttention > 0 && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span>
              <strong className="text-red-500">{needsAttention}</strong>{' '}
              need{needsAttention === 1 ? 's' : ''} attention
            </span>
          </div>
        )}
        {withOverdue > 0 && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span>
              <strong className="text-foreground">{withOverdue}</strong> with overdue commitments
            </span>
          </div>
        )}
        {pinnedCount > 0 && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Pin className="w-3.5 h-3.5" />
            <span><strong className="text-foreground">{pinnedCount}</strong> pinned</span>
          </div>
        )}
        {suppressedCount > 0 && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <EyeOff className="w-3.5 h-3.5" />
            <span><strong className="text-foreground">{suppressedCount}</strong> suppressed</span>
          </div>
        )}
      </div>

      {/* Main table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">All senders</CardTitle>
          <CardDescription>
            Sorted by relationship health. Click any column header to re-sort.
            Click a sender name to search Gmail.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <SendersTable rows={rows} />
        </CardContent>
      </Card>

      {/* Domain rules link — only shown if domain-level rules exist */}
      {domainRulesCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {domainRulesCount} domain rule{domainRulesCount !== 1 ? 's' : ''} active —{' '}
          <Link href="/preferences#sender-rules" className="underline underline-offset-2 hover:text-foreground transition-colors">
            manage in Preferences
          </Link>
        </p>
      )}

    </div>
  );
}
