'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Pin, EyeOff, X, ArrowUpDown, ArrowUp, ArrowDown, Search } from 'lucide-react';
import { Badge }  from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { pinSender, suppressSender, clearSenderRule } from '@/app/actions/senders';

// ─── types ────────────────────────────────────────────────────────────────────

export type FullSenderRow = {
  email:        string;
  name:         string | null;
  // From sender_scores (null = never appeared in triage)
  score:        number | null;   // 0–1
  replyCount:   number;
  dismissCount: number;
  // From commitments (all time)
  open:         number;
  done:         number;
  overdue:      number;
  lastDate:     string | null;
  // From sender_rules
  rule:         'always' | 'never' | null;
  // Computed
  health:       'green' | 'yellow' | 'red';
};

type SortKey = 'name' | 'score' | 'open' | 'overdue' | 'lastDate' | 'health';
type SortDir = 'asc' | 'desc';

// ─── helpers ──────────────────────────────────────────────────────────────────

const HEALTH_ORDER: Record<FullSenderRow['health'], number> = { red: 0, yellow: 1, green: 2 };

function relativeDate(isoDate: string | null): string {
  if (!isoDate) return '—';
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)   return `${days}d ago`;
  if (days < 30)  return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function ScoreBar({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const pct   = Math.round(score * 100);
  const color = score >= 0.7 ? 'bg-green-500' : score >= 0.4 ? 'bg-chart-2' : 'bg-muted-foreground/40';
  return (
    <div
      className="flex items-center gap-2"
      title={`Triage score: ${pct}% — based on how often you reply vs. dismiss emails from this sender during triage`}
    >
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[48px]">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-7 text-right shrink-0">{pct}%</span>
    </div>
  );
}

const HEALTH_DOT_CLS: Record<FullSenderRow['health'], string> = {
  green:  'bg-green-500',
  yellow: 'bg-amber-400',
  red:    'bg-red-500',
};
const HEALTH_TITLE: Record<FullSenderRow['health'], string> = {
  green:  'On track',
  yellow: 'Worth watching',
  red:    'Needs attention',
};

// ─── sort header ──────────────────────────────────────────────────────────────

function SortTh({
  label, sortKey, current, dir, onClick, className,
}: {
  label: string; sortKey: SortKey;
  current: SortKey; dir: SortDir;
  onClick: (k: SortKey) => void;
  className?: string;
}) {
  const active = current === sortKey;
  return (
    <th
      className={cn('pb-2 font-medium cursor-pointer select-none whitespace-nowrap group', className)}
      onClick={() => onClick(sortKey)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active
          ? (dir === 'asc' ? <ArrowUp className="w-3 h-3 opacity-70" /> : <ArrowDown className="w-3 h-3 opacity-70" />)
          : <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity" />
        }
      </span>
    </th>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function SendersTable({ rows }: { rows: FullSenderRow[] }) {
  const [query,   setQuery]   = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('health');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Sensible defaults per column
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return rows.filter(
      (r) => !q || r.email.toLowerCase().includes(q) || (r.name ?? '').toLowerCase().includes(q),
    );
  }, [rows, query]);

  const sorted = useMemo(() => {
    const mult = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'health':   return mult * (HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health]);
        case 'score':    return mult * ((a.score ?? -1) - (b.score ?? -1));
        case 'open':     return mult * (a.open    - b.open);
        case 'overdue':  return mult * (a.overdue - b.overdue);
        case 'lastDate':
          return mult * ((a.lastDate ?? '').localeCompare(b.lastDate ?? ''));
        case 'name':
          return mult * (a.name ?? a.email).localeCompare(b.name ?? b.email);
        default: return 0;
      }
    });
  }, [filtered, sortKey, sortDir]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
        <p className="text-sm font-medium">No sender data yet</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Run a triage session and the extension will start building your sender profile.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter senders…"
          className="h-8 pl-8 text-sm"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-xs text-muted-foreground border-b border-border">
              <SortTh label="Sender"       sortKey="name"     current={sortKey} dir={sortDir} onClick={toggleSort} className="pl-3 text-left" />
              <SortTh label="Score"        sortKey="score"    current={sortKey} dir={sortDir} onClick={toggleSort} className="text-left w-32 px-3" />
              <th className="pb-2 font-medium text-left px-3 w-32">Triage</th>
              <SortTh label="Open"         sortKey="open"     current={sortKey} dir={sortDir} onClick={toggleSort} className="text-right w-14 pr-2" />
              <SortTh label="Overdue"      sortKey="overdue"  current={sortKey} dir={sortDir} onClick={toggleSort} className="text-right w-16 pr-2" />
              <th className="pb-2 font-medium text-right w-12 pr-2">Done</th>
              <SortTh label="Last seen"    sortKey="lastDate" current={sortKey} dir={sortDir} onClick={toggleSort} className="text-right w-20 pr-3" />
              <th className="pb-2 font-medium text-right w-28 pr-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  No senders match &ldquo;{query}&rdquo;
                </td>
              </tr>
            ) : (
              sorted.map((row) => {
                const gmailUrl = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`from:${row.email}`)}`;
                return (
                  <tr
                    key={row.email}
                    className="border-b last:border-0 hover:bg-muted/20 transition-colors group"
                  >
                    {/* Sender */}
                    <td className="py-2.5 pl-3 pr-2 max-w-[180px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn('w-2 h-2 rounded-full shrink-0', HEALTH_DOT_CLS[row.health])}
                          title={HEALTH_TITLE[row.health]}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            <a
                              href={gmailUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate font-medium hover:underline text-sm"
                              title={`Search Gmail: from:${row.email}`}
                            >
                              {row.name || row.email}
                            </a>
                            {row.rule === 'always' && (
                              <Badge variant="default" className="text-[10px] py-0 h-4 gap-0.5 shrink-0">
                                <Pin className="w-2.5 h-2.5" /> Pinned
                              </Badge>
                            )}
                            {row.rule === 'never' && (
                              <Badge variant="secondary" className="text-[10px] py-0 h-4 gap-0.5 shrink-0 text-muted-foreground">
                                <EyeOff className="w-2.5 h-2.5" /> Suppressed
                              </Badge>
                            )}
                          </div>
                          {row.name && (
                            <span className="block truncate text-xs text-muted-foreground">{row.email}</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Score bar */}
                    <td className="py-2.5 px-3">
                      <ScoreBar score={row.score} />
                    </td>

                    {/* Triage activity */}
                    <td className="py-2.5 px-3">
                      {row.replyCount === 0 && row.dismissCount === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          <span className="text-green-600 dark:text-green-400 font-medium">{row.replyCount}↩</span>
                          {' · '}
                          <span className="text-muted-foreground">{row.dismissCount}✕</span>
                        </span>
                      )}
                    </td>

                    {/* Open */}
                    <td className={cn('py-2.5 pr-2 text-right tabular-nums font-medium text-sm',
                      row.open > 0 && row.health === 'red' ? 'text-red-500' :
                      row.open > 0 && row.health === 'yellow' ? 'text-amber-500' : ''
                    )}>
                      {row.open || '—'}
                    </td>

                    {/* Overdue */}
                    <td className="py-2.5 pr-2 text-right tabular-nums text-sm">
                      {row.overdue > 0 ? (
                        <span className="text-red-500 font-medium">{row.overdue}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Done */}
                    <td className="py-2.5 pr-2 text-right tabular-nums text-sm text-muted-foreground">
                      {row.done || '—'}
                    </td>

                    {/* Last seen */}
                    <td className="py-2.5 pr-3 text-right text-xs text-muted-foreground tabular-nums">
                      {relativeDate(row.lastDate)}
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 pr-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {row.rule ? (
                          <form action={clearSenderRule}>
                            <input type="hidden" name="sender_email" value={row.email} />
                            <Button variant="ghost" size="sm" type="submit"
                              className="h-6 px-2 text-xs gap-1 text-muted-foreground">
                              <X className="w-3 h-3" /> Clear
                            </Button>
                          </form>
                        ) : (
                          <>
                            <form action={pinSender}>
                              <input type="hidden" name="sender_email" value={row.email} />
                              <Button variant="ghost" size="sm" type="submit"
                                className="h-6 px-2 text-xs gap-1"
                                title="Always surface emails from this sender">
                                <Pin className="w-3 h-3" /> Pin
                              </Button>
                            </form>
                            <form action={suppressSender}>
                              <input type="hidden" name="sender_email" value={row.email} />
                              <Button variant="ghost" size="sm" type="submit"
                                className="h-6 px-2 text-xs gap-1 text-muted-foreground"
                                title="Never surface emails from this sender">
                                <EyeOff className="w-3 h-3" /> Suppress
                              </Button>
                            </form>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        {sorted.length} of {rows.length} sender{rows.length !== 1 ? 's' : ''}
        {query && ` matching "${query}"`}
      </p>
    </div>
  );
}
