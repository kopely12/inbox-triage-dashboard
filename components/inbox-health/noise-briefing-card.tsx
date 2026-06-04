'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Zap, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getNoiseBriefing, type NoiseBriefing } from '@/app/actions/engagement';
import Link from 'next/link';

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor(diff / 3_600_000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return 'just now';
}

export function NoiseBriefingCard({ totalTrashed = 0 }: { totalTrashed?: number }) {
  const [briefing,   setBriefing]   = useState<NoiseBriefing | null>(null);
  const [dismissed,  setDismissed]  = useState(false);

  useEffect(() => {
    getNoiseBriefing().then(({ briefing: b }) => { if (b) setBriefing(b); });
  }, []);

  if (!briefing || dismissed) return null;

  const age = briefing.generated_at ? formatRelative(briefing.generated_at) : null;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold">{briefing.headline}</p>
              {age && (
                <span suppressHydrationWarning className="text-xs text-muted-foreground">
                  {age}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{briefing.summary}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
              <span>
                <strong className="text-foreground">{briefing.stats.recent_noise_senders}</strong> noise senders
              </span>
              <span>
                <strong className="text-foreground">{briefing.stats.recent_noise_emails.toLocaleString()}</strong> noise emails
              </span>
              {briefing.stats.can_unsubscribe > 0 && (
                <span>
                  <strong className="text-foreground">{briefing.stats.can_unsubscribe}</strong> can unsubscribe
                </span>
              )}
              {totalTrashed > 0 && (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
                  <Trash2 className="w-3 h-3" />
                  <strong>{totalTrashed.toLocaleString()}</strong> already trashed
                </span>
              )}
            </div>
            {briefing.proposed_action && (
              <p className="text-xs text-muted-foreground mt-1.5 italic">{briefing.proposed_action}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" asChild className="h-7 text-xs">
            <Link href="/sender-intelligence?tab=deep_clean">
              <Zap className="w-3 h-3 mr-1.5" />
              Clean Now
            </Link>
          </Button>
          <button
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss briefing"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
