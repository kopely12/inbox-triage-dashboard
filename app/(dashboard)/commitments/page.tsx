import { auth }          from '@/auth';
import { supabaseAdmin }  from '@/lib/supabase';
import { redirect }       from 'next/navigation';
import Link               from 'next/link';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import { Badge }          from '@/components/ui/badge';
import { Button }         from '@/components/ui/button';
import { MarkDoneButton, DueDateCell } from '@/components/commitments/commitment-row-actions';
import { ExternalLink, Download, ArrowUpRight } from 'lucide-react';

// ─── types ────────────────────────────────────────────────────────────────────

type StatusFilter    = 'all' | 'open' | 'overdue' | 'done';
type DirectionFilter = 'all' | 'outgoing' | 'incoming';

// ─── helpers ──────────────────────────────────────────────────────────────────

function gmailThreadUrl(threadId: string | null) {
  if (!threadId || threadId.startsWith('compose_') || threadId.startsWith('manual_')) return null;
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}

function statusBadge(status: string, isOverdue: boolean) {
  if (status === 'done')
    return <Badge variant="secondary" className="text-[10px] py-0 capitalize">Done</Badge>;
  if (isOverdue)
    return <Badge variant="destructive" className="text-[10px] py-0">Overdue</Badge>;
  return <Badge variant="outline" className="text-[10px] py-0 capitalize">Open</Badge>;
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function CommitmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; direction?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;

  const { status = 'open', direction = 'all', page = '1' } = await searchParams;

  const validStatus    = (['all', 'open', 'overdue', 'done'] as StatusFilter[]).includes(status as StatusFilter)
    ? (status as StatusFilter) : 'open';
  const validDirection = (['all', 'outgoing', 'incoming'] as DirectionFilter[]).includes(direction as DirectionFilter)
    ? (direction as DirectionFilter) : 'all';

  const PAGE_SIZE = 50;
  const pageNum   = Math.max(1, parseInt(page, 10) || 1);
  const from      = (pageNum - 1) * PAGE_SIZE;
  const to        = from + PAGE_SIZE - 1;

  // ── build query ──────────────────────────────────────────────────────────────
  let query = supabaseAdmin
    .from('commitments')
    .select('id, thread_id, direction, description, status, due_date, scanned_at, resolved_at, counterparty, counterparty_email, note', { count: 'exact' })
    .eq('user_id', userId);

  if (validDirection !== 'all') query = query.eq('direction', validDirection);

  const overdueThreshold = new Date();
  overdueThreshold.setUTCDate(overdueThreshold.getUTCDate() - 14);

  if (validStatus === 'open')    query = query.eq('status', 'open');
  else if (validStatus === 'done') query = query.eq('status', 'done');
  else if (validStatus === 'overdue') {
    query = query.eq('status', 'open').or(
      `due_date.lt.${new Date().toISOString().slice(0, 10)},scanned_at.lte.${overdueThreshold.toISOString()}`
    );
  }
  // 'all' — no status filter

  query = query
    .order('scanned_at', { ascending: false })
    .range(from, to);

  const { data: rows, count, error: queryError } = await query;
  const commitments = rows ?? [];

  const totalPages  = count ? Math.ceil(count / PAGE_SIZE) : 1;

  // ── summary counts for filter tabs ─────────────────────────────────────────
  const [
    { count: openCount },
    { count: overdueCount },
    { count: doneCount },
  ] = await Promise.all([
    supabaseAdmin.from('commitments').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('status', 'open'),
    supabaseAdmin.from('commitments').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('status', 'open')
      .or(`due_date.lt.${new Date().toISOString().slice(0, 10)},scanned_at.lte.${overdueThreshold.toISOString()}`),
    supabaseAdmin.from('commitments').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('status', 'done'),
  ]);

  const today = new Date(); today.setHours(0, 0, 0, 0);

  // ── filter tab helpers ────────────────────────────────────────────────────
  function tabHref(s: string, d?: string) {
    const p = new URLSearchParams({ status: s, direction: d ?? validDirection });
    return `/commitments?${p.toString()}`;
  }

  function dirHref(d: string) {
    const p = new URLSearchParams({ status: validStatus, direction: d });
    return `/commitments?${p.toString()}`;
  }

  const tabs: { key: StatusFilter; label: string; count: number | null }[] = [
    { key: 'open',    label: 'Open',    count: openCount    ?? 0 },
    { key: 'overdue', label: 'Overdue', count: overdueCount ?? 0 },
    { key: 'done',    label: 'Done',    count: doneCount    ?? 0 },
    { key: 'all',     label: 'All',     count: null },
  ];

  return (
    <div className="max-w-4xl space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Commitments</h2>
          <p className="text-sm text-muted-foreground">
            Review promises you&apos;ve made and tasks others have assigned to you.
            Manage commitments in-context from the extension sidebar.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5 shrink-0">
          <Link href={`/api/commitments/export?${new URLSearchParams({ direction: validDirection, status: validStatus }).toString()}`}>
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Link>
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">

        {/* Status tabs */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-muted">
          {tabs.map(({ key, label, count }) => (
            <Link
              key={key}
              href={tabHref(key)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors',
                validStatus === key
                  ? 'bg-background text-foreground shadow-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {label}
              {count !== null && (
                <span className={[
                  'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                  validStatus === key ? 'bg-muted' : 'bg-transparent',
                  key === 'overdue' && (count ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
                ].join(' ')}>
                  {count}
                </span>
              )}
            </Link>
          ))}
        </div>

        {/* Direction filter */}
        <div className="flex items-center gap-1 text-sm">
          {(['all', 'outgoing', 'incoming'] as const).map((d) => (
            <Link
              key={d}
              href={dirHref(d)}
              className={[
                'px-2.5 py-1 rounded-md text-sm transition-colors capitalize',
                validDirection === d
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              ].join(' ')}
            >
              {d === 'all' ? 'Both directions' : d === 'outgoing' ? 'My promises' : 'Assigned to me'}
            </Link>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card>
        {queryError ? (
          <CardContent className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <p className="text-sm font-medium text-destructive">Failed to load commitments</p>
            <p className="text-xs text-muted-foreground max-w-xs font-mono">{queryError.message}</p>
          </CardContent>
        ) : commitments.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <p className="text-sm font-medium">
              {validStatus === 'open'    ? 'No open commitments' :
               validStatus === 'overdue' ? 'Nothing overdue' :
               validStatus === 'done'    ? 'No resolved commitments yet' :
               'No commitments found'}
            </p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {validStatus === 'open'
                ? 'Run a commitment scan in the extension to detect promises from your emails.'
                : 'Commitments appear here as the extension processes your inbox.'}
            </p>
          </CardContent>
        ) : (
          <div className="divide-y divide-border">
            {commitments.map((c: any) => {
              const dueDateTs  = c.due_date ? new Date(c.due_date + 'T00:00:00').getTime() : null;
              const isOverdue  = c.status === 'open' && (
                (dueDateTs !== null && dueDateTs < today.getTime()) ||
                new Date(c.scanned_at) <= overdueThreshold
              );
              const gmailUrl   = gmailThreadUrl(c.thread_id);
              const counterparty = c.counterparty || c.counterparty_email || '—';

              return (
                <div key={c.id} className="px-5 py-4 hover:bg-muted/30 transition-colors group">
                  <div className="flex items-start gap-3">

                    {/* Direction indicator */}
                    <div
                      className="mt-0.5 shrink-0"
                      title={c.direction === 'outgoing' ? 'Your promise' : 'Assigned to you'}
                    >
                      <ArrowUpRight
                        className={[
                          'w-3.5 h-3.5',
                          c.direction === 'outgoing'
                            ? 'text-blue-500 dark:text-blue-400'
                            : 'rotate-180 text-amber-500 dark:text-amber-400',
                        ].join(' ')}
                      />
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-start gap-2 flex-wrap">
                        <p className={[
                          'text-sm leading-snug flex-1',
                          c.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground',
                        ].join(' ')}>
                          {c.description}
                        </p>
                        {statusBadge(c.status, isOverdue)}
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          {c.direction === 'outgoing' ? 'To' : 'From'}{' '}
                          <span className="font-medium text-foreground">{counterparty}</span>
                        </span>

                        <span className="text-xs text-muted-foreground">
                          Created {new Date(c.scanned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>

                        {c.status === 'done' && c.resolved_at && (
                          <span className="text-xs text-muted-foreground">
                            Resolved {new Date(c.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}

                        {c.note && (
                          <span className="text-xs text-muted-foreground italic truncate max-w-[200px]" title={c.note}>
                            "{c.note}"
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <DueDateCell id={c.id} dueDate={c.due_date} />

                      {gmailUrl && (
                        <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" title="View in Gmail">
                          <a href={gmailUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3 h-3" />
                            Gmail
                          </a>
                        </Button>
                      )}

                      <MarkDoneButton id={c.id} status={c.status} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {from + 1}–{Math.min(to + 1, count ?? 0)} of {count ?? 0}
          </span>
          <div className="flex gap-2">
            {pageNum > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/commitments?${new URLSearchParams({ status: validStatus, direction: validDirection, page: String(pageNum - 1) })}`}>
                  Previous
                </Link>
              </Button>
            )}
            {pageNum < totalPages && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/commitments?${new URLSearchParams({ status: validStatus, direction: validDirection, page: String(pageNum + 1) })}`}>
                  Next
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
