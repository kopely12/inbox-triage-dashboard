'use client';

// CadenceSuggestionsPanel — surfaces senders that mix valuable + noise email types.
// e.g. Amazon: Receipts (96% opened) + Promotions (2% opened) → smart auto-archive.
// Fetches on demand after the user clicks "Analyse" — requires sender_type_stats data
// from at least one completed engagement refresh.

import { useState, useCallback } from 'react';
import { toast }                  from 'sonner';
import {
  Sparkles, RefreshCw, Loader2, Zap,
  CheckCircle2, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn }     from '@/lib/utils';
import {
  getFilterSuggestions,
  executeBulkAction,
  type FilterSuggestion,
  type TypeSummary,
} from '@/app/actions/engagement';

// ── Emoji map ─────────────────────────────────────────────────────────────────

const TYPE_EMOJI: Record<string, string> = {
  receipt:    '📦',
  newsletter: '📰',
  promotion:  '🔥',
  alert:      '🔔',
  social:     '👥',
  update:     '🔄',
  personal:   '✉️',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CadenceSuggestionsPanel({ embedded = false }: { embedded?: boolean }) {
  const [suggestions, setSuggestions] = useState<FilterSuggestion[] | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [acting,   setActing]   = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { suggestions: data, error } = await getFilterSuggestions();
    setLoading(false);
    if (error) {
      toast.error(`Could not load suggestions: ${error}`);
    } else {
      setSuggestions(data);
    }
  }, []);

  async function handleArchive(s: FilterSuggestion) {
    setActing((prev) => new Set(prev).add(s.sender_email));
    const { succeeded, error } = await executeBulkAction('auto_archive', [s.sender_email]);
    setActing((prev) => { const n = new Set(prev); n.delete(s.sender_email); return n; });
    if (error || succeeded === 0) {
      toast.error(`Could not enable auto-archive for ${s.sender_email}`);
    } else {
      toast.success(`Auto-archive enabled for ${s.sender_name || s.sender_email}.`);
      setSuggestions((prev) =>
        prev ? prev.filter((x) => x.sender_email !== s.sender_email) : prev,
      );
    }
  }

  return (
    <div className={embedded ? 'py-3 space-y-4' : 'flex-1 overflow-auto px-6 py-6'}>
      <div className={embedded ? 'space-y-6' : 'max-w-2xl mx-auto space-y-6'}>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Smart Suggestions
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Senders whose emails are a mixed bag — valuable types you open alongside noise
              you ignore. Auto-archive keeps the signal and hides the clutter.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', loading && 'animate-spin')} />
            {suggestions !== null ? 'Re-analyse' : 'Analyse'}
          </Button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Analysing your sender patterns…</p>
          </div>
        )}

        {/* Not yet run */}
        {!loading && suggestions === null && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-xl border border-border bg-card text-center">
            <Sparkles className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">No analysis run yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Click &ldquo;Analyse&rdquo; to find senders worth smarter filtering. Requires at
              least one completed engagement refresh to build email-type data.
            </p>
            <Button onClick={load} size="sm" className="mt-2">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Analyse senders
            </Button>
          </div>
        )}

        {/* All handled */}
        {!loading && suggestions !== null && suggestions.length === 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800 text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" />
            <span>
              No mixed-signal senders found. Either your filters are already optimised, or run
              an engagement refresh to build more email-type data.
            </span>
          </div>
        )}

        {/* Suggestion cards */}
        {!loading && suggestions !== null && suggestions.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground -mt-2">
              {suggestions.length} sender{suggestions.length !== 1 ? 's' : ''} with mixed
              email types — auto-archive will move the noise out of your inbox while letting
              the valuable types through.
            </p>

            <div className="space-y-3">
              {suggestions.map((s) => (
                <SuggestionCard
                  key={s.sender_email}
                  suggestion={s}
                  isActing={acting.has(s.sender_email)}
                  onArchive={() => handleArchive(s)}
                />
              ))}
            </div>
          </>
        )}

      </div>
    </div>
  );
}

// ── SuggestionCard ────────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion: s,
  isActing,
  onArchive,
}: {
  suggestion: FilterSuggestion;
  isActing:   boolean;
  onArchive:  () => void;
}) {
  const displayName = s.sender_name || s.sender_email;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">

      {/* Sender + cadence */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{displayName}</p>
          {s.sender_name && (
            <p className="text-xs text-muted-foreground truncate">{s.sender_email}</p>
          )}
        </div>
        <span className="text-xs text-muted-foreground shrink-0 mt-0.5 tabular-nums">
          ~{s.emails_per_week}/week
        </span>
      </div>

      {/* Type breakdown bars */}
      <div className="space-y-1.5">
        {s.valuable_types.map((t) => (
          <TypeBar key={t.email_type} stat={t} variant="valuable" />
        ))}
        {s.noise_types.map((t) => (
          <TypeBar key={t.email_type} stat={t} variant="noise" />
        ))}
      </div>

      {/* Plain-English insight */}
      <p className="text-xs text-muted-foreground leading-relaxed">{s.message}</p>

      {/* Action row */}
      <div className="flex items-center justify-between gap-3 pt-0.5">
        <p className="text-xs text-primary font-medium flex items-center gap-1.5">
          <Zap className="w-3 h-3 shrink-0" />
          Skips inbox noise · lets receipts &amp; alerts through
        </p>
        <Button
          size="sm"
          className="h-7 px-3 text-xs shrink-0"
          onClick={onArchive}
          disabled={isActing}
        >
          {isActing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <>
              <ArrowRight className="w-3 h-3 mr-1" />
              Enable
            </>
          )}
        </Button>
      </div>

    </div>
  );
}

// ── TypeBar ───────────────────────────────────────────────────────────────────

function TypeBar({ stat, variant }: { stat: TypeSummary; variant: 'valuable' | 'noise' }) {
  const emoji   = TYPE_EMOJI[stat.email_type] ?? '📧';
  const label   = stat.email_type.charAt(0).toUpperCase() + stat.email_type.slice(1) + 's';
  const openPct = Math.round(stat.open_rate * 100);

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-4 text-center shrink-0 leading-none">{emoji}</span>
      <span className={cn(
        'w-24 shrink-0 truncate',
        variant === 'valuable' ? 'text-green-700 font-medium' : 'text-muted-foreground',
      )}>
        {label}
      </span>
      <span className="w-7 shrink-0 text-right tabular-nums text-muted-foreground">
        {stat.email_count}
      </span>
      {/* Open-rate bar */}
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            variant === 'valuable' ? 'bg-green-500' : 'bg-amber-400',
          )}
          style={{ width: `${Math.min(100, openPct)}%` }}
        />
      </div>
      <span className={cn(
        'w-16 text-right tabular-nums shrink-0',
        variant === 'valuable' ? 'text-green-700' : 'text-muted-foreground',
      )}>
        {openPct}% opened
      </span>
    </div>
  );
}
