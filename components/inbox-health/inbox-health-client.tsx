'use client';

// InboxHealthClient — full dedicated Inbox Health page with tabs:
//   Overview | Trends | Recommendations
// Uses recharts for the trend chart and distribution donut.

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer, ComposedChart, AreaChart, Area,
  Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts';
import { cn } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, Minus, ArrowRight,
  Activity, Target, Zap, Calendar, Trophy,
  BarChart3, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { InboxHealthData, InboxHealthTrendPoint } from '@/app/actions/engagement';

// ── Constants ─────────────────────────────────────────────────────────────────

type Tab        = 'overview' | 'trends' | 'recommendations';
type DateRange  = '30d' | '90d' | 'all';

const CATEGORY_META: Record<string, { label: string; color: string; fill: string }> = {
  never_engage:  { label: 'Never Open',    color: '#ef4444', fill: 'bg-red-500'    },
  rarely_engage: { label: 'Rarely Open',   color: '#f59e0b', fill: 'bg-amber-500'  },
  regular:       { label: 'Regular',       color: '#3b82f6', fill: 'bg-blue-500'   },
  known_contact: { label: 'Known Contact', color: '#22c55e', fill: 'bg-green-500'  },
  transactional: { label: 'Transactional', color: '#8b5cf6', fill: 'bg-violet-500' },
};

const COMPONENT_LINES = [
  { key: 'noise_score',        label: 'Noise ratio',       color: '#ef4444' },
  { key: 'cleanup_score',      label: 'Cleanup hygiene',   color: '#f59e0b' },
  { key: 'subscription_score', label: 'Subscription debt', color: '#3b82f6' },
  { key: 'recency_score',      label: 'Recent activity',   color: '#22c55e' },
  { key: 'reply_debt_score',   label: 'Reply health',      color: '#8b5cf6' },
];

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

const RADIUS  = 56;
const STROKE  = 9;
const CIRCUMF = 2 * Math.PI * RADIUS;

function ScoreRingLarge({ score }: { score: number }) {
  const [displayed, setDisplayed] = useState(0);
  const col = scoreColor(score);

  useEffect(() => {
    const start = performance.now();
    const duration = 700;
    function frame(now: number) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplayed(Math.round(eased * score));
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, [score]);

  const offset = CIRCUMF * (1 - displayed / 100);
  const grade  = scoreToGrade(score);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative group" title={`${score} / 100`}>
        <svg width="148" height="148" viewBox="0 0 148 148">
          {/* Track */}
          <circle cx="74" cy="74" r={RADIUS} fill="none"
            stroke="currentColor" strokeWidth={STROKE} className="text-muted/30" />
          {/* Progress */}
          <circle cx="74" cy="74" r={RADIUS} fill="none"
            stroke={col.stroke} strokeWidth={STROKE} strokeLinecap="round"
            strokeDasharray={CIRCUMF} strokeDashoffset={offset}
            transform="rotate(-90 74 74)"
            style={{ transition: 'stroke-dashoffset 0.05s linear' }}
          />
          {/* Score */}
          <text x="74" y="68" textAnchor="middle" dominantBaseline="middle"
            className="fill-foreground" style={{ fontSize: 32, fontWeight: 700, fontFamily: 'inherit' }}>
            {displayed}
          </text>
          <text x="74" y="88" textAnchor="middle" dominantBaseline="middle"
            className="fill-muted-foreground" style={{ fontSize: 12, fontFamily: 'inherit' }}>
            / 100
          </text>
        </svg>
      </div>
      <span className={cn(
        'text-lg font-bold px-3 py-1 rounded-lg border',
        col.bg, col.text, col.border,
      )}>
        Grade {grade}
      </span>
    </div>
  );
}

// ── Animated component bar ────────────────────────────────────────────────────

function AnimatedBar({
  label, detail, score, max, index,
}: {
  label: string; detail: string; score: number; max: number; index: number;
}) {
  const [width, setWidth] = useState(0);
  const pct = max > 0 ? (score / max) * 100 : 0;
  const col = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400';

  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), 80 + index * 90);
    return () => clearTimeout(t);
  }, [pct, index]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm tabular-nums text-muted-foreground">{score}/{max}</span>
      </div>
      <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
        <div className={cn('h-full rounded-full', col)}
          style={{ width: `${width}%`, transition: 'width 0.55s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
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

// ── Distribution donut ────────────────────────────────────────────────────────

function DistributionDonut({
  categoryCounts, emailCountsByCategory,
}: {
  categoryCounts:          Record<string, number>;
  emailCountsByCategory:   Record<string, number>;
}) {
  const [view, setView] = useState<'senders' | 'emails'>('emails');
  const data = Object.entries(view === 'senders' ? categoryCounts : emailCountsByCategory)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: k, value: v, meta: CATEGORY_META[k] ?? { label: k, color: '#94a3b8', fill: 'bg-slate-400' } }));

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Sender distribution</h4>
        <div className="flex rounded-md overflow-hidden border border-border text-xs">
          {(['emails', 'senders'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn('px-2 py-0.5 transition-colors',
                view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {v === 'emails' ? 'By volume' : 'By count'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="shrink-0">
          <ResponsiveContainer width={140} height={140}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={42} outerRadius={66}
                dataKey="value" stroke="none" paddingAngle={2}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.meta.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => {
                const v = Number(value);
                const label = typeof name === 'string' ? (CATEGORY_META[name]?.label ?? name) : String(name);
                return [
                  view === 'emails'
                    ? `${v.toLocaleString()} emails (${Math.round((v / total) * 100)}%)`
                    : `${v} senders (${Math.round((v / total) * 100)}%)`,
                  label,
                ] as [string, string];
              }}
                contentStyle={{ fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', d.meta.fill)} />
              <span className="flex-1 truncate text-muted-foreground">{d.meta.label}</span>
              <span className="tabular-nums font-medium">
                {Math.round((d.value / total) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Trend chart ───────────────────────────────────────────────────────────────

function TrendChart({ trend }: { trend: InboxHealthTrendPoint[] }) {
  const [dateRange, setDateRange]         = useState<DateRange>('30d');
  const [activeLines, setActiveLines]     = useState<Set<string>>(new Set());

  function toggleLine(key: string) {
    setActiveLines((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

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
        <div className="flex items-center gap-2 flex-wrap">
          {COMPONENT_LINES.map((l) => (
            <button
              key={l.key}
              onClick={() => toggleLine(l.key)}
              className={cn(
                'flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border transition-all',
                activeLines.has(l.key)
                  ? 'border-transparent text-white'
                  : 'border-border text-muted-foreground hover:border-foreground/30',
              )}
              style={activeLines.has(l.key) ? { background: l.color } : {}}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
              {l.label}
            </button>
          ))}
        </div>
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
          {COMPONENT_LINES.map((l) =>
            activeLines.has(l.key) ? (
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
            ) : null,
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Grade bands legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="font-medium text-foreground">Grade bands:</span>
        {[
          { label: 'A (80+)', color: '#22c55e' },
          { label: 'B (70+)', color: '#4ade80' },
          { label: 'C (55+)', color: '#f59e0b' },
          { label: 'D (40+)', color: '#fb923c' },
          { label: 'F (<40)', color: '#ef4444' },
        ].map((g) => (
          <span key={g.label} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: g.color }} />
            {g.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Recommendations panel ─────────────────────────────────────────────────────

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

  const totalGain = recommendations.reduce((s, r) => s + r.points_gained, 0);
  const projectedScore = Math.min(100, score + totalGain);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-3 flex-wrap">
        <Target className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm">
          Complete all actions below to reach{' '}
          <strong className="text-foreground">{projectedScore} pts</strong>
          {' '}({scoreToGrade(projectedScore)} grade)
          {' '}— a potential{' '}
          <strong className="text-primary">+{totalGain} pt gain</strong>
        </span>
      </div>

      {/* Rec cards */}
      <div className="space-y-3">
        {recommendations.map((rec, i) => (
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
              <p className="text-sm font-medium leading-snug">{rec.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {rec.action === 'senders' ? 'Go to Sender Intelligence → filter by category → select and act' : 'Go to Sender Intelligence → Deep Clean tab'}
              </p>
            </div>

            <div className="flex flex-col items-end gap-2 shrink-0">
              {/* Points badge */}
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                <Zap className="w-3 h-3" />
                +{rec.points_gained} pts
              </span>
              {/* CTA */}
              <Link
                href="/sender-intelligence"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Fix this
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main client component ─────────────────────────────────────────────────────

export function InboxHealthClient({ health }: { health: InboxHealthData | null }) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  if (!health || health.score === null || !health.components) {
    return (
      <div className="max-w-2xl mx-auto mt-16 text-center space-y-4">
        <Activity className="w-12 h-12 mx-auto text-muted-foreground/40" />
        <h2 className="text-xl font-semibold">No inbox data yet</h2>
        <p className="text-muted-foreground">
          Run a Sender Intelligence analysis to generate your first health score.
          Daily snapshots will build up automatically after that.
        </p>
        <Button asChild>
          <Link href="/sender-intelligence">Go to Sender Intelligence</Link>
        </Button>
      </div>
    );
  }

  const { score, grade, components, recommendations, trend, metadata } = health;
  const col = scoreColor(score);

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'overview',        label: 'Overview',        icon: <Activity className="w-4 h-4" />  },
    { id: 'trends',          label: 'Trends',          icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'recommendations', label: 'Recommendations', icon: <Target className="w-4 h-4" />    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inbox Health</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            A holistic view of how well your inbox noise is managed.
          </p>
        </div>
        <Button variant="outline" asChild size="sm">
          <Link href="/sender-intelligence">
            Open Sender Intelligence
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Link>
        </Button>
      </div>

      {/* ── Score hero ── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 p-6">
          {/* Score ring */}
          <ScoreRingLarge score={score} />

          {/* Score meta */}
          <div className="flex-1 min-w-0 flex flex-col gap-3 sm:pt-2 text-center sm:text-left">
            <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
              <DeltaBadge delta={metadata.delta} />
              <StreakBadge streak={metadata.streak} />
            </div>

            <p className="text-base text-muted-foreground">
              {score >= 80
                ? 'Your inbox is well-managed. Keep the momentum going.'
                : score >= 60
                  ? 'Good progress — a few actions will push you into the A range.'
                  : score >= 40
                    ? 'Noise is building up. The recommendations below will help.'
                    : 'Your inbox needs attention. Start with the quick wins below.'}
            </p>

            {/* Key stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center sm:text-left">
                <p className="text-2xl font-bold">{metadata.noise_senders}</p>
                <p className="text-xs text-muted-foreground">Noise senders</p>
              </div>
              <div className="text-center sm:text-left">
                <p className="text-2xl font-bold">{metadata.unsubscribeable - metadata.unsubscribed}</p>
                <p className="text-xs text-muted-foreground">Can unsubscribe</p>
              </div>
              <div className="text-center sm:text-left">
                <p className="text-2xl font-bold">{metadata.total_senders}</p>
                <p className="text-xs text-muted-foreground">Total senders</p>
              </div>
            </div>
          </div>
        </div>

        {/* Component bars strip */}
        <div className="border-t border-border bg-muted/10 px-6 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4">
          {Object.values(components).map((comp, i) => (
            <AnimatedBar key={comp.label} {...comp} index={i} />
          ))}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all',
              activeTab === tab.id
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.id === 'recommendations' && recommendations.length > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground px-1">
                {recommendations.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="rounded-xl border border-border bg-card p-6">

        {/* Overview tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: component detail table */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Score breakdown
              </h3>
              <div className="space-y-3">
                {Object.values(components).map((comp) => {
                  const pct = comp.max > 0 ? (comp.score / comp.max) * 100 : 0;
                  const barCol = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400';
                  return (
                    <div key={comp.label} className="flex items-center gap-3">
                      <div className="w-28 shrink-0">
                        <span className="text-xs font-medium">{comp.label}</span>
                      </div>
                      <div className="flex-1 h-2 rounded-full bg-muted/40 overflow-hidden">
                        <div className={cn('h-full rounded-full', barCol)}
                          style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">
                        {comp.score}/{comp.max}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Grade key */}
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground mb-2">Grade thresholds</p>
                <div className="grid grid-cols-3 gap-1 text-xs text-muted-foreground">
                  {[['A+', '90+', 'text-green-600'], ['A', '80+', 'text-green-600'], ['B', '70+', 'text-emerald-600'],
                    ['C', '55+', 'text-amber-600'], ['D', '40+', 'text-orange-600'], ['F', '<40', 'text-red-600']].map(([g, t, c]) => (
                    <span key={g} className="flex items-center gap-1">
                      <strong className={c}>{g}</strong> {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: distribution donut */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                Email distribution
              </h3>
              <DistributionDonut
                categoryCounts={metadata.category_counts}
                emailCountsByCategory={metadata.email_counts_by_category}
              />
            </div>
          </div>
        )}

        {/* Trends tab */}
        {activeTab === 'trends' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Score over time
              </h3>
              {trend.length >= 2 && (
                <span className="text-xs text-muted-foreground">
                  Toggle component lines to diagnose what&apos;s driving changes
                </span>
              )}
            </div>
            <TrendChart trend={trend} />
          </div>
        )}

        {/* Recommendations tab */}
        {activeTab === 'recommendations' && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
              Prioritised actions
            </h3>
            <RecommendationsPanel recommendations={recommendations} score={score} />
          </div>
        )}
      </div>

      {/* ── Bottom CTA ── */}
      {activeTab !== 'recommendations' && recommendations.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Zap className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm">
              <strong>{recommendations.length} action{recommendations.length > 1 ? 's' : ''}</strong> available
              {' — '}complete them to gain up to{' '}
              <strong className="text-primary">+{recommendations.reduce((s, r) => s + r.points_gained, 0)} pts</strong>
            </span>
          </div>
          <Button size="sm" onClick={() => setActiveTab('recommendations')}>
            View recommendations
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
