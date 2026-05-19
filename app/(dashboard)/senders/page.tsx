import { auth }         from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { redirect }      from 'next/navigation';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Badge }   from '@/components/ui/badge';
import { Button }  from '@/components/ui/button';
import { Pin, EyeOff, X, Users } from 'lucide-react';
import { SendersTable, type FullSenderRow } from '@/components/senders/senders-table';
import { clearSenderRule } from '@/app/actions/senders';

export const metadata = { title: 'Senders — Inbox Triage' };

// ─── helpers ──────────────────────────────────────────────────────────────────

// Overdue = open commitment older than 14 days
const OVERDUE_MS = 14 * 24 * 60 * 60 * 1000;

function computeHealth(open: number, total: number): FullSenderRow['health'] {
  const openRatio = total > 0 ? open / total : 0;
  if (openRatio > 0.6 || open >= 5) return 'red';
  if (openRatio > 0.3 || open >= 2) return 'yellow';
  return 'green';
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function SendersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;

  // ── Parallel fetches ───────────────────────────────────────────────────────
  const [
    { data: scoresRaw },
    { data: commitmentsRaw },
    { data: rulesRaw },
  ] = await Promise.all([
    // Triage signal data
    supabaseAdmin
      .from('sender_scores')
      .select('sender_email, score, reply_count, dismiss_count')
      .eq('user_id', userId),

    // All outgoing commitments ever (for all-time relationship view)
    supabaseAdmin
      .from('commitments')
      .select('counterparty_email, counterparty, status, scanned_at')
      .eq('user_id', userId)
      .eq('direction', 'outgoing'),

    // Explicit override rules
    supabaseAdmin
      .from('sender_rules')
      .select('sender_email, sender_domain, rule_type, rule_value, created_at')
      .eq('user_id', userId)
      .eq('rule_type', 'priority')
      .order('created_at', { ascending: false }),
  ]);

  // ── Build unified sender map ───────────────────────────────────────────────

  const nowMs = Date.now();

  // Start with commitment data (many senders won't have scores yet)
  const map = new Map<string, {
    name:         string | null;
    score:        number | null;
    replyCount:   number;
    dismissCount: number;
    open:         number;
    done:         number;
    overdue:      number;
    lastDate:     string | null;
    rule:         'always' | 'never' | null;
  }>();

  // Layer 1: commitments
  for (const c of (commitmentsRaw ?? [])) {
    const email = (c.counterparty_email ?? '').toLowerCase().trim();
    if (!email) continue;

    if (!map.has(email)) {
      map.set(email, {
        name: c.counterparty ?? null,
        score: null, replyCount: 0, dismissCount: 0,
        open: 0, done: 0, overdue: 0, lastDate: null, rule: null,
      });
    }
    const row = map.get(email)!;

    // Keep most specific name seen
    if (!row.name && c.counterparty) row.name = c.counterparty;

    const isOpen   = c.status === 'open';
    const isDone   = c.status === 'done';
    const ageMs    = nowMs - new Date(c.scanned_at).getTime();
    const isOverdue = isOpen && ageMs > OVERDUE_MS;

    if (isOpen) { row.open += 1; if (isOverdue) row.overdue += 1; }
    if (isDone) row.done += 1;

    // Most recent commitment date
    if (!row.lastDate || c.scanned_at > row.lastDate) row.lastDate = c.scanned_at;
  }

  // Layer 2: triage scores (add or enrich existing entries)
  for (const s of (scoresRaw ?? [])) {
    const email = (s.sender_email ?? '').toLowerCase().trim();
    if (!email) continue;

    if (!map.has(email)) {
      map.set(email, {
        name: null, score: null, replyCount: 0, dismissCount: 0,
        open: 0, done: 0, overdue: 0, lastDate: null, rule: null,
      });
    }
    const row = map.get(email)!;
    row.score        = s.score        ?? null;
    row.replyCount   = s.reply_count  ?? 0;
    row.dismissCount = s.dismiss_count ?? 0;
  }

  // Layer 3: rules
  for (const r of (rulesRaw ?? [])) {
    const email = (r.sender_email ?? '').toLowerCase().trim();
    if (!email) continue;
    const row = map.get(email);
    if (row) row.rule = r.rule_value === 'always' ? 'always' : r.rule_value === 'never' ? 'never' : null;
  }

  // ── Build output rows ──────────────────────────────────────────────────────

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
      lastDate:     r.lastDate,
      rule:         r.rule,
      health:       computeHealth(r.open, r.open + r.done),
    }))
    // Default sort: red first, then by open desc
    .sort((a, b) => {
      const hDiff = (['red', 'yellow', 'green'].indexOf(a.health)) -
                    (['red', 'yellow', 'green'].indexOf(b.health));
      if (hDiff !== 0) return hDiff;
      return (b.open + b.overdue) - (a.open + a.overdue);
    });

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalSenders   = rows.length;
  const needsAttention = rows.filter((r) => r.health === 'red').length;
  const withOverdue    = rows.filter((r) => r.overdue > 0).length;
  const pinnedCount    = (rulesRaw ?? []).filter((r) => r.rule_value === 'always').length;
  const suppressedCount = (rulesRaw ?? []).filter((r) => r.rule_value === 'never').length;

  return (
    <div className="max-w-5xl space-y-6">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Senders</h2>
          <p className="text-sm text-muted-foreground">
            Relationship health, triage signal, and commitment status for everyone in your inbox.
          </p>
        </div>
      </div>

      {/* ── Summary stat chips ────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="w-3.5 h-3.5" />
          <span><strong className="text-foreground">{totalSenders}</strong> sender{totalSenders !== 1 ? 's' : ''}</span>
        </div>
        {needsAttention > 0 && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span><strong className="text-red-500">{needsAttention}</strong> need{needsAttention === 1 ? 's' : ''} attention</span>
          </div>
        )}
        {withOverdue > 0 && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span><strong className="text-foreground">{withOverdue}</strong> with overdue commitments</span>
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

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> On track — low commitment backlog</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> Worth watching — backlog growing</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Needs attention — high or overdue backlog</span>
        <span className="flex items-center gap-1.5 ml-2 border-l border-border pl-5">
          Score = triage signal (reply vs. dismiss rate). Hover for details.
        </span>
      </div>

      {/* ── Unified table ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">All senders</CardTitle>
          <CardDescription>
            Sorted by relationship health by default. Click any column header to re-sort.
            Click a sender name to search Gmail.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <SendersTable rows={rows} />
        </CardContent>
      </Card>

      {/* ── Override rules summary ─────────────────────────────────────────── */}
      {(rulesRaw ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Override rules</CardTitle>
            <CardDescription>
              Manual rules take precedence over learned scores.
              Remove a rule to let the AI resume scoring that sender normally.
            </CardDescription>
          </CardHeader>
          <div className="divide-y divide-border">
            {(rulesRaw ?? []).map((r) => {
              const label = r.sender_email || r.sender_domain || '—';
              return (
                <div
                  key={`${r.sender_email}|${r.sender_domain}|${r.rule_value}`}
                  className="px-5 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="text-sm truncate">{label}</span>
                    {r.rule_value === 'always' ? (
                      <Badge variant="default" className="text-[10px] py-0 gap-1">
                        <Pin className="w-2.5 h-2.5" /> Pinned
                      </Badge>
                    ) : r.rule_value === 'never' ? (
                      <Badge variant="secondary" className="text-[10px] py-0 gap-1 text-muted-foreground">
                        <EyeOff className="w-2.5 h-2.5" /> Suppressed
                      </Badge>
                    ) : null}
                  </div>
                  <form action={clearSenderRule}>
                    <input type="hidden" name="sender_email"  value={r.sender_email  ?? ''} />
                    <input type="hidden" name="sender_domain" value={r.sender_domain ?? ''} />
                    <Button variant="ghost" size="sm" type="submit"
                      className="h-7 px-2 text-xs gap-1 text-muted-foreground">
                      <X className="w-3 h-3" /> Remove
                    </Button>
                  </form>
                </div>
              );
            })}
          </div>
        </Card>
      )}

    </div>
  );
}
