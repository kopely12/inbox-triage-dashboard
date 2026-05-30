'use client';

// InboxHealthScore — visual score ring + component breakdown + recommendations.
// Used on the Overview (/) page to lead with inbox health as the primary metric.

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ArrowRight, Zap, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { InboxHealthData } from '@/app/actions/engagement';

// ── Score ring (SVG) ──────────────────────────────────────────────────────────

const RADIUS      = 52;
const STROKE      = 8;
const CIRCUMF     = 2 * Math.PI * RADIUS;

function scoreColor(score: number) {
  if (score >= 70) return { stroke: '#22c55e', text: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200' };
  if (score >= 40) return { stroke: '#f59e0b', text: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200' };
  return              { stroke: '#ef4444', text: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200'   };
}

function ScoreRing({ score }: { score: number }) {
  const pct    = score / 100;
  const offset = CIRCUMF * (1 - pct);
  const col    = scoreColor(score);

  return (
    <svg width="130" height="130" viewBox="0 0 130 130" className="shrink-0">
      {/* Track */}
      <circle
        cx="65" cy="65" r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        className="text-muted/30"
      />
      {/* Progress */}
      <circle
        cx="65" cy="65" r={RADIUS}
        fill="none"
        stroke={col.stroke}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={CIRCUMF}
        strokeDashoffset={offset}
        transform="rotate(-90 65 65)"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      {/* Score number */}
      <text x="65" y="60" textAnchor="middle" dominantBaseline="middle"
        className="fill-foreground" style={{ fontSize: 28, fontWeight: 700, fontFamily: 'inherit' }}>
        {score}
      </text>
      <text x="65" y="79" textAnchor="middle" dominantBaseline="middle"
        className="fill-muted-foreground" style={{ fontSize: 11, fontFamily: 'inherit' }}>
        / 100
      </text>
    </svg>
  );
}

// ── Component bar ─────────────────────────────────────────────────────────────

function ComponentBar({
  label, detail, score, max,
}: {
  label: string; detail: string; score: number; max: number;
}) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  const col = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{score}/{max}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', col)} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground mt-0.5">{detail}</p>
    </div>
  );
}

// ── Trend sparkline ───────────────────────────────────────────────────────────

function TrendSparkline({ trend }: { trend: Array<{ score: number; snapshot_date: string }> }) {
  if (trend.length < 2) return null;

  const W = 120, H = 32, pad = 2;
  const scores = trend.map((t) => t.score);
  const min    = Math.min(...scores);
  const max    = Math.max(...scores);
  const range  = max - min || 1;

  const points = scores.map((s, i) => {
    const x = pad + (i / (scores.length - 1)) * (W - pad * 2);
    const y = H - pad - ((s - min) / range) * (H - pad * 2);
    return `${x},${y}`;
  }).join(' ');

  const last  = scores[scores.length - 1];
  const first = scores[0];
  const up    = last >= first;

  return (
    <div className="flex items-center gap-2">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
        <polyline
          points={points}
          fill="none"
          stroke={up ? '#22c55e' : '#f59e0b'}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <span className={cn('text-xs font-medium', up ? 'text-green-600' : 'text-amber-600')}>
        {up ? '↑' : '↓'} {Math.abs(last - first)}pts
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function InboxHealthScore({
  health,
  onNavigate,
}: {
  health:     InboxHealthData;
  onNavigate: (tab: 'senders' | 'deep_clean') => void;
}) {
  const { score, grade, components, recommendations, trend, metadata } = health;

  if (score === null || !components) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">No inbox data yet</p>
        <p>Run a Sender Intelligence analysis to get your first health score.</p>
        <Button asChild size="sm" className="mt-3">
          <Link href="/sender-intelligence">Go to Sender Intelligence</Link>
        </Button>
      </div>
    );
  }

  const col = scoreColor(score);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header row */}
      <div className="flex items-start gap-5 p-5 pb-4">

        {/* Score ring */}
        <ScoreRing score={score} />

        {/* Right of ring */}
        <div className="flex-1 min-w-0 pt-1">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-base font-semibold">Inbox Health</h3>
            <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded border', col.bg, col.text, col.border)}>
              {grade}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            {score >= 70
              ? 'Your inbox is in good shape.'
              : score >= 40
                ? 'Some noise is building up — a quick clean would help.'
                : 'Your inbox noise is high — take action to reclaim focus.'}
          </p>

          {/* Mini stats */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span><strong className="text-foreground">{metadata.noise_senders}</strong> noise senders</span>
            <span><strong className="text-foreground">{metadata.unsubscribeable - metadata.unsubscribed}</strong> can unsubscribe</span>
            <span><strong className="text-foreground">{metadata.total_senders}</strong> total senders</span>
          </div>

          {/* Trend */}
          {trend.length >= 2 && (
            <div className="mt-2">
              <TrendSparkline trend={trend} />
            </div>
          )}
        </div>
      </div>

      {/* Score breakdown */}
      <div className="px-5 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-3 border-t border-border pt-4">
        {Object.values(components).map((comp) => (
          <ComponentBar key={comp.label} {...comp} />
        ))}
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="border-t border-border bg-muted/20 px-5 py-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Top actions to improve your score
          </p>
          {recommendations.map((rec, i) => (
            <button
              key={i}
              onClick={() => onNavigate(rec.action)}
              className="w-full flex items-center gap-2 text-sm text-left hover:text-primary transition-colors group"
            >
              <span className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                rec.impact === 'high'   ? 'bg-red-500'   :
                rec.impact === 'medium' ? 'bg-amber-400' : 'bg-muted-foreground',
              )} />
              <span className="flex-1">{rec.label}</span>
              <ArrowRight className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Static card (used server-side in the Overview page) ───────────────────────
// Wrapper that renders the card from serialised health data without client state.

export function InboxHealthCard({
  health,
}: {
  health: InboxHealthData;
}) {
  const { score, grade, components, metadata } = health;

  if (score === null || !components) return null;

  const col = scoreColor(score);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-4">
        <ScoreRing score={score} />
        <div className="flex-1 min-w-0 pt-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold">Inbox Health</h3>
            <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded border', col.bg, col.text, col.border)}>
              {grade}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            {score >= 70 ? 'Your inbox is in good shape.' : score >= 40 ? 'Some noise is building up.' : 'High noise level — action recommended.'}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span><strong className="text-foreground">{metadata.noise_senders}</strong> noise senders</span>
            <span><strong className="text-foreground">{metadata.unsubscribeable - metadata.unsubscribed}</strong> can unsubscribe</span>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
          <Link href="/sender-intelligence">
            <Users className="w-3.5 h-3.5" />
            Clean up
          </Link>
        </Button>
      </div>

      {/* Component bars */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-3 border-t border-border pt-4">
        {Object.values(components).map((comp) => (
          <ComponentBar key={comp.label} {...comp} />
        ))}
      </div>
    </div>
  );
}
