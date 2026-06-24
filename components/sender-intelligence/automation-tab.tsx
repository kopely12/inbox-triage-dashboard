'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import { AutopilotPanel }  from '@/components/preferences/autopilot-panel';
import { AutoCleanCard }   from './auto-clean-card';
import { getAutopilotRules, getAutopilotActivity, type AutopilotActivityEntry } from '@/app/actions/autopilot';
import { getAutoCleanPrefs } from '@/app/actions/extension-prefs';
import type { AutopilotRule } from '@/lib/autopilot';

// ── Component ─────────────────────────────────────────────────────────────────

export function AutomationTab() {
  const [loading,       setLoading]       = useState(true);
  const [rules,         setRules]         = useState<AutopilotRule[]>([]);
  const [activity,      setActivity]      = useState<AutopilotActivityEntry[]>([]);
  const [autoCleanPrefs, setAutoCleanPrefs] = useState<Parameters<typeof AutoCleanCard>[0]['initialPrefs'] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [rulesRes, activityRes, prefs] = await Promise.all([
      getAutopilotRules(),
      getAutopilotActivity(),
      getAutoCleanPrefs(),
    ]);
    setRules(rulesRes.rules ?? []);
    setActivity(activityRes.entries ?? []);
    setAutoCleanPrefs(prefs);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 gap-2 text-muted-foreground py-20">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="divide-y divide-border">

        {/* Tab header */}
        <section className="px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-primary/10">
              <SlidersHorizontal className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Automation</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automated rules and scheduled cleanup for your inbox.
              </p>
            </div>
          </div>
        </section>

        {/* Nightly Auto-Clean */}
        {autoCleanPrefs && (
          <section className="px-6 py-6">
            <h2 className="text-sm font-semibold mb-0.5">Nightly Auto-Clean</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Automatically delete low-value email categories every night — set it and forget it.
            </p>
            <AutoCleanCard initialPrefs={autoCleanPrefs} />
          </section>
        )}

        {/* Sender Rules */}
        <section className="px-6 py-6">
          <h2 className="text-sm font-semibold mb-0.5">Sender Rules</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Automatically unsubscribe or archive senders based on engagement patterns — fires on each analysis.
          </p>
          <div className="px-6 pb-2">
            <AutopilotPanel initialRules={rules} />
          </div>
        </section>

        {/* Activity log */}
        {activity.length > 0 && (
          <section className="px-6 py-6">
            <h2 className="text-sm font-semibold mb-0.5">Recent Activity</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Actions triggered automatically by your rules in the last 50 runs.
            </p>
            <div className="space-y-1">
              {activity.map((entry) => {
                const ago = (() => {
                  const diff = Date.now() - new Date(entry.created_at).getTime();
                  const d = Math.floor(diff / 86_400_000);
                  const h = Math.floor(diff / 3_600_000);
                  const m = Math.floor(diff / 60_000);
                  if (d > 0) return `${d}d ago`;
                  if (h > 0) return `${h}h ago`;
                  return `${m}m ago`;
                })();
                const actionLabel: Record<string, string> = {
                  unsubscribe:  'Unsubscribed',
                  auto_archive: 'Auto-archived',
                  ignore:       'Ignored',
                };
                const statusColor = entry.status === 'done'
                  ? 'text-green-600'
                  : entry.status === 'failed'
                  ? 'text-red-500'
                  : 'text-muted-foreground';
                return (
                  <div key={entry.id} className="flex items-center gap-2 py-1 text-xs border-b border-border/50 last:border-0">
                    <span className="flex-1 truncate font-medium">{entry.sender_name || entry.sender_email}</span>
                    <span className="shrink-0 text-muted-foreground">{actionLabel[entry.action_type] ?? entry.action_type}</span>
                    <span className={`shrink-0 ${statusColor}`}>{entry.status}</span>
                    <span className="shrink-0 text-muted-foreground/60 w-16 text-right">{ago}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
