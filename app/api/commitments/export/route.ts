import { auth }          from '@/auth';
import { supabaseAdmin }  from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const EXPORT_LIMIT = 5000;

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

type ValidStatus = 'open' | 'done' | 'dismissed' | 'overdue' | 'all';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const userId = session.user.id;

  const sp        = req.nextUrl.searchParams;
  const direction = sp.get('direction') ?? 'all';
  const status    = sp.get('status')    ?? 'all';

  const validDir: string | null = ['outgoing', 'assigned'].includes(direction) ? direction : null;
  const validStatus: ValidStatus =
    (['open', 'done', 'dismissed', 'overdue', 'all'] as ValidStatus[]).includes(status as ValidStatus)
      ? (status as ValidStatus)
      : 'all';

  const todayStr = new Date().toISOString().slice(0, 10);

  // ── Total count ───────────────────────────────────────────────────────────────
  let countQ = supabaseAdmin
    .from('commitments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (validDir)                        countQ = countQ.eq('direction', validDir);
  if (validStatus === 'open')          countQ = countQ.eq('status', 'open');
  else if (validStatus === 'done')     countQ = countQ.eq('status', 'done');
  else if (validStatus === 'dismissed') countQ = countQ.eq('status', 'dismissed');
  else if (validStatus === 'overdue')  countQ = countQ.eq('status', 'open').not('due_date', 'is', null).lt('due_date', todayStr);
  const { count: totalCount } = await countQ;

  // ── Rows ──────────────────────────────────────────────────────────────────────
  let rowQ = supabaseAdmin
    .from('commitments')
    .select('id, direction, description, status, due_date, scanned_at, resolved_at, counterparty, counterparty_email, priority, note, thread_id')
    .eq('user_id', userId)
    .order('scanned_at', { ascending: false })
    .limit(EXPORT_LIMIT);
  if (validDir)                        rowQ = rowQ.eq('direction', validDir);
  if (validStatus === 'open')          rowQ = rowQ.eq('status', 'open');
  else if (validStatus === 'done')     rowQ = rowQ.eq('status', 'done');
  else if (validStatus === 'dismissed') rowQ = rowQ.eq('status', 'dismissed');
  else if (validStatus === 'overdue')  rowQ = rowQ.eq('status', 'open').not('due_date', 'is', null).lt('due_date', todayStr);

  const { data, error } = await rowQ;
  if (error) return new NextResponse('Failed to fetch data', { status: 500 });

  const rows      = data ?? [];
  const truncated = (totalCount ?? 0) > EXPORT_LIMIT;

  // ── Build CSV ─────────────────────────────────────────────────────────────────
  const HEADERS = [
    'ID', 'Direction', 'Description', 'Status', 'Due Date',
    'Counterparty', 'Counterparty Email',
    'Created', 'Resolved', 'Priority', 'Note', 'Thread ID',
  ];

  const csvLines: string[] = [];
  if (truncated) {
    csvLines.push(
      `# Export limited to ${EXPORT_LIMIT} rows. Total matching: ${totalCount ?? '?'}. Use filters to export a smaller set.`,
    );
  }
  csvLines.push(HEADERS.join(','));

  for (const r of rows) {
    csvLines.push([
      escapeCSV(r.id),
      escapeCSV(r.direction),
      escapeCSV(r.description),
      escapeCSV(r.status),
      escapeCSV(r.due_date),
      escapeCSV(r.counterparty),
      escapeCSV(r.counterparty_email),
      escapeCSV(r.scanned_at  ? new Date(r.scanned_at).toISOString()  : ''),
      escapeCSV(r.resolved_at ? new Date(r.resolved_at).toISOString() : ''),
      escapeCSV(r.priority),
      escapeCSV(r.note),
      escapeCSV(r.thread_id),
    ].join(','));
  }

  const csv          = csvLines.join('\r\n');
  const filterSuffix = [
    validStatus !== 'all' ? validStatus : '',
    validDir ?? '',
  ].filter(Boolean).join('-');
  const filename = `commitments${filterSuffix ? `-${filterSuffix}` : ''}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
      ...(truncated
        ? { 'X-Export-Truncated': 'true', 'X-Total-Count': String(totalCount) }
        : {}),
    },
  });
}
