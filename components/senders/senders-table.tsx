'use client';

import { useState, useMemo, useTransition } from 'react';
import Link        from 'next/link';
import { cn }      from '@/lib/utils';
import { toast }   from 'sonner';
import {
  Pin, EyeOff, X, ArrowUpDown, ArrowUp, ArrowDown, Search,
  Bot, ListChecks, Info,
} from 'lucide-react';
import { Badge }   from '@/components/ui/badge';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { pinSender, suppressSender, clearSenderRule } from '@/app/actions/senders';

// ─── automated sender detection ───────────────────────────────────────────────

const AUTO_PATTERNS = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'notifications', 'newsletter', 'mailer-daemon', 'postmaster',
  'bounce', 'alert', 'automated', 'robot', 'noreply+',
];

function isAutomatedSender(email: string): boolean {
  const local = email.split('@')[0].toLowerCase();
  return AUTO_PATTERNS.some((p) => local.includes(p));
}

// ─── types ────────────────────────────────────────────────────────────────────

export type FullSenderRow = {
  email:        string;
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
  health:       'green' | 'yellow' | 'red';
};

type SortKey  = 'name' | 'score' | 'open' | 'overdue' | 'lastDate' | 'health';
type SortDir  = 'asc' | 'desc';
type FilterKey = 'all' | 'needs-attention' | 'pinned' | 'suppressed';

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

function ScoreBar({ score, totalInteractions }: { score: number | null; totalInteractions: number }) {
  if (score === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const pct   = Math.round(score * 100);
  const color =
    score >= 0.7 ? 'bg-green-500' :
    score >= 0.4 ? 'bg-chart-2'   :
    'bg-muted-foreground/40';
  return (
    <div
      className="space-y-0.5"
      title={`Triage score: ${pct}% — based on how often you reply vs. dismiss emails from this sender during triage`}
    >
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[48px]">
          <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground w-7 text-right shrink-0">{pct}%</span>
      </div>
      {totalInteractions > 0 && (
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {totalInteractions} interaction{totalInteractions !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

const HEALTH_DOT_CLS: Record<FullSenderRow['health'], string> = {
  green:  'bg-green-500',
  yellow: 'bg-amber-400',
  red:    'bg-red-500',
};
const HEALTH_TITLE: Record<FullSenderRow['health'], string> = {
  green:  'On track — low commitment backlog',
  yellow: 'Worth watching — backlog growing',
  red:    'Needs attention — has overdue commitments',
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
          ? (dir === 'asc'
              ? <ArrowUp   className="w-3 h-3 opacity-70" />
              : <ArrowDown className="w-3 h-3 opacity-70" />)
          : <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity" />
        }
      </span>
    </th>
  );
}

// ─── filter chips ─────────────────────────────────────────────────────────────

function FilterChips({
  active,
  counts,
  onChange,
}: {
  active: FilterKey;
  counts: Record<FilterKey, number>;
  onChange: (f: FilterKey) => void;
}) {
  const chips: { key: FilterKey; label: string }[] = [
    { key: 'all',              label: 'All'              },
    { key: 'needs-attention',  label: 'Needs attention'  },
    { key: 'pinned',           label: 'Pinned'           },
    { key: 'suppressed',       label: 'Suppressed'       },
  ];
  // Only show chips with content (except 'all')
  const visible = chips.filter((c) => c.key === 'all' || counts[c.key] > 0);
  if (visible.length <= 1) return null; // only 'all' — no point showing

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border',
            active === key
              ? 'bg-primary/10 text-primary border-primary/30'
              : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-input',
          )}
        >
          {label}
          {key !== 'all' && (
            <span className={cn(
              'inline-flex items-center justify-center rounded-full w-4 h-4 text-[10px]',
              active === key ? 'bg-primary/20' : 'bg-muted',
            )}>
              {counts[key]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function SendersTable({ rows }: { rows: FullSenderRow[] }) {
  const [query,      setQuery]      = useState('');
  const [sortKey,    setSortKey]    = useState<SortKey>('health');
  const [sortDir,    setSortDir]    = useState<SortDir>('asc');
  const [filterKey,  setFilterKey]  = useState<FilterKey>('all');
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  // Optimistic rule state: email → new rule (overrides server data while pending)
  const [localRules, setLocalRules] = useState<Map<string, 'always' | 'never' | null>>(new Map());
  const [, startTransition]         = useTransition();
  const [, startBulkTransition]     = useTransition();

  // Effective rule for a row (local override wins)
  function effectiveRule(row: FullSenderRow): 'always' | 'never' | null {
    return localRules.has(row.email) ? (localRules.get(row.email) ?? null) : row.rule;
  }

  function setLocalRule(email: string, rule: 'always' | 'never' | null) {
    setLocalRules((m) => new Map(m).set(email, rule));
  }
  function clearLocalRule(email: string) {
    setLocalRules((m) => { const n = new Map(m); n.delete(email); return n; });
  }

  function handlePin(email: string) {
    const prev = localRules.get(email) ?? null;
    setLocalRule(email, 'always');
    startTransition(async () => {
      const res = await pinSender(email);
      if (res.error) {
        setLocalRule(email, prev);
        toast.error(`Failed to pin: ${res.error}`);
      } else {
        toast.success('Sender pinned — always surfaced in triage');
        clearLocalRule(email); // let server state take over after revalidation
      }
    });
  }

  function handleSuppress(email: string) {
    const prev = localRules.get(email) ?? null;
    setLocalRule(email, 'never');
    startTransition(async () => {
      const res = await suppressSender(email);
      if (res.error) {
        setLocalRule(email, prev);
        toast.error(`Failed to suppress: ${res.error}`);
      } else {
        toast.success('Sender suppressed — will no longer appear in triage');
        clearLocalRule(email);
      }
    });
  }

  function handleClear(email: string) {
    const prev = localRules.get(email) ?? null;
    setLocalRule(email, null);
    startTransition(async () => {
      const res = await clearSenderRule(email);
      if (res.error) {
        setLocalRule(email, prev);
        toast.error(`Failed to clear rule: ${res.error}`);
      } else {
        toast.success('Rule removed — sender will be scored normally');
        clearLocalRule(email);
      }
    });
  }

  // ── Bulk actions ────────────────────────────────────────────────────────────

  function handleBulkSuppress() {
    const emails = [...selected];
    emails.forEach((e) => setLocalRule(e, 'never'));
    setSelected(new Set());
    startBulkTransition(async () => {
      const results = await Promise.all(emails.map((e) => suppressSender(e)));
      const failed  = results.filter((r) => r.error).length;
      if (failed > 0) {
        toast.error(`Failed to suppress ${failed} sender${failed !== 1 ? 's' : ''}`);
        emails.forEach((e) => clearLocalRule(e));
      } else {
        toast.success(`Suppressed ${emails.length} sender${emails.length !== 1 ? 's' : ''}`);
        emails.forEach((e) => clearLocalRule(e));
      }
    });
  }

  function handleBulkClearRules() {
    const emails = [...selected];
    emails.forEach((e) => setLocalRule(e, null));
    setSelected(new Set());
    startBulkTransition(async () => {
      const results = await Promise.all(emails.map((e) => clearSenderRule(e)));
      const failed  = results.filter((r) => r.error).length;
      if (failed > 0) {
        toast.error(`Failed to clear ${failed} rule${failed !== 1 ? 's' : ''}`);
        emails.forEach((e) => clearLocalRule(e));
      } else {
        toast.success(`Cleared rules for ${emails.length} sender${emails.length !== 1 ? 's' : ''}`);
        emails.forEach((e) => clearLocalRule(e));
      }
    });
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Score: ascending first (lowest-scored = most worth reviewing)
      // Others: descending first (most open, most overdue, most recent)
      setSortDir(key === 'name' || key === 'score' ? 'asc' : 'desc');
    }
  }

  // Filter chip counts (computed from all rows, not filtered)
  const chipCounts = useMemo<Record<FilterKey, number>>(() => ({
    'all':             rows.length,
    'needs-attention': rows.filter((r) => r.health === 'red').length,
    'pinned':          rows.filter((r) => (localRules.get(r.email) ?? r.rule) === 'always').length,
    'suppressed':      rows.filter((r) => (localRules.get(r.email) ?? r.rule) === 'never').length,
  }), [rows, localRules]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return rows.filter((r) => {
      // Text search
      if (q && !r.email.toLowerCase().includes(q) && !(r.name ?? '').toLowerCase().includes(q)) return false;
      // Filter chip
      const rule = localRules.has(r.email) ? (localRules.get(r.email) ?? null) : r.rule;
      if (filterKey === 'needs-attention' && r.health !== 'red')   return false;
      if (filterKey === 'pinned'          && rule !== 'always')     return false;
      if (filterKey === 'suppressed'      && rule !== 'never')      return false;
      return true;
    });
  }, [rows, query, filterKey, localRules]);

  const sorted = useMemo(() => {
    const mult = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'health':   return mult * (HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health]);
        case 'score':    return mult * ((a.score ?? -1) - (b.score ?? -1));
        case 'open':     return mult * (a.open    - b.open);
        case 'overdue':  return mult * (a.overdue - b.overdue);
        case 'lastDate': return mult * ((a.lastDate ?? '').localeCompare(b.lastDate ?? ''));
        case 'name':     return mult * (a.name ?? a.email).localeCompare(b.name ?? b.email);
        default:         return 0;
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
      {/* Controls row: search + filter chips */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter senders…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <FilterChips active={filterKey} counts={chipCounts} onChange={setFilterKey} />
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/60 border border-border">
          <span className="text-xs text-muted-foreground">
            {selected.size} selected
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={handleBulkSuppress}
          >
            <EyeOff className="w-3 h-3" /> Suppress all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs text-muted-foreground"
            onClick={handleBulkClearRules}
          >
            <X className="w-3 h-3" /> Clear rules
          </Button>
          <button
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-xs text-muted-foreground border-b border-border">
              {/* Select-all checkbox */}
              <th className="pb-2 w-8 pl-3">
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded cursor-pointer accent-primary"
                  checked={selected.size === sorted.length && sorted.length > 0}
                  onChange={() => {
                    if (selected.size === sorted.length) setSelected(new Set());
                    else setSelected(new Set(sorted.map((r) => r.email)));
                  }}
                />
              </th>
              <SortTh label="Sender"              sortKey="name"     current={sortKey} dir={sortDir} onClick={toggleSort} className="pl-1 text-left" />
              <th className="pb-2 font-medium text-left pl-0 pr-1 w-5">
                <span
                  title="Health: Red = has overdue commitments · Yellow = high open backlog (5+ or >50%) · Green = on track"
                  className="cursor-help inline-flex"
                >
                  <Info className="w-3 h-3 text-muted-foreground/50" />
                </span>
              </th>
              <SortTh label="Score"               sortKey="score"    current={sortKey} dir={sortDir} onClick={toggleSort} className="text-left w-36 px-3" />
              <th    className="pb-2 font-medium text-left px-3 w-32">Replied / Dismissed</th>
              <SortTh label="Open"                sortKey="open"     current={sortKey} dir={sortDir} onClick={toggleSort} className="text-right w-14 pr-2" />
              <SortTh label="Overdue"             sortKey="overdue"  current={sortKey} dir={sortDir} onClick={toggleSort} className="text-right w-16 pr-2" />
              <th    className="pb-2 font-medium text-right w-12 pr-2">Done</th>
              <SortTh label="Last commitment"     sortKey="lastDate" current={sortKey} dir={sortDir} onClick={toggleSort} className="text-right w-28 pr-3" />
              <th    className="pb-2 font-medium text-right w-24 pr-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  No senders match{query ? ` "${query}"` : ' this filter'}
                </td>
              </tr>
            ) : (
              sorted.map((row) => {
                const rule     = effectiveRule(row);
                const gmailUrl = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`from:${row.email}`)}`;
                const totalInteractions = row.replyCount + row.dismissCount;
                const isAuto   = isAutomatedSender(row.email);

                return (
                  <tr
                    key={row.email}
                    className="border-b last:border-0 hover:bg-muted/20 transition-colors group"
                  >
                    {/* Row checkbox */}
                    <td className="py-2.5 pl-3 pr-1 w-8">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 rounded cursor-pointer accent-primary"
                        checked={selected.has(row.email)}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const n = new Set(prev);
                            e.target.checked ? n.add(row.email) : n.delete(row.email);
                            return n;
                          });
                        }}
                      />
                    </td>

                    {/* Sender identity */}
                    <td className="py-2.5 pl-1 pr-2 max-w-[180px]">
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
                            {isAuto && (
                              <Badge variant="outline" className="text-[10px] py-0 h-4 gap-0.5 shrink-0 text-muted-foreground">
                                <Bot className="w-2.5 h-2.5" /> Auto
                              </Badge>
                            )}
                            {rule === 'always' && (
                              <Badge variant="default" className="text-[10px] py-0 h-4 gap-0.5 shrink-0">
                                <Pin className="w-2.5 h-2.5" /> Pinned
                              </Badge>
                            )}
                            {rule === 'never' && (
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

                    {/* Health info placeholder cell (to align with header) */}
                    <td className="py-2.5" />

                    {/* Score */}
                    <td className="py-2.5 px-3">
                      <ScoreBar score={row.score} totalInteractions={totalInteractions} />
                    </td>

                    {/* Replied / Dismissed */}
                    <td className="py-2.5 px-3">
                      {totalInteractions === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <span className="text-xs tabular-nums">
                          <span className="text-green-600 dark:text-green-400 font-medium">{row.replyCount}</span>
                          <span className="text-muted-foreground mx-1">/</span>
                          <span className="text-muted-foreground">{row.dismissCount}</span>
                        </span>
                      )}
                    </td>

                    {/* Open */}
                    <td className={cn(
                      'py-2.5 pr-2 text-right tabular-nums font-medium text-sm',
                      row.open > 0 && row.health === 'red'    ? 'text-red-500'   :
                      row.open > 0 && row.health === 'yellow' ? 'text-amber-500' : '',
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

                    {/* Last commitment */}
                    <td className="py-2.5 pr-3 text-right text-xs text-muted-foreground tabular-nums">
                      {relativeDate(row.lastDate)}
                    </td>

                    {/* Actions — hover only */}
                    <td className="py-2.5 pr-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Drill-through: filter commitments by this sender */}
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="h-6 px-2 text-xs gap-1 text-muted-foreground"
                          title="View commitments for this sender"
                        >
                          <Link href={`/commitments?q=${encodeURIComponent(row.email)}`}>
                            <ListChecks className="w-3 h-3" /> History
                          </Link>
                        </Button>

                        {rule ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleClear(row.email)}
                            className="h-6 px-2 text-xs gap-1 text-muted-foreground"
                          >
                            <X className="w-3 h-3" /> Clear
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePin(row.email)}
                              className="h-6 px-2 text-xs gap-1"
                              title="Always surface emails from this sender"
                            >
                              <Pin className="w-3 h-3" /> Pin
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSuppress(row.email)}
                              className="h-6 px-2 text-xs gap-1 text-muted-foreground"
                              title="Never surface emails from this sender"
                            >
                              <EyeOff className="w-3 h-3" /> Suppress
                            </Button>
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
        {filterKey !== 'all' && !query && ` in ${filterKey.replace('-', ' ')}`}
      </p>
    </div>
  );
}
