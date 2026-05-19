import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

export type Insight = {
  text:    string;
  variant: 'positive' | 'warning' | 'neutral';
};

const VARIANT_CLS: Record<Insight['variant'], string> = {
  positive: 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40',
  warning:  'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40',
  neutral:  'border-border bg-muted/40',
};

const DOT_CLS: Record<Insight['variant'], string> = {
  positive: 'bg-green-500',
  warning:  'bg-amber-500',
  neutral:  'bg-muted-foreground/40',
};

export function InsightsStrip({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="w-3 h-3" />
        <span className="font-medium">Insights</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {insights.map((ins, i) => (
          <div
            key={i}
            className={cn(
              'flex items-start gap-2.5 rounded-md border px-3 py-2.5',
              VARIANT_CLS[ins.variant],
            )}
          >
            <span className={cn('mt-1.5 w-1.5 h-1.5 rounded-full shrink-0', DOT_CLS[ins.variant])} />
            <p className="text-xs leading-relaxed">{ins.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Server-side insight generator ────────────────────────────────────────────

export function buildInsights({
  triageCount,
  rangeLabel,
  surfacingRate,
  replyCount,
  dismissCount,
  snoozedCount,
  totalActioned,
  p50Hours,
  openCount,
  overdueCount,
  avgAgeDays,
  keptRate,
}: {
  triageCount:   number;
  rangeLabel:    string;
  surfacingRate: number | null;   // 0–100
  replyCount:    number;
  dismissCount:  number;
  snoozedCount:  number;
  totalActioned: number;
  p50Hours:      number | null;
  openCount:     number;
  overdueCount:  number;
  avgAgeDays:    number | null;
  keptRate:      number | null;
}): Insight[] {
  const insights: Insight[] = [];

  // ── Triage habit ──────────────────────────────────────────────────────────
  if (triageCount === 0) {
    insights.push({ text: `No triage sessions in the last ${rangeLabel} — open Gmail and run your first session to start tracking.`, variant: 'warning' });
    return insights; // Nothing else meaningful to show
  }

  // ── Signal quality ────────────────────────────────────────────────────────
  if (totalActioned >= 10) {
    const replyRate   = Math.round((replyCount   / totalActioned) * 100);
    const dismissRate = Math.round((dismissCount / totalActioned) * 100);

    if (replyRate >= 40) {
      insights.push({
        text: `${replyRate}% of surfaced emails got a reply — strong signal. The AI is mostly surfacing things that matter.`,
        variant: 'positive',
      });
    } else if (dismissRate >= 55) {
      insights.push({
        text: `${dismissRate}% of surfaced emails were dismissed immediately. Consider adding noisy senders to your blocklist or tightening your skip-category settings.`,
        variant: 'warning',
      });
    } else if (replyRate >= 20) {
      insights.push({
        text: `${replyRate}% reply rate on surfaced emails. ${dismissRate}% were dismissed — signal quality is reasonable but has room to improve.`,
        variant: 'neutral',
      });
    }
  } else if (surfacingRate !== null) {
    if (surfacingRate > 35) {
      insights.push({
        text: `Surfacing ${surfacingRate.toFixed(0)}% of scanned emails — higher than the healthy 10–25% range. You may be seeing too much noise.`,
        variant: 'warning',
      });
    } else if (surfacingRate < 5 && triageCount >= 5) {
      insights.push({
        text: `Surfacing only ${surfacingRate.toFixed(0)}% of emails. If important emails are slipping through, consider loosening your skip-category settings.`,
        variant: 'warning',
      });
    }
  }

  // ── Response speed ────────────────────────────────────────────────────────
  if (p50Hours !== null) {
    const label =
      p50Hours < 1   ? 'under 1 hour' :
      p50Hours < 4   ? `${Math.round(p50Hours)}h` :
      p50Hours < 24  ? `${Math.round(p50Hours)}h` :
      `${(p50Hours / 24).toFixed(1)} days`;

    const quality =
      p50Hours <= 4   ? 'fast' :
      p50Hours <= 24  ? 'solid' :
      p50Hours <= 72  ? 'on the slower side' :
      'quite slow';

    const variant: Insight['variant'] =
      p50Hours <= 4  ? 'positive' :
      p50Hours > 72  ? 'warning'  :
      'neutral';

    insights.push({
      text: `Median time-to-action on surfaced emails is ${label} — ${quality} for inbox management.`,
      variant,
    });
  }

  // ── Commitment backlog ────────────────────────────────────────────────────
  if (openCount > 0) {
    if (overdueCount > 0 && avgAgeDays !== null) {
      const pctOverdue = Math.round((overdueCount / openCount) * 100);
      insights.push({
        text: `${overdueCount} of your ${openCount} open commitment${openCount !== 1 ? 's' : ''} ${overdueCount === 1 ? 'is' : 'are'} overdue (${pctOverdue}% of your backlog, avg age ${Math.round(avgAgeDays)}d).`,
        variant: overdueCount >= 3 ? 'warning' : 'neutral',
      });
    } else if (keptRate !== null && keptRate >= 80) {
      insights.push({
        text: `${keptRate}% of commitments resolved — excellent accountability. ${openCount} still open, all within the deadline window.`,
        variant: 'positive',
      });
    } else if (openCount >= 8) {
      insights.push({
        text: `You have ${openCount} open commitments. Consider reviewing your My Tasks list to clear any that are no longer relevant.`,
        variant: 'neutral',
      });
    }
  } else if (keptRate !== null) {
    insights.push({
      text: `All commitments resolved — ${keptRate}% fulfillment rate over the period. Inbox zero for promises.`,
      variant: 'positive',
    });
  }

  return insights.slice(0, 3); // Cap at 3 so the grid stays clean
}
