'use client';

// FilterAuditTab — audits all Gmail filters and surfaces actionable issues.
// Categorises issues as: orphaned, dead, duplicate, untracked, stale_reference.

import { useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { toast }    from 'sonner';
import {
  Filter, RefreshCw, Loader2, Trash2, AlertTriangle, CheckCircle2,
  Info, Archive, Eye, EyeOff,
} from 'lucide-react';
import { Button }   from '@/components/ui/button';
import { cn }       from '@/lib/utils';
import {
  getFilterAudit, deleteFilterAuditItem,
  type FilterIssue, type FilterIssueType, type FilterAuditResult,
} from '@/app/actions/engagement';

// ── Meta ──────────────────────────────────────────────────────────────────────

const ISSUE_META: Record<FilterIssueType, {
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  canDelete: boolean;
}> = {
  orphaned: {
    label:       'Orphaned',
    description: 'iinbox created this filter, but it no longer makes sense — the sender was unsubscribed or became a trusted contact.',
    icon:        Archive,
    color:       'text-amber-700',
    bg:          'bg-amber-50 border-amber-200',
    canDelete:   true,
  },
  dead: {
    label:       'Dead filter',
    description: "This sender hasn't emailed in 180+ days — the filter is doing nothing.",
    icon:        EyeOff,
    color:       'text-gray-600',
    bg:          'bg-gray-50 border-gray-200',
    canDelete:   true,
  },
  duplicate: {
    label:       'Duplicate',
    description: 'Multiple filters target the same address. The extras are redundant.',
    icon:        Filter,
    color:       'text-blue-700',
    bg:          'bg-blue-50 border-blue-200',
    canDelete:   true,
  },
  untracked: {
    label:       'Not managed by iinbox',
    description: 'This filter removes emails from your inbox but was not created by iinbox. Review it to make sure it is intentional.',
    icon:        Eye,
    color:       'text-purple-700',
    bg:          'bg-purple-50 border-purple-200',
    canDelete:   false, // informational only — user must decide
  },
  stale_reference: {
    label:       'Missing from Gmail',
    description: 'iinbox thinks this filter exists but it was deleted directly in Gmail. We can clean up our records.',
    icon:        AlertTriangle,
    color:       'text-red-700',
    bg:          'bg-red-50 border-red-200',
    canDelete:   true,
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function FilterAuditTab({ embedded = false }: { embedded?: boolean }) {
  const { data: session } = useSession();
  const gmailAcct = session?.user?.email ? encodeURIComponent(session.user.email) : '0';
  const [result,   setResult]   = useState<FilterAuditResult | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getFilterAudit();
    setResult(data);
    setLoading(false);
    if (data.error) toast.error(`Filter audit failed: ${data.error}`);
  }, []);

  async function handleDelete(issue: FilterIssue) {
    setDeleting((prev) => new Set(prev).add(issue.filter_id));
    const { success, error } = await deleteFilterAuditItem(issue.filter_id);
    setDeleting((prev) => { const s = new Set(prev); s.delete(issue.filter_id); return s; });
    if (error) {
      toast.error(`Could not remove filter: ${error}`);
    } else {
      toast.success('Filter removed.');
      setResult((prev) =>
        prev ? { ...prev, issues: prev.issues.filter((i) => i.filter_id !== issue.filter_id) } : prev,
      );
    }
  }

  function dismiss(filterId: string) {
    setDismissed((prev) => new Set(prev).add(filterId));
  }

  const visibleIssues = (result?.issues ?? []).filter((i) => !dismissed.has(i.filter_id));

  // Group by type for organised display
  const grouped = Object.entries(ISSUE_META).reduce<Record<FilterIssueType, FilterIssue[]>>(
    (acc, [type]) => {
      acc[type as FilterIssueType] = visibleIssues.filter((i) => i.type === type);
      return acc;
    },
    {} as Record<FilterIssueType, FilterIssue[]>,
  );

  return (
    <div className={embedded ? 'px-6 pb-6 space-y-6' : 'flex-1 overflow-auto px-6 py-6'}>
      <div className={cn('space-y-6', !embedded && 'max-w-2xl mx-auto')}>

        {/* Header — suppressed when embedded (parent section provides its own heading) */}
        {!embedded && (
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Filter className="w-4 h-4 text-primary" />
                Gmail Filter Audit
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Scans your Gmail filters for orphaned, duplicate, and dead rules that are cluttering your filter list.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', loading && 'animate-spin')} />
              {result ? 'Re-scan' : 'Scan filters'}
            </Button>
          </div>
        )}
        {embedded && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', loading && 'animate-spin')} />
              {result ? 'Re-scan' : 'Scan filters'}
            </Button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Fetching your Gmail filters…</p>
          </div>
        )}

        {/* Not yet scanned */}
        {!loading && !result && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-xl border border-border bg-card text-center">
            <Filter className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">No scan run yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Click &ldquo;Scan filters&rdquo; to analyse your Gmail filters and find any that can be cleaned up.
            </p>
            <Button onClick={load} size="sm" className="mt-2">
              <Filter className="w-3.5 h-3.5 mr-1.5" />
              Scan filters
            </Button>
          </div>
        )}

        {/* Results */}
        {!loading && result && (
          <>
            {/* Summary bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total filters', value: result.summary.total_gmail_filters, color: 'text-foreground' },
                { label: 'Archive filters', value: result.summary.archive_filters, color: 'text-blue-600' },
                { label: 'Issues found', value: result.summary.total_issues, color: result.summary.total_issues > 0 ? 'text-amber-600' : 'text-green-600' },
                { label: 'Still visible', value: visibleIssues.length, color: 'text-muted-foreground' },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-lg border border-border bg-card px-4 py-3 text-center">
                  <div className={cn('text-2xl font-bold tabular-nums', color)}>{value}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {/* All clean */}
            {visibleIssues.length === 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800 text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" />
                <span>
                  {result.summary.total_issues === 0
                    ? `All ${result.summary.total_gmail_filters} Gmail filters look clean.`
                    : 'All issues have been addressed.'}
                </span>
              </div>
            )}

            {/* Issue groups */}
            {(Object.entries(grouped) as [FilterIssueType, FilterIssue[]][])
              .filter(([, issues]) => issues.length > 0)
              .map(([type, issues]) => {
                const meta = ISSUE_META[type];
                const Icon = meta.icon;
                return (
                  <div key={type} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Icon className={cn('w-3.5 h-3.5 shrink-0', meta.color)} />
                      <h3 className={cn('text-sm font-medium', meta.color)}>
                        {meta.label} <span className="font-normal text-muted-foreground">({issues.length})</span>
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground">{meta.description}</p>

                    <div className="space-y-2">
                      {issues.map((issue) => (
                        <IssueRow
                          key={issue.filter_id}
                          issue={issue}
                          meta={meta}
                          isDeleting={deleting.has(issue.filter_id)}
                          onDelete={() => handleDelete(issue)}
                          onDismiss={() => dismiss(issue.filter_id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            }

            {/* Untracked note */}
            {result.summary.untracked > 0 && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2.5 border border-border">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Untracked filters are shown for awareness only — iinbox won&apos;t delete
                  them automatically. Review them in{' '}
                  <a
                    href={`https://mail.google.com/mail/u/${gmailAcct}/#settings/filters`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground"
                  >
                    Gmail Settings → Filters
                  </a>.
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── IssueRow ──────────────────────────────────────────────────────────────────

function IssueRow({
  issue, meta, isDeleting, onDelete, onDismiss,
}: {
  issue:      FilterIssue;
  meta:       typeof ISSUE_META[FilterIssueType];
  isDeleting: boolean;
  onDelete:   () => void;
  onDismiss:  () => void;
}) {
  const displayName = issue.sender_email || issue.from_value;

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-lg border px-4 py-3 text-sm',
      meta.bg,
    )}>
      {/* Identity */}
      <div className="flex-1 min-w-0">
        <span className="font-medium truncate block">{displayName}</span>
        {issue.reason && (
          <span className="text-xs text-muted-foreground truncate block mt-0.5">{issue.reason}</span>
        )}
        {issue.days_silent != null && (
          <span className="text-xs text-muted-foreground mt-0.5 block">
            Silent for {issue.days_silent} days
          </span>
        )}
        {issue.type === 'duplicate' && issue.action && (
          <span className="text-xs text-muted-foreground mt-0.5 block">
            Action: {issue.action === 'auto_archive' ? 'auto-archive' : 'restore inbox'} · duplicate of {issue.original_id}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {meta.canDelete ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs border-current/30 hover:bg-white/60"
            onClick={onDelete}
            disabled={isDeleting}
            title="Remove this filter"
          >
            {isDeleting
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <><Trash2 className="w-3 h-3 mr-1" />Remove</>
            }
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={onDismiss}
            title="Dismiss — I've reviewed this"
          >
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
}
