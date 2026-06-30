'use client';

// InboxHealthScore — visual score ring + component breakdown + recommendations.
// Used on the Overview (/) page and exported sub-components for Sender Intelligence.

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ArrowRight, Info, X, TrendingUp, TrendingDown, Minus, Zap, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { InboxHealthData } from '@/app/actions/engagement';

// ── Info popover (fixed-positioned — safe inside grids/overflow:hidden) ────────

export function InfoPopover({ content }: { content: React.ReactNode }) {
  const [open, setOpen]   = useState(false);
  const [pos,  setPos]    = useState({ top: 0, left: 0 });
  const btnRef            = useRef<HTMLButtonElement>(null);
  const popRef            = useRef<HTMLDivElement>(null);

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({
        top:  r.bottom + 6,
        left: Math.min(r.left - 4, window.innerWidth - 276),
      });
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    function onMouse(e: MouseEvent) {
      if (
        popRef.current  && !popRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown',   onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown',   onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        aria-label="More information"
        className="inline-flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground transition-colors focus:outline-none"
      >
        <Info className="w-3 h-3" />
      </button>

      {open && (
        <div
          ref={popRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 200 }}
          className="w-68 max-w-[272px] rounded-lg border border-border bg-card shadow-lg"
        >
          <button
            onClick={() => setOpen(false)}
            className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="w-3 h-3" />
          </button>
          <div className="p-3 pr-7 text-xs space-y-1.5">
            {content}
          </div>
        </div>
      )}
    </>
  );
}

// ── KPI explanations ──────────────────────────────────────────────────────────

const SCORE_INFO = (
  <>
    <p className="font-semibold text-foreground">Overall Inbox Health</p>
    <p>A 0–100 score reflecting how well you manage inbox noise across five dimensions. Graded <strong>A+</strong> (90+) down to <strong>F</strong> (below 40).</p>
    <p className="text-muted-foreground">Updated each time you run an Inbox Cleaner analysis. Daily snapshots are stored to build the trend line.</p>
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
      <p>The percentage of your senders who fall into <strong>Never Open</strong> or <strong>Rarely Open</strong> categories — emails you consistently don&apos;t read.</p>
      <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
        <li>→ Full 25 pts when noise senders are under ~33% of total</li>
        <li>→ Drops to 0 when noise senders reach ~67%+</li>
      </ul>
      <p className="mt-1.5 font-medium text-foreground">Improve: take action on noise senders in the Inbox Cleaner tab.</p>
    </>
  ),

  'Cleanup hygiene': (
    <>
      <p className="font-semibold text-foreground">Cleanup Hygiene · up to 25 pts</p>
      <p>Of your noise senders, how many have you actually done something about — unsubscribed, auto-archived, or hidden from your report.</p>
      <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
        <li>→ Full 25 pts when every noise sender is actioned</li>
        <li>→ Proportional otherwise: 50% actioned = ~12 pts</li>
      </ul>
      <p className="mt-1.5 font-medium text-foreground">Improve: use bulk actions or Deep Clean to clear noise senders in one pass.</p>
    </>
  ),

  'Subscription debt': (
    <>
      <p className="font-semibold text-foreground">Subscription Debt · up to 20 pts</p>
      <p>Of your noise senders who have an unsubscribe link, how many have you formally unsubscribed from. Unsubscribing stops future emails — stronger than just deleting.</p>
      <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
        <li>→ Full 20 pts when all unsubscribeable noise senders are unsubscribed</li>
        <li>→ 0 pts when none are (even if you delete their emails)</li>
      </ul>
      <p className="mt-1.5 font-medium text-foreground">Improve: use Unsubscribe in Inbox Cleaner — iinbox sends the request automatically.</p>
    </>
  ),

  'Recent activity': (
    <>
      <p className="font-semibold text-foreground">Recent Activity · up to 15 pts</p>
      <p>Rewards regular maintenance. Noise builds back up over time, so acting consistently matters more than a single big cleanup.</p>
      <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
        <li>→ Full 15 pts if you&apos;ve taken cleanup action within the last 60 days</li>
        <li>→ Drops linearly to 0 at 60+ days of inactivity</li>
      </ul>
      <p className="mt-1.5 font-medium text-foreground">Improve: run any cleanup action. Even hiding a single sender resets the clock. Schedule a recurring clean to keep this at full score automatically.</p>
    </>
  ),

  'Reply health': (
    <>
      <p className="font-semibold text-foreground">Reply Health · up to 15 pts</p>
      <p>Tracks senders you&apos;ve already told to stop emailing you — detected when iinbox sees a reply with opt-out language like &quot;stop emailing me&quot; or &quot;unsubscribe&quot; — but who you haven&apos;t formally unsubscribed from yet.</p>
      <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
        <li>→ Full 15 pts when no opt-out replies are unresolved</li>
        <li>→ Loses ~3 pts per unresolved opt-out (floors at 0)</li>
      </ul>
      <p className="mt-1.5 font-medium text-foreground">Improve: iinbox detects these replies automatically. Find flagged senders in Inbox Cleaner and officially unsubscribe.</p>
    </>
  ),
};

// ── Score ring (animated entrance from 0 on mount) ────────────────────────────

const RADIUS  = 52;
const STROKE  = 8;
const CIRCUMF = 2 * Math.PI * RADIUS;

function scoreColor(score: number) {
  if (score >= 70) return { stroke: '#22c55e', text: 'text-green-600', bg: 'bg-green-50',  border: 'border-green-200' };
  if (score >= 40) return { stroke: '#f59e0b', text: 'text-amber-600', bg: 'bg-amber-50',  border: 'border-amber-200' };
  return              { stroke: '#ef4444', text: 'text-red-600',   bg: 'bg-red-50',    border: 'border-red-200'   };
}

function ScoreRing({ score }: { score: number }) {
  const [animated, setAnimated] = useState(0);
  const col = scoreColor(score);

  // Animate the ring from 0 → score on mount using rAF
  useEffect(() => {
    const start    = performance.now();
    const duration = 650;
    function frame(now: number) {
      const t     = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // cubic ease-out
      setAnimated(Math.round(eased * score));
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, [score]);

  const offset = CIRCUMF * (1 - animated / 100);

  return (
    <svg width="130" height="130" viewBox="0 0 130 130" className="shrink-0"
      aria-label={`Health score: ${score} out of 100`}>
      {/* Track */}
      <circle cx="65" cy="65" r={RADIUS} fill="none" stroke="currentColor"
        strokeWidth={STROKE} className="text-muted/30" />
      {/* Progress — driven by rAF counter, no CSS transition needed */}
      <circle cx="65" cy="65" r={RADIUS} fill="none" stroke={col.stroke}
        strokeWidth={STROKE} strokeLinecap="round"
        strokeDasharray={CIRCUMF} strokeDashoffset={offset}
        transform="rotate(-90 65 65)"
      />
      {/* Score number (shows actual score, not animated) */}
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

// ── Delta badge ───────────────────────────────────────────────────────────────

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  if (delta === 0) return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground px-1.5 py-0.5 rounded-full border border-border/60">
      <Minus className="w-2.5 h-2.5" /> No change
    </span>
  );
  const up = delta > 0;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full border',
      up ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200',
    )}>
      {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {up ? '+' : ''}{delta} pts
    </span>
  );
}

// ── Component bar (staggered animation via index prop) ────────────────────────

function ComponentBar({
  label, detail, score, max, index = 0,
}: {
  label: string; detail: string; score: number; max: number; index?: number;
}) {
  const [width, setWidth] = useState(0);
  const pct  = max > 0 ? (score / max) * 100 : 0;
  const col  = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400';
  const info = COMPONENT_INFO[label];

  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), 60 + index * 80);
    return () => clearTimeout(t);
  }, [pct, index]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-1">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs font-medium truncate">{label}</span>
          {info && <InfoPopover content={info} />}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{score}/{max}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div className={cn('h-full rounded-full', col)}
          style={{ width: `${width}%`, transition: 'width 0.55s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>
      <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{detail}</p>
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

  const last = scores[scores.length - 1];
  const up   = last >= scores[0];

  return (
    <div className="flex items-center gap-2">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
        <polyline points={points} fill="none"
          stroke={up ? '#22c55e' : '#f59e0b'}
          strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <span className={cn('text-xs font-medium', up ? 'text-green-600' : 'text-amber-600')}>
        {up ? '↑' : '↓'} {Math.abs(last - scores[0])}pts
      </span>
    </div>
  );
}

// ── Shared header row ─────────────────────────────────────────────────────────

function HealthHeader({
  score, grade, metadata, trend,
}: {
  score:    number;
  grade:    string;
  metadata: InboxHealthData['metadata'];
  trend:    InboxHealthData['trend'];
}) {
  const [gradeVisible, setGradeVisible] = useState(false);
  const col = scoreColor(score);

  // Grade badge entrance
  useEffect(() => {
    const t = setTimeout(() => setGradeVisible(true), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex items-start gap-5 p-5 pb-4">
      <ScoreRing score={score} />
      <div className="flex-1 min-w-0 pt-1">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <h3 className="text-base font-semibold">Inbox Health</h3>
          <span className={cn(
            'text-xs font-bold px-1.5 py-0.5 rounded border transition-all duration-300',
            col.bg, col.text, col.border,
            gradeVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-75',
          )}>
            {grade}
          </span>
          <DeltaBadge delta={metadata.delta} />
          <InfoPopover content={SCORE_INFO} />
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          {score >= 70
            ? 'Your inbox is in good shape.'
            : score >= 40
              ? 'Some noise is building up — a quick clean would help.'
              : 'Your inbox noise is high — take action to reclaim focus.'}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span><strong className="text-foreground">{metadata.noise_senders}</strong> noise senders</span>
          <span><strong className="text-foreground">{metadata.unsubscribeable - metadata.unsubscribed}</strong> can unsubscribe</span>
          <span><strong className="text-foreground">{metadata.total_senders}</strong> total senders</span>
          {metadata.streak >= 3 && (
            <span className="text-amber-600">🏆 {metadata.streak}-day streak</span>
          )}
        </div>
        {trend.length >= 2 && (
          <div className="mt-2">
            <TrendSparkline trend={trend} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Component grid (with staggered animation indices) ─────────────────────────

function ComponentGrid({ components }: { components: NonNullable<InboxHealthData['components']> }) {
  return (
    <div className="px-5 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-4 border-t border-border pt-4">
      {Object.values(components).map((comp, i) => (
        <ComponentBar key={comp.label} {...comp} index={i} />
      ))}
    </div>
  );
}

// ── InboxHealthScore (interactive — used in Sender Intelligence) ──────────────

export function InboxHealthScore({
  health,
  onNavigate,
}: {
  health:     InboxHealthData;
  onNavigate: (tab: 'senders' | 'deep_clean' | 'opt_outs') => void;
}) {
  const { score, grade, components, recommendations, trend, metadata } = health;

  if (score === null || !components) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">No inbox data yet</p>
        <p>Run an Inbox Cleaner analysis to get your first health score.</p>
        <Button asChild size="sm" className="mt-3">
          <Link href="/sender-intelligence">Go to Inbox Cleaner</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <HealthHeader score={score} grade={grade!} metadata={metadata} trend={trend} />
      <ComponentGrid components={components} />

      {recommendations.length > 0 && (
        <div className="border-t border-border bg-muted/20 px-5 py-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Top actions to improve your score
          </p>
          {recommendations.slice(0, 3).map((rec, i) => (
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
              {rec.points_gained > 0 && (
                <span className="text-[11px] font-semibold text-primary/80 shrink-0 flex items-center gap-0.5">
                  <Zap className="w-2.5 h-2.5" />+{rec.points_gained}
                </span>
              )}
              <ArrowRight className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── InboxHealthCard (server-rendered — used on Overview page) ─────────────────

export function InboxHealthCard({ health }: { health: InboxHealthData }) {
  const { score, grade, components, recommendations, trend, metadata } = health;

  if (score === null || !components) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <HealthHeader score={score} grade={grade!} metadata={metadata} trend={trend} />
      <ComponentGrid components={components} />

      {recommendations.length > 0 && (
        <div className="border-t border-border bg-muted/20 px-5 py-3 space-y-2">
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Top actions to improve your score
            </p>
            <Link
              href="/inbox-health"
              className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              Full report
              <ExternalLink className="w-2.5 h-2.5" />
            </Link>
          </div>
          {recommendations.slice(0, 3).map((rec, i) => (
            <Link
              key={i}
              href="/sender-intelligence"
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors group"
            >
              <span className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                rec.impact === 'high'   ? 'bg-red-500'   :
                rec.impact === 'medium' ? 'bg-amber-400' : 'bg-muted-foreground',
              )} />
              <span className="flex-1">{rec.label}</span>
              {rec.points_gained > 0 && (
                <span className="text-[11px] font-semibold text-primary/80 shrink-0 flex items-center gap-0.5">
                  <Zap className="w-2.5 h-2.5" />+{rec.points_gained}
                </span>
              )}
              <ArrowRight className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
