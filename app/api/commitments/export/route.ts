import { auth }         from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const userId = session.user.id;

  const direction = req.nextUrl.searchParams.get('direction') ?? 'all';
  const status    = req.nextUrl.searchParams.get('status')    ?? 'all';
  const validDir  = ['outgoing', 'incoming'].includes(direction) ? direction : null;
  const validStatus = (['open', 'done', 'overdue', 'all'] as const).includes(status as 'open' | 'done' | 'overdue' | 'all')
    ? status as 'open' | 'done' | 'overdue' | 'all'
    : 'all';

  const overdueThreshold = new Date();
  overdueThreshold.setUTCDate(overdueThreshold.getUTCDate() - 14);

  let query = supabaseAdmin
    .from('commitments')
    .select('id, direction, description, status, due_date, scanned_at, resolved_at, counterparty, counterparty_email, priority, note, thread_id')
    .eq('user_id', userId)
    .order('scanned_at', { ascending: false })
    .limit(2000);

  if (validDir) query = query.eq('direction', validDir);

  if (validStatus === 'open')    query = query.eq('status', 'open');
  else if (validStatus === 'done') query = query.eq('status', 'done');
  else if (validStatus === 'overdue') {
    query = query.eq('status', 'open').or(
      `due_date.lt.${new Date().toISOString().slice(0, 10)},scanned_at.lte.${overdueThreshold.toISOString()}`
    );
  }
  // 'all' — no status filter

  const { data, error } = await query;
  if (error) return new NextResponse('Failed to fetch data', { status: 500 });

  const rows = data ?? [];

  const HEADERS = [
    'ID', 'Direction', 'Description', 'Status', 'Due Date',
    'Counterparty', 'Counterparty Email',
    'Created', 'Resolved', 'Priority', 'Note', 'Thread ID',
  ];

  const csvLines: string[] = [HEADERS.join(',')];

  for (const r of rows) {
    csvLines.push([
      escapeCSV(r.id),
      escapeCSV(r.direction),
      escapeCSV(r.description),
      escapeCSV(r.status),
      escapeCSV(r.due_date),
      escapeCSV(r.counterparty),
      escapeCSV(r.counterparty_email),
      escapeCSV(r.scanned_at ? new Date(r.scanned_at).toISOString() : ''),
      escapeCSV(r.resolved_at ? new Date(r.resolved_at).toISOString() : ''),
      escapeCSV(r.priority),
      escapeCSV(r.note),
      escapeCSV(r.thread_id),
    ].join(','));
  }

  const csv          = csvLines.join('\r\n');
  const filterSuffix = [
    validStatus !== 'all' ? validStatus : '',
    validDir    ? validDir    : '',
  ].filter(Boolean).join('-');
  const filename = `commitments${filterSuffix ? `-${filterSuffix}` : ''}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  });
}
