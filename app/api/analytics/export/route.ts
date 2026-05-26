import { NextRequest, NextResponse } from 'next/server';
import { auth }                      from '@/auth';
import { supabaseAdmin }             from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const userId = session.user.id;

  const { searchParams } = new URL(req.url);
  const range = searchParams.get('range') ?? '4w';

  const weeks =
    range === '1w'  ? 1  :
    range === '12w' ? 12 :
    range === 'all' ? 52 : 4;

  const since = new Date();
  since.setDate(since.getDate() - weeks * 7);
  const sinceISO = since.toISOString();

  const { data: commitments, error } = await supabaseAdmin
    .from('commitments')
    .select('id, direction, description, status, due_date, scanned_at, resolved_at, counterparty, counterparty_email')
    .eq('user_id', userId)
    .gte('scanned_at', sinceISO)
    .order('scanned_at', { ascending: false });

  if (error) {
    return new NextResponse('Failed to fetch data', { status: 500 });
  }

  const rows = commitments ?? [];

  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;

  const header   = 'ID,Direction,Description,Status,Due Date,Created,Resolved,Counterparty,Counterparty Email';
  const csvRows  = rows.map((c) => [
    escape(c.id),
    c.direction,
    escape(c.description ?? ''),
    c.status,
    c.due_date ?? '',
    c.scanned_at?.slice(0, 10) ?? '',
    c.resolved_at?.slice(0, 10) ?? '',
    escape(c.counterparty ?? ''),
    c.counterparty_email ?? '',
  ].join(','));

  const csv      = [header, ...csvRows].join('\n');
  const filename = `commitments-${range}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
