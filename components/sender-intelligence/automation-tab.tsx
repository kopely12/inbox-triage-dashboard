'use client';

// AutomationTab — Inbox Cleaner automation settings.
// Combines Schedules, Autopilot rules, activity log, and Gmail Filter audit.

import { useState, useEffect, useCallback, useTransition } from 'react';
import { Loader2, Calendar, Bot, Filter as FilterIcon, ChevronRight } from 'lucide-react';
import { FilterAuditTab } from './filter-audit-tab';
import { AutopilotPanel }  from '@/components/preferences/autopilot-panel';
import { SchedulePanel }   from '@/components/preferences/schedule-panel';
import { getAutopilotRules, getAutopilotEnabled, setAutopilotEnabled, getAutopilotActivity, type AutopilotActivityEntry } from '@/app/actions/autopilot';
import { getAnalysisSchedule, getCleanupSchedule } from '@/app/actions/engagement';
import { toast } from 'sonner';
import type { AutopilotRule } from '@/lib/autopilot';
import type { AnalysisSchedule, CleanupSchedule } from '@/app/actions/engagement';

// ── Component ─────────────────────────────────────────────────────────────────

export function AutomationTab() {
  const [loading,          setLoading]          = useState(true);
  const [rules,            setRules]            = useState<AutopilotRule[]>([]);
  const [analysis,         setAnalysis]         = useState<AnalysisSchedule | null>(null);
  const [cleanup,          setCleanup]          = useState<CleanupSchedule | null>(null);
  const [autopilotEnabled, setAutopilotEnabledState] = useState(true);
  const [activity,         setActivity]         = useState<AutopilotActivityEntry[]>([]);
  const [, startTransition] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const [rulesRes, analysisRes, cleanupRes, enabledRes, activityRes] = await Promise.all([
      getAutopilotRules(),
      getAnalysisSchedule(),
      getCleanupSchedule(),
      getAutopilotEnabled(),
      getAutopilotActivity(),
    ]);
    setRules(rulesRes.rules ?? []);
    setAnalysis(analysisRes.schedule ?? null);
    setCleanup(cleanupRes.schedule ?? null);
    setAutopilotEnabledState(enabledRes.enabled);
    setActivity(activityRes.entries ?? []);
    setLoading(false);
  }, []);

  function handleToggleAutopilot() {
    const next = !autopilotEnabled;
    setAutopilotEnabledState(next);
    startTransition(async () => {
      const { error } = await setAutopilotEnabled(next);
      if (error) {
        setAutopilotEnabledState(!next);
        toast.error(`Failed to update autopilot: ${error}`);
      } else {
        toast.success(next ? 'Autopilot enabled' : 'Autopilot paused — rules will not run until re-enabled');
      }
    });
  }

  useEffect(() => { load(); }, [load]);

  if (loading || !analysis) {
    return (
      <div className="flex items-center justify-center flex-1 gap-2 text-muted-foreground py-20">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto space-y-0 divide-y divide-border">

        {/* Section quick-jump nav */}
        <div className="px-6 py-3 flex items-center gap-4 text-xs text-muted-foreground border-b border-border/60 bg-muted/20">
          <span className="font-medium text-foreground">Jump to:</span>
          {[
            { id: 'schedules',  label: 'Schedules',  icon: Calendar    },
            { id: 'autopilot',  label: 'Auto-pilot', icon: Bot         },
            { id: 'filters',    label: 'Filters',    icon: FilterIcon  },
          ].map(({ id, label, icon: Icon }) => (
            <a key={id} href={`#auto-${id}`}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <Icon className="w-3 h-3" />
              {label}
              <ChevronRight className="w-3 h-3 opacity-40" />
            </a>
          ))}
        </div>

        {/* Schedules */}
        <section id="auto-schedules" className="px-6 py-6">
          <h2 className="text-sm font-semibold mb-0.5">Schedules</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Automatically run inbox analysis and cleanup on a recurring schedule.
          </p>
          <SchedulePanel initialAnalysis={analysis} initialCleanup={cleanup} />
        </section>

        {/* Autopilot */}
        <section id="auto-autopilot" className="px-6 py-6">
          <div className="flex items-start justify-between mb-0.5">
            <h2 className="text-sm font-semibold">Auto-pilot</h2>
            <button
              type="button"
              role="switch"
              aria-checked={autopilotEnabled}
              onClick={handleToggleAutopilot}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
                autopilotEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
              title={autopilotEnabled ? 'Autopilot is on — click to pause' : 'Autopilot is paused — click to enable'}
            >
              <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
                autopilotEnabled ? 'translate-x-4' : 'translate-x-0'
              }`} />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            {autopilotEnabled
              ? 'Behavioral rules run automatically during each analysis — your inbox improves in the background.'
              : 'Autopilot is paused. Rules are saved but will not run until you re-enable it.'
            }
          </p>
          <AutopilotPanel initialRules={rules} />
        </section>

        {/* Rule activity log */}
        {activity.length > 0 && (
          <section className="px-6 py-6">
            <h2 className="text-sm font-semibold mb-0.5">Recent Autopilot Activity</h2>
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
                  unsubscribe: 'Unsubscribed',
                  auto_archive: 'Auto-archived',
                  ignore: 'Ignored',
                };
                const statusColor = entry.status === 'done' ? 'text-green-600' : entry.status === 'failed' ? 'text-red-500' : 'text-muted-foreground';
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

        {/* Gmail filter audit */}
        <section id="auto-filters" className="px-0 py-0">
          <div className="px-6 pt-6 pb-2">
            <h2 className="text-sm font-semibold mb-0.5">Gmail Filters</h2>
            <p className="text-xs text-muted-foreground">
              Audit and manage Gmail filters that affect your inbox — find orphaned, duplicate, or stale rules.
            </p>
          </div>
          <FilterAuditTab embedded />
        </section>

      </div>
    </div>
  );
}
