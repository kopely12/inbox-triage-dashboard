'use client';

import { useState, useEffect, useTransition } from 'react';
import { toast }                               from 'sonner';
import {
  Bot, Loader2, Zap, Eye, ChevronDown,
} from 'lucide-react';
import { Badge }    from '@/components/ui/badge';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { upsertAutopilotRule, previewAutopilotRule, type PreviewSender } from '@/app/actions/autopilot';
import {
  AUTOPILOT_RULE_META, AUTOPILOT_RULE_TYPES,
  type AutopilotRule, type AutopilotRuleType, type AutopilotAction,
} from '@/lib/autopilot';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RuleState {
  enabled:   boolean;
  threshold: Record<string, number>;
  action:    AutopilotAction;
  applied_count:   number;
  last_applied_at: string | null;
}

interface Props {
  initialRules: AutopilotRule[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildInitialState(
  ruleType: AutopilotRuleType,
  existing: AutopilotRule | undefined,
): RuleState {
  const meta = AUTOPILOT_RULE_META[ruleType];
  return {
    enabled:         existing?.enabled          ?? false,
    threshold:       existing?.threshold        ?? meta.defaultThreshold,
    action:          (existing?.action as AutopilotAction) ?? meta.defaultAction,
    applied_count:   existing?.applied_count    ?? 0,
    last_applied_at: existing?.last_applied_at  ?? null,
  };
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const CATEGORY_LABELS: Record<string, string> = {
  never_engage:  'Never open',
  rarely_engage: 'Rarely open',
  sometimes_engage: 'Sometimes open',
  often_engage:  'Often open',
  always_engage: 'Always open',
};

// ── Preview sub-component ─────────────────────────────────────────────────────

function PreviewPanel({ total, senders }: { total: number; senders: PreviewSender[] }) {
  if (total === 0) {
    return (
      <p className="text-xs text-muted-foreground mt-2">
        No senders match at the current threshold — try a more lenient setting.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-1">
      {senders.map((s) => (
        <div key={s.sender_email} className="flex items-center gap-2 py-0.5">
          <span className="text-xs font-medium text-foreground truncate flex-1 min-w-0">
            {s.sender_name || s.sender_email}
          </span>
          <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
            {s.emails_received} emails
          </span>
          <span className="text-[11px] text-muted-foreground shrink-0">
            · {CATEGORY_LABELS[s.category] ?? s.category}
          </span>
        </div>
      ))}
      {total > senders.length && (
        <p className="text-xs text-muted-foreground pt-0.5">
          +{total - senders.length} more sender{total - senders.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

// ── Rule Card ─────────────────────────────────────────────────────────────────

function RuleCard({
  ruleType,
  state,
  onChange,
  isPending,
}: {
  ruleType:  AutopilotRuleType;
  state:     RuleState;
  onChange:  (patch: Partial<RuleState>) => void;
  isPending: boolean;
}) {
  const meta      = AUTOPILOT_RULE_META[ruleType];
  const threshVal = state.threshold[meta.thresholdKey] ?? meta.defaultThreshold[meta.thresholdKey];

  // ── Preview state ──────────────────────────────────────────────────────────
  const [preview, setPreview] = useState<{ senders: PreviewSender[]; total: number } | null>(null);
  const [previewOpen,    setPreviewOpen]    = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Clear cached preview when threshold changes (result would be stale)
  const threshKey = JSON.stringify(state.threshold);
  useEffect(() => {
    setPreview(null);
    setPreviewOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshKey]);

  async function handlePreview(e: React.MouseEvent) {
    e.stopPropagation();
    if (preview) {
      setPreviewOpen((v) => !v);
      return;
    }
    setPreviewLoading(true);
    const result = await previewAutopilotRule(ruleType, state.threshold);
    setPreviewLoading(false);
    if (result.error) {
      toast.error('Could not load preview: ' + result.error);
    } else {
      setPreview({ senders: result.senders, total: result.total });
      setPreviewOpen(true);
    }
  }

  const showRecommendedBadge = !state.enabled && preview && preview.total >= 3;

  return (
    <div className={cn(
      'rounded-lg border p-4 transition-colors',
      state.enabled ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20',
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">

          {/* Rule name + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold">{meta.label}</p>
            {state.applied_count > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {state.applied_count} applied
              </Badge>
            )}
            {state.enabled && (
              <Badge className="text-[10px] px-1.5 py-0 bg-primary/20 text-primary border-0">
                Active
              </Badge>
            )}
            {showRecommendedBadge && (
              <Badge className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border border-amber-200">
                {preview!.total} sender{preview!.total !== 1 ? 's' : ''} ready
              </Badge>
            )}
          </div>

          {/* Description */}
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{meta.description}</p>

          {/* Threshold control — shown when rule is enabled */}
          {state.enabled && (
            <div className="mt-3 flex items-center gap-3">
              <label className="text-xs text-muted-foreground shrink-0">{meta.thresholdLabel}:</label>
              <input
                type="number"
                min={meta.thresholdMin}
                max={meta.thresholdMax}
                value={threshVal}
                onChange={(e) => {
                  const v = Math.max(meta.thresholdMin, Math.min(meta.thresholdMax, parseInt(e.target.value) || meta.thresholdMin));
                  onChange({ threshold: { ...state.threshold, [meta.thresholdKey]: v } });
                }}
                disabled={isPending}
                className="w-16 px-2 py-1 text-xs border border-border rounded text-center bg-background"
              />
              {ruleType === 'delete_without_open'          && <span className="text-xs text-muted-foreground">deletions without opening</span>}
              {ruleType === 'low_engagement_archive'       && <span className="text-xs text-muted-foreground">% open rate (e.g. 3 = 3%)</span>}
              {ruleType === 'never_replied_after_n_emails' && <span className="text-xs text-muted-foreground">emails with zero replies</span>}
              {ruleType === 'frequency_spike_unsubscribe'  && <span className="text-xs text-muted-foreground">emails per day (avg over analysis period)</span>}
            </div>
          )}

          {/* Last applied */}
          {state.last_applied_at && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Last triggered: {formatDate(state.last_applied_at)}
            </p>
          )}

          {/* Impact preview — pre-enable and live count when active */}
          <div className="mt-2.5">
            <button
              onClick={handlePreview}
              disabled={previewLoading}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50 disabled:no-underline"
            >
              {previewLoading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Checking your senders…
                </>
              ) : preview ? (
                <>
                  <ChevronDown className={cn('w-3 h-3 transition-transform', previewOpen && 'rotate-180')} />
                  {preview.total === 0
                    ? (state.enabled ? 'No senders currently match' : 'No senders match yet')
                    : `${preview.total} sender${preview.total !== 1 ? 's' : ''} ${state.enabled ? 'currently affected' : 'would be affected'}`
                  }
                </>
              ) : (
                <>
                  <Eye className="w-3 h-3" />
                  {state.enabled ? 'Check current impact' : 'Preview impact'}
                </>
              )}
            </button>

            {previewOpen && preview && (
              <div className="mt-1 border-l-2 border-primary/20 ml-1.5 pl-3">
                <PreviewPanel total={preview.total} senders={preview.senders} />
              </div>
            )}
          </div>

        </div>

        {/* Inline toggle */}
        <button
          role="switch"
          aria-checked={state.enabled}
          onClick={() => onChange({ enabled: !state.enabled })}
          disabled={isPending}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 mt-0.5',
            state.enabled ? 'bg-primary' : 'bg-muted-foreground/30',
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform',
              state.enabled ? 'translate-x-4' : 'translate-x-0',
            )}
          />
        </button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function AutopilotPanel({ initialRules }: Props) {
  const [isPending, startTransition] = useTransition();

  const ruleTypes = AUTOPILOT_RULE_TYPES;

  const [states, setStates] = useState<Record<AutopilotRuleType, RuleState>>(() =>
    Object.fromEntries(
      AUTOPILOT_RULE_TYPES.map((rt) => [rt, buildInitialState(rt, initialRules.find((r) => r.rule_type === rt))]),
    ) as Record<AutopilotRuleType, RuleState>,
  );

  function handleChange(ruleType: AutopilotRuleType, patch: Partial<RuleState>) {
    const next = { ...states[ruleType], ...patch };
    setStates((prev) => ({ ...prev, [ruleType]: next }));

    startTransition(async () => {
      const meta = AUTOPILOT_RULE_META[ruleType];
      // low_engagement_archive stores rate as a decimal in DB (UI shows %)
      const threshold = ruleType === 'low_engagement_archive'
        ? { ...next.threshold, rate: (next.threshold.rate ?? 3) / 100 }
        : next.threshold;

      const { error } = await upsertAutopilotRule(ruleType, threshold, next.action || meta.defaultAction, next.enabled);
      if (error) {
        toast.error('Could not save rule: ' + error);
        setStates((prev) => ({ ...prev, [ruleType]: states[ruleType] })); // rollback
      } else {
        toast.success(next.enabled ? 'Auto-pilot rule enabled.' : 'Auto-pilot rule disabled.');
      }
    });
  }

  const anyEnabled = ruleTypes.some((rt) => states[rt].enabled);

  return (
    <div className="space-y-4">

      {/* Header callout */}
      <div className="flex items-start gap-3 rounded-md border border-primary/20 bg-primary/5 px-4 py-3">
        <Bot className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium">Auto-pilot runs silently in the background</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Rules are evaluated each time you run an Inbox Cleaner analysis. Matched senders are
            actioned automatically — no clicks required. Click{' '}
            <span className="font-medium text-foreground">Preview impact</span> on any rule to see
            which of your senders it would affect before enabling it.
          </p>
        </div>
      </div>

      {/* Rule cards */}
      <div className="space-y-3">
        {ruleTypes.map((ruleType) => (
          <RuleCard
            key={ruleType}
            ruleType={ruleType}
            state={states[ruleType]}
            onChange={(patch) => handleChange(ruleType, patch)}
            isPending={isPending}
          />
        ))}
      </div>

      {/* Status footer */}
      {anyEnabled && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
          {isPending
            ? <><Loader2 className="w-3 h-3 animate-spin" />Saving…</>
            : <><Zap className="w-3 h-3 text-primary" />Rules active — applied on next Inbox Cleaner refresh</>
          }
        </div>
      )}

    </div>
  );
}
