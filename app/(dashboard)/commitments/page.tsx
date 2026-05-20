import { auth }         from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { redirect }      from 'next/navigation';
import { CommitmentsClient } from '@/components/commitments/commitments-client';

export const metadata = { title: 'Commitments — Inbox Triage' };

type StatusFilter    = 'open' | 'overdue' | 'done' | 'dismissed';
type DirectionFilter = 'all' | 'outgoing' | 'assigned';
type SortOption      = 'newest' | 'due' | 'counterparty';

const PAGE_SIZE = 50;

export default async function CommitmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; direction?: string; sort?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;

  const { status = 'open', direction = 'all', sort = 'newest', page = '1' } = await searchParams;

  const validStatus: StatusFilter =
    (['open', 'overdue', 'done', 'dismissed'] as StatusFilter[]).includes(status as StatusFilter)
      ? (status as StatusFilter)
      : 'open';
  const validDirection: DirectionFilter =
    (['all', 'outgoing', 'assigned'] as DirectionFilter[]).includes(direction as DirectionFilter)
      ? (direction as DirectionFilter)
      : 'all';
  const validSort: SortOption =
    (['newest', 'due', 'counterparty'] as SortOption[]).includes(sort as SortOption)
      ? (sort as SortOption)
      : 'newest';

  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const from     = (pageNum - 1) * PAGE_SIZE;
  const to       = from + PAGE_SIZE - 1;
  const todayStr = new Date().toISOString().slice(0, 10);

  // ── Main query ────────────────────────────────────────────────────────────────
  let query = supabaseAdmin
    .from('commitments')
    .select(
      'id, thread_id, direction, description, status, due_date, scanned_at, resolved_at, counterparty, counterparty_email, note, priority, blocked',
      { count: 'exact' },
    )
    .eq('user_id', userId);

  if (validDirection !== 'all') query = query.eq('direction', validDirection);

  switch (validStatus) {
    case 'open':
      query = query.eq('status', 'open');
      break;
    case 'done':
      query = query.eq('status', 'done');
      break;
    case 'dismissed':
      query = query.eq('status', 'dismissed');
      break;
    case 'overdue':
      // Only items with an explicit due date in the past — no scanned_at fallback
      query = query
        .eq('status', 'open')
        .not('due_date', 'is', null)
        .lt('due_date', todayStr);
      break;
  }

  switch (validSort) {
    case 'due':
      query = query
        .order('due_date',   { ascending: true,  nullsFirst: false })
        .order('scanned_at', { ascending: false });
      break;
    case 'counterparty':
      query = query
        .order('counterparty', { ascending: true,  nullsFirst: false })
        .order('scanned_at',   { ascending: false });
      break;
    default: // newest
      query = query.order('scanned_at', { ascending: false });
  }

  query = query.range(from, to);

  // ── Summary counts (parallel) ─────────────────────────────────────────────────
  const [
    { data: rows, count, error: queryError },
    { count: openCount },
    { count: overdueCount },
    { count: doneCount },
    { count: dismissedCount },
  ] = await Promise.all([
    query,
    supabaseAdmin
      .from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'open'),
    supabaseAdmin
      .from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'open')
      .not('due_date', 'is', null)
      .lt('due_date', todayStr),
    supabaseAdmin
      .from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'done'),
    supabaseAdmin
      .from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'dismissed'),
  ]);

  return (
    <CommitmentsClient
      commitments={rows ?? []}
      queryError={queryError?.message ?? null}
      counts={{
        open:      openCount      ?? 0,
        overdue:   overdueCount   ?? 0,
        done:      doneCount      ?? 0,
        dismissed: dismissedCount ?? 0,
      }}
      totalCount={count ?? 0}
      pageNum={pageNum}
      totalPages={count ? Math.ceil(count / PAGE_SIZE) : 1}
      validStatus={validStatus}
      validDirection={validDirection}
      validSort={validSort}
      todayStr={todayStr}
    />
  );
}
