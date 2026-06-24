'use client';

// InboxHealthClient — full dedicated Inbox Health page with tabs:
//   Overview | Trends | Recommendations
// Uses recharts for the trend chart and distribution donut.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer, ComposedChart, Area,
  Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts';
import { cn } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, Minus, ArrowRight,
  Activity, Target, Zap, Trophy,
  BarChart3, CheckCircle2, AlertTriangle, X, ShieldAlert, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMilestone, dismissMilestone } from '@/app/actions/engagement';
import type { InboxHealthData, InboxHealthTrendPoint, PendingMilestone } from '@/app/actions/engagement';
import type { InboxAlert } from '@/app/actions/protection';
import { InboxProtectionAlerts } from '@/components/inbox-health/inbox-protection-alerts';
import { InfoPopover } from '@/components/overview/inbox-health-score';

// ── KPI explanations ──────────────────────────────────────────────────────────

const SCORE_INFO = (
  <>
    <p className="font-semibold text-foreground">Overall Inbox Health</p>
    <p>A 0–100 score reflecting how well you manage inbox noise across five dimensions. Graded <strong>A+</strong> (90+) down to <strong>F</strong> (below 40).</p>
    <p className="text-muted-foreground">Updated each time you run an Inbox Cleaner analysis. Daily snapshots build the trend line.</p>
    <div className="mt-2 pt-2 border-t border-border grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
      <span>A+ ≥ 90</span><span>A ≥ 80</span>
      <span>B ≥ 70</span><span>C ≥ 55</span>
      <span>D ≥ 40</span><span>F &lt; 40</span>
    </div>
  </>
);

const COMPONENT_INFO: Record<string, React.ReactNode> = {
  'Noise ratio': (
    <>
      <p className="font-semibold text-foreground">Noise Ratio · up to 25 pts</p>
      <p>The percentage of senders who fall into <strong>Never Open</strong> or <strong>Rarely Open</strong> — emails you consistently don&apos;t read.</p>
      <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
        <li>→ Full 25 pts when noise senders are under ~33% of total</li>
        <li>→ Drops to 0 when noise senders reach ~67%+</li>
      </ul>
      <p className="mt-1.5 font-medium text-foreground">Improve: take action on noise senders in Inbox Cleaner.</p>
    </>
  ),
  'Cleanup hygiene': (
    <>
      <p className="font-semibold text-foreground">Cleanup Hygiene · up to 25 pts</p>
      <p>Of your noise senders, how many have you actioned — unsubscribed, auto-archived, or hidden.</p>
      <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
        <li>→ Full 25 pts when every noise sender is actioned</li>
        <li>→ Proportional: 50% actioned = ~12 pts</li>
      </ul>
      <p className="mt-1.5 font-medium text-foreground">Improve: use bulk actions or Deep Clean to clear noise in one pass.</p>
    </>
  ),
  'Subscription debt': (
    <>
      <p className="font-semibold text-foreground">Subscription Debt · up to 20 pts</p>
      <p>Of noise senders with an unsubscribe link, how many have you formally unsubscribed from. Unsubscribing stops future emails — stronger than deleting.</p>
      <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
        <li>→ Full 20 pts when all unsubscribeable noise senders are unsubscribed</li>
        <li>→ 0 pts when none are, even if you delete their emails</li>
      </ul>
      <p className="mt-1.5 font-medium text-foreground">Improve: use Unsubscribe in Inbox Cleaner — Inbox Triage sends the request automatically.</p>
    </>
  ),
  'Recent activity': (
    <>
      <p className="font-semibold text-foreground">Recent Activity · up to 15 pts</p>
      <p>Rewards regular maintenance. Noise builds back over time, so acting consistently matters more than one big cleanup.</p>
      <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
        <li>→ Full 15 pts if you&apos;ve taken a cleanup action in the last 60 days</li>
        <li>→ Drops linearly to 0 at 60+ days of inactivity</li>
      </ul>
      <p className="mt-1.5 font-medium text-foreground">Improve: even hiding a single sender resets the clock.</p>
    </>
  ),
  'Ignored opt-outs': (
    <>
      <p className="font-semibold text-foreground">Ignored Opt-outs · up to 15 pts</p>
      <p>Tracks senders who kept emailing you after you replied asking them to stop — detected from opt-out language in your sent mail.</p>
      <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
        <li>→ Full 15 pts when no senders are still sending after your opt-out</li>
        <li>→ Loses ~3 pts per sender who ignored you (floors at 0)</li>
      </ul>
      <p className="mt-1.5 font-medium text-foreground">Improve: use the Opt-outs tab in Inbox Cleaner to formally unsubscribe from flagged senders.</p>
    </>
  ),
};

const STAT_INFO = {
  noiseSenders: (
    <>
      <p className="font-semibold text-foreground">Noise Senders</p>
      <p>Senders categorized as <strong>Never Open</strong> or <strong>Rarely Open</strong> — emails you consistently don&apos;t engage with.</p>
      <p className="text-muted-foreground mt-1">The higher this is relative to your total, the more downward pressure on your Noise Ratio score.</p>
    </>
  ),
  canUnsubscribe: (
    <>
      <p className="font-semibold text-foreground">Can Unsubscribe</p>
      <p>Noise senders who include a working unsubscribe link that Inbox Triage can send on your behalf.</p>
      <p className="text-muted-foreground mt-1">Formally unsubscribing stops future emails — more effective than deleting, which only removes existing ones.</p>
    </>
  ),
  attentionTax: (
    <>
      <p className="font-semibold text-foreground">Attention Tax</p>
      <p>Estimated time spent each month mentally processing noise emails — reading the subject, recognising it&apos;s junk, and scrolling past. Assumes ~5 seconds per noise email.</p>
      <p className="text-muted-foreground mt-1">Multiply by 12 to see the annual cost. Most people are surprised by the total.</p>
    </>
  ),
};

// ── Constants ─────────────────────────────────────────────────────────────────

type Tab        = 'breakdown' | 'recommendations' | 'alerts';
type DateRange  = '30d' | '90d' | 'all';


const COMPONENT_LINES = [
  { key: 'noise_score',        label: 'Noise ratio',       color: '#ef4444' },
  { key: 'cleanup_score',      label: 'Cleanup hygiene',   color: '#f59e0b' },
  { key: 'subscription_score', label: 'Subscription debt', color: '#3b82f6' },
  { key: 'recency_score',      label: 'Recent activity',   color: '#22c55e' },
  { key: 'reply_debt_score',   label: 'Ignored opt-outs',  color: '#8b5cf6' },
];

// NOTE: The inbox health score (0–100) is computed entirely server-side in
// app/actions/engagement.ts by summing five weighted component scores.
// The current formula is linear within each component (e.g. noise_ratio maps
// 0–67%+ noise linearly to 0–25 pts). A sigmoid normalization would make early
// gains feel more rewarding — e.g. going from 0→30% reply rate feels the same
// as 30→60% on a linear scale, but a sigmoid would give the first 30% more pts.
// If a sigmoid is ever applied server-side, use this helper as a reference:
//
//   function sigmoidScore(raw: number): number {
//     // raw is 0–1; output is 0–100
//     const x = raw * 12 - 6; // map [0,1] → [-6,6]
//     return Math.round(100 / (1 + Math.exp(-x)));
//   }
//
// For now, no normalization is applied client-side — the server value is
// displayed as-is. A sigmoid would need to be adopted server-side to keep
// the KPI consistent across the dashboard and the trend chart.

function scoreColor(s: number) {
  if (s >= 70) return { stroke: '#22c55e', text: 'text-green-600', bg: 'bg-green-50',  border: 'border-green-200', area: '#22c55e' };
  if (s >= 40) return { stroke: '#f59e0b', text: 'text-amber-600', bg: 'bg-amber-50',  border: 'border-amber-200', area: '#f59e0b' };
  return              { stroke: '#ef4444', text: 'text-red-600',   bg: 'bg-red-50',    border: 'border-red-200',   area: '#ef4444' };
}

function scoreToGrade(score: number) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

const formatDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// ── Score ring (animated on mount) ────────────────────────────────────────────

const RADIUS  = 46;
const STROKE  = 8;
const CIRCUMF = 2 * Math.PI * RADIUS;
const SVGSIZE = 116;
const CENTER  = SVGSIZE / 2;

function ScoreRingLarge({ score }: { score: number }) {
  const [displayed, setDisplayed] = useState(0);
  const col = scoreColor(score);

  useEffect(() => {
    const start = performance.now();
    const duration = 700;
    function frame(now: number) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(eased * score));
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, [score]);

  const offset = CIRCUMF * (1 - displayed / 100);

  return (
    <div className="relative shrink-0" title={`${score} / 100`}>
      <svg width={SVGSIZE} height={SVGSIZE} viewBox={`0 0 ${SVGSIZE} ${SVGSIZE}`}>
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none"
          stroke="currentColor" strokeWidth={STROKE} className="text-muted/30" />
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none"
          stroke={col.stroke} strokeWidth={STROKE} strokeLinecap="round"
          strokeDasharray={CIRCUMF} strokeDashoffset={offset}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
          style={{ transition: 'stroke-dashoffset 0.05s linear' }}
        />
        <text x={CENTER} y={CENTER - 7} textAnchor="middle" dominantBaseline="middle"
          className="fill-foreground" style={{ fontSize: 28, fontWeight: 700, fontFamily: 'inherit' }}>
          {displayed}
        </text>
        <text x={CENTER} y={CENTER + 13} textAnchor="middle" dominantBaseline="middle"
          className="fill-muted-foreground" style={{ fontSize: 11, fontFamily: 'inherit' }}>
          / 100
        </text>
      </svg>
    </div>
  );
}


// ── Component tip ─────────────────────────────────────────────────────────────

function getComponentTip(
  label:    string,
  score:    number,
  max:      number,
  metadata: InboxHealthData['metadata'],
): string | null {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.85) return null; // doing well, no nudge
  switch (label) {
    case 'Noise ratio': {
      const noisePct = Math.round(metadata.noise_senders / Math.max(metadata.total_senders, 1) * 100);
      return `${metadata.noise_senders} of your ${metadata.total_senders} senders (${noisePct}%) are noise — archive or unsubscribe them in Inbox Cleaner`;
    }
    case 'Cleanup hygiene': {
      const unactioned = Math.max(0, metadata.noise_senders - metadata.acted_on);
      if (unactioned === 0) return null;
      return `${unactioned} noise sender${unactioned !== 1 ? 's' : ''} haven't been actioned yet — use bulk actions in Inbox Cleaner`;
    }
    case 'Subscription debt': {
      const remaining = metadata.unsubscribeable - metadata.unsubscribed;
      if (remaining <= 0) return null;
      return `${remaining} noise sender${remaining !== 1 ? 's' : ''} have unsubscribe links — let Inbox Triage send opt-out requests automatically`;
    }
    case 'Recent activity':
      if (metadata.days_since_action < 30) return null;
      return `No cleanup action in ${metadata.days_since_action} day${metadata.days_since_action !== 1 ? 's' : ''} — even a single archive resets this counter`;
    case 'Ignored opt-outs':
      if (metadata.still_sending_count === 0) return null;
      return `${metadata.still_sending_count} sender${metadata.still_sending_count !== 1 ? 's' : ''} kept emailing after you asked them to stop — formally unsubscribe via the Opt-outs tab`;
    default:
      return null;
  }
}

// ── Report card row ───────────────────────────────────────────────────────────

function ReportCardRow({
  label, detail, score, max, infoContent, tip,
}: {
  label:        string;
  detail:       string;
  score:        number;
  max:          number;
  infoContent?: React.ReactNode;
  tip?:         string | null;
}) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  const { dot, scoreCls } = pct >= 70
    ? { dot: 'bg-green-500',  scoreCls: 'text-green-700 bg-green-50  border-green-200' }
    : pct >= 40
      ? { dot: 'bg-amber-400', scoreCls: 'text-amber-700 bg-amber-50 border-amber-200' }
      : { dot: 'bg-red-400',   scoreCls: 'text-red-700   bg-red-50   border-red-200'   };

  return (
    <div className="py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <span className={cn('w-2 h-2 rounded-full shrink-0', dot)} />
        <span className="flex items-center gap-1 text-sm font-medium flex-1 min-w-0">
          {label}
          {infoContent && <InfoPopover content={infoContent} />}
        </span>
        <span className={cn('text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full border shrink-0', scoreCls)}>
          {score} / {max}
        </span>
      </div>
      {tip && (
        <p className="text-xs text-muted-foreground ml-5 mt-0.5 leading-relaxed">{tip}</p>
      )}
    </div>
  );
}

// ── Delta badge ───────────────────────────────────────────────────────────────

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  if (delta === 0) return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground px-2 py-0.5 rounded-full border border-border bg-muted/30">
      <Minus className="w-3 h-3" />
      No change this week
    </span>
  );
  const up = delta > 0;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border',
      up
        ? 'text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950 dark:border-green-800'
        : 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-800',
    )}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {up ? '+' : ''}{delta} pts this week
    </span>
  );
}

// ── Streak badge ──────────────────────────────────────────────────────────────

function StreakBadge({ streak }: { streak: number }) {
  if (streak < 3) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800">
      <Trophy className="w-3 h-3" />
      {streak}-day B+ streak
    </span>
  );
}

// ── Trend chart ───────────────────────────────────────────────────────────────

function TrendChart({ trend }: { trend: InboxHealthTrendPoint[] }) {
  const [dateRange, setDateRange]                   = useState<DateRange>('30d');
  const [showComponentLines, setShowComponentLines] = useState(false);

  const now = Date.now();
  const filtered = trend.filter((p) => {
    if (dateRange === 'all') return true;
    const days = dateRange === '30d' ? 30 : 90;
    return new Date(p.snapshot_date + 'T00:00:00').getTime() >= now - days * 86_400_000;
  });

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground space-y-2">
        <BarChart3 className="w-10 h-10 opacity-30" />
        <p className="text-sm font-medium">Not enough data yet</p>
        <p className="text-xs">Daily snapshots build up over time. Check back tomorrow.</p>
      </div>
    );
  }

  const col = scoreColor(filtered.at(-1)?.score ?? 0);

  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string;
  }) => {
    if (!active || !payload?.length || !label) return null;
    return (
      <div className="rounded-lg border border-border bg-card shadow-lg p-3 text-xs space-y-1">
        <p className="font-medium text-foreground mb-1.5">{formatDate(label)}</p>
        {payload.map((p) => (
          <div key={p.name} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-muted-foreground">{p.name}</span>
            <span className="ml-auto font-medium tabular-nums">{p.value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex rounded-md overflow-hidden border border-border text-xs">
          {(['30d', '90d', 'all'] as DateRange[]).map((r) => (
            <button key={r} onClick={() => setDateRange(r)}
              className={cn('px-3 py-1 transition-colors',
                dateRange === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}>
              {r === 'all' ? 'All time' : r}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowComponentLines((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={cn('w-3 h-3 transition-transform', showComponentLines && 'rotate-180')} />
          {showComponentLines ? 'Hide components' : 'Show component breakdown'}
        </button>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={filtered} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
          <defs>
            <linearGradient id="scoreAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={col.area} stopOpacity={0.18} />
              <stop offset="95%" stopColor={col.area} stopOpacity={0}   />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="snapshot_date"
            tickFormatter={formatDate}
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--border))"
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--border))"
            tickLine={false}
            ticks={[0, 25, 50, 75, 100]}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Overall score — always shown */}
          <Area
            type="monotone"
            dataKey="score"
            name="Overall score"
            stroke={col.stroke}
            strokeWidth={2.5}
            fill="url(#scoreAreaGrad)"
            dot={false}
            activeDot={{ r: 4 }}
          />

          {/* Component lines — toggled */}
          {showComponentLines && COMPONENT_LINES.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              name={l.label}
              stroke={l.color}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
              strokeDasharray="4 2"
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>

    </div>
  );
}

// ── Recommendations panel ─────────────────────────────────────────────────────

// ── Grade thresholds (shared between scoring + recommendations) ───────────────

const GRADE_THRESHOLDS = [
  { grade: 'A+', min: 90 },
  { grade: 'A',  min: 80 },
  { grade: 'B',  min: 70 },
  { grade: 'C',  min: 55 },
  { grade: 'D',  min: 40 },
] as const;

function nextGradeInfo(score: number) {
  return GRADE_THRESHOLDS.find((g) => score < g.min) ?? null;
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ values, color, max }: { values: number[]; color: string; max: number }) {
  if (values.length < 2) return <div className="w-20 h-6 shrink-0" />;
  const W = 80, H = 24;
  const norm = (v: number) => max > 0 ? (1 - v / max) * H : H;
  const d = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (values.length - 1)) * W).toFixed(1)} ${norm(v).toFixed(1)}`)
    .join(' ');
  const lx = W, ly = norm(values[values.length - 1]);
  return (
    <svg width={W} height={H} className="shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={2.5} fill={color} />
    </svg>
  );
}

function RecommendationsPanel({
  recommendations, score,
}: {
  recommendations: InboxHealthData['recommendations'];
  score: number;
}) {
  if (recommendations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
        <CheckCircle2 className="w-12 h-12 text-green-500 opacity-80" />
        <p className="text-base font-medium">Your inbox is in great shape!</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          No high-priority actions needed. Keep running regular cleanups to maintain your score.
        </p>
      </div>
    );
  }

  const totalGain       = recommendations.reduce((s, r) => s + r.points_gained, 0);
  const totalMinutes    = recommendations.reduce((s, r) => s + (r.estimated_minutes ?? 0), 0);
  const projectedScore  = Math.min(100, score + totalGain);
  const nextGrade       = nextGradeInfo(score);
  const ptsToNextGrade  = nextGrade ? nextGrade.min - score : null;

  // Which recs cover the gap to the next grade?
  let runningGain = 0;
  const recsForNextGrade = new Set<number>();
  if (ptsToNextGrade !== null) {
    for (let i = 0; i < recommendations.length; i++) {
      if (runningGain >= ptsToNextGrade) break;
      recsForNextGrade.add(i);
      runningGain += recommendations[i].points_gained;
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Grade target header ───────────────────────────────────────────── */}
      {nextGrade && ptsToNextGrade !== null && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-3 flex-wrap">
          <Target className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm flex-1">
            <strong className="text-foreground">{ptsToNextGrade} pt{ptsToNextGrade !== 1 ? 's' : ''}</strong>
            {' '}to Grade{' '}
            <strong className="text-foreground">{nextGrade.grade}</strong>
            {recsForNextGrade.size > 0 && (
              <>
                {' '}·{' '}
                <span className="text-muted-foreground">
                  the top {recsForNextGrade.size === 1 ? 'action' : `${recsForNextGrade.size} actions`} get you there
                </span>
              </>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            All actions: +{totalGain} pts · ~{totalMinutes < 60 ? `${totalMinutes} min` : `${(totalMinutes / 60).toFixed(1)} hr`}
          </span>
        </div>
      )}

      {/* ── Rec cards ────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {recommendations.map((rec, i) => {
          const isKeyRec = recsForNextGrade.has(i);
          return (
            <div key={i} className={cn(
              'rounded-lg border p-4 flex items-start gap-4',
              rec.impact === 'high'
                ? 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30'
                : rec.impact === 'medium'
                  ? 'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30'
                  : 'border-border bg-muted/20',
            )}>
              {/* Priority dot */}
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5',
                rec.impact === 'high' ? 'bg-red-500' : rec.impact === 'medium' ? 'bg-amber-500' : 'bg-muted-foreground',
              )}>
                {i + 1}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium leading-snug">{rec.label}</p>
                  {isKeyRec && nextGrade && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground shrink-0">
                      → Grade {nextGrade.grade}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {rec.action === 'opt_outs'
                    ? 'Inbox Cleaner → Opt-outs tab'
                    : rec.action === 'senders'
                      ? 'Inbox Cleaner → Senders tab'
                      : 'Inbox Cleaner → Deep Clean'}
                </p>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                {/* Points + time badges */}
                <div className="flex items-center gap-1.5">
                  {rec.estimated_minutes != null && rec.estimated_minutes > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                      ~{rec.estimated_minutes} min
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    <Zap className="w-3 h-3" />
                    +{rec.points_gained} pts
                  </span>
                </div>
                {/* CTA */}
                {/* TODO: pass the current sender-intelligence filter as a query param
                    when available, so the user lands on the right category view. */}
                <Link
                  href={
                    rec.action === 'opt_outs'   ? '/sender-intelligence?tab=opt_outs' :
                    rec.action === 'deep_clean' ? '/sender-intelligence?tab=deep_clean' :
                    '/sender-intelligence'
                  }
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Fix this
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Full potential footer ─────────────────────────────────────────── */}
      {totalGain > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          Complete all {recommendations.length} action{recommendations.length !== 1 ? 's' : ''}:{' '}
          {score} → <strong className="text-foreground">{projectedScore}</strong> pts
          {' '}({scoreToGrade(projectedScore)} grade)
        </p>
      )}
    </div>
  );
}

// ── Main client component ─────────────────────────────────────────────────────

export function InboxHealthClient({
  health,
  initialAlerts = [],
  hideHeader = false,
}: {
  health:         InboxHealthData | null;
  initialAlerts?: InboxAlert[];
  hideHeader?:    boolean;
}) {
  const [activeTab,      setActiveTab]      = useState<Tab>('recommendations');
  const [milestone,      setMilestone]      = useState<PendingMilestone | null>(null);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [dismissing,     setDismissing]     = useState(false);

  // Fetch pending milestone on mount.
  // The cancelled flag prevents a stale response from a previous effect invocation
  // (e.g. React StrictMode double-invoke or fast re-mount) from overwriting state.
  useEffect(() => {
    let cancelled = false;
    getMilestone().then(({ milestone: m }) => {
      if (!cancelled && m) setMilestone(m);
    });
    return () => { cancelled = true; };
  }, []);

  // Dismiss milestone dialog on Escape keypress
  useEffect(() => {
    if (!milestone) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleDismissMilestone();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [milestone]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore score-drop alert dismissed state from localStorage
  useEffect(() => {
    const key = `ih-drop-${new Date().toISOString().slice(0, 7)}`; // keyed by month
    if (typeof window !== 'undefined' && localStorage.getItem(key) === '1') {
      setAlertDismissed(true);
    }
  }, []);

  function handleDismissAlert() {
    const key = `ih-drop-${new Date().toISOString().slice(0, 7)}`;
    if (typeof window !== 'undefined') localStorage.setItem(key, '1');
    setAlertDismissed(true);
  }

  async function handleDismissMilestone() {
    if (dismissing) return;
    setDismissing(true);
    await dismissMilestone();
    setMilestone(null);
    setDismissing(false);
  }

  if (!health || health.score === null || !health.components) {
    return (
      <div className="max-w-2xl mx-auto mt-16 text-center space-y-4">
        <Activity className="w-12 h-12 mx-auto text-muted-foreground/40" />
        <h2 className="text-xl font-semibold">No inbox data yet</h2>
        <p className="text-muted-foreground">
          Run an Inbox Cleaner analysis to generate your first health score.
          Daily snapshots will build up automatically after that.
        </p>
        <Button asChild>
          <Link href="/sender-intelligence">Go to Inbox Cleaner</Link>
        </Button>
      </div>
    );
  }

  const { score, grade, components, recommendations, trend, metadata } = health;
  const col = scoreColor(score);

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'recommendations', label: 'Actions',    icon: <Target className="w-4 h-4" />       },
    { id: 'breakdown',       label: 'Breakdown',  icon: <BarChart3 className="w-4 h-4" />    },
    { id: 'alerts',          label: 'Alerts',     icon: <ShieldAlert className="w-4 h-4" /> },
  ];

  const showDropAlert = !alertDismissed && metadata.delta !== null && metadata.delta <= -10;

  return (
    <>
    {/* ── Milestone celebration modal ── */}
    {milestone && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
           onClick={handleDismissMilestone}>
        <div
          className="bg-card rounded-2xl border border-border shadow-2xl p-8 max-w-sm w-full text-center space-y-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-6xl leading-none select-none">
            {milestone.type === 'grade' ? '🏆' : '🔥'}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
              New Achievement Unlocked
            </p>
            <h2 className="text-xl font-bold leading-snug">{milestone.message}</h2>
          </div>

          {milestone.type === 'grade' && milestone.grade && (
            <div className={cn(
              'inline-flex items-center gap-2 text-2xl font-black px-6 py-2 rounded-xl border-2',
              milestone.grade === 'A+' ? 'bg-green-50 text-green-700 border-green-300' :
              milestone.grade === 'A'  ? 'bg-emerald-50 text-emerald-700 border-emerald-300' :
                                         'bg-blue-50 text-blue-700 border-blue-300',
            )}>
              Grade {milestone.grade}
            </div>
          )}
          {milestone.type === 'streak' && milestone.streak && (
            <div className="inline-flex items-center gap-2 text-2xl font-black px-6 py-2 rounded-xl border-2 bg-amber-50 text-amber-700 border-amber-300">
              🔥 {milestone.streak} days
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Score when achieved: <strong className="text-foreground">{milestone.score} / 100</strong>
          </p>

          <Button className="w-full" onClick={handleDismissMilestone}>
            Awesome! 🎉
          </Button>
        </div>
      </div>
    )}

    <div className="max-w-5xl space-y-6">

      {/* ── Page header ── */}
      {!hideHeader && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inbox Health</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            A holistic view of how well your inbox noise is managed.
          </p>
        </div>
      )}

      {/* ── Score drop alert ── */}
      {showDropAlert && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-sm text-amber-800 dark:text-amber-200 flex-1">
            Your score dropped <strong>{Math.abs(metadata.delta!)} pts</strong> this week.
            New noise senders may have appeared since your last analysis.
          </span>
          <button
            onClick={() => setActiveTab('recommendations')}
            className="text-xs font-medium text-amber-700 dark:text-amber-300 underline underline-offset-2 hover:no-underline shrink-0"
          >
            View fixes
          </button>
          <button
            onClick={handleDismissAlert}
            className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Score hero ── */}
      <div className="rounded-2xl border border-border bg-card px-6 py-4 space-y-4">
        <div className="flex items-center gap-5">
          <ScoreRingLarge score={score} />

          {/* Grade + description */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('text-sm font-bold px-2.5 py-0.5 rounded-md border', col.bg, col.text, col.border)}>
                Grade {grade}
              </span>
              <DeltaBadge delta={metadata.delta} />
              <StreakBadge streak={metadata.streak} />
            </div>
            <p className="text-sm text-muted-foreground mt-1.5">
              {score >= 80
                ? 'Your inbox is well-managed. Keep the momentum going.'
                : score >= 60
                  ? 'Good progress — a few actions will push you into the A range.'
                  : score >= 40
                    ? 'Noise is building up. The recommendations below will help.'
                    : 'Your inbox needs attention. Start with the quick wins below.'}
            </p>
            {trend.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                as of {formatDate(trend.at(-1)!.snapshot_date)} · {metadata.total_senders} senders analysed
              </p>
            )}
          </div>

          {/* Key stats — inline to the right */}
          <div className="flex items-start gap-6 shrink-0 pl-5 border-l border-border">
            <div>
              <p className="text-xl font-bold tabular-nums">{metadata.noise_senders}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                Noise senders <InfoPopover content={STAT_INFO.noiseSenders} />
              </p>
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums">{metadata.unsubscribeable - metadata.unsubscribed}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                Can unsubscribe <InfoPopover content={STAT_INFO.canUnsubscribe} />
              </p>
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums">
                {metadata.time_cost_hours_year > 0
                  ? `~${metadata.time_cost_hours_year}h`
                  : `${metadata.time_cost_minutes_month}m`}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                {metadata.time_cost_hours_year > 0 ? 'per year, attention tax' : 'per month, attention tax'}
                <InfoPopover content={STAT_INFO.attentionTax} />
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* ── Tab bar ── */}
      <div className="flex items-center border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.id === 'recommendations' && recommendations.length > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground px-1">
                {recommendations.length}
              </span>
            )}
            {tab.id === 'alerts' && initialAlerts.length > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-1">
                {initialAlerts.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="py-6">

        {/* Breakdown tab */}
        {activeTab === 'breakdown' && (
          <div className="space-y-8">
            {/* Component scores */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold">Score components</h3>
                <InfoPopover content={SCORE_INFO} />
              </div>
              <div className="rounded-xl border border-border bg-card px-5 py-1">
                {Object.values(components).map((comp) => (
                  <ReportCardRow
                    key={comp.label}
                    {...comp}
                    infoContent={COMPONENT_INFO[comp.label]}
                    tip={getComponentTip(comp.label, comp.score, comp.max, metadata)}
                  />
                ))}
              </div>
            </div>

          </div>
        )}

        {/* Recommendations tab */}
        {activeTab === 'recommendations' && (
          <div>
            <RecommendationsPanel recommendations={recommendations} score={score} />
          </div>
        )}

        {/* Alerts tab */}
        {activeTab === 'alerts' && (
          <div>
            <InboxProtectionAlerts initialAlerts={initialAlerts} />
          </div>
        )}
      </div>

    </div>
    </>
  );
}
