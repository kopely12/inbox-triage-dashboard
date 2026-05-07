import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  const [{ data: user }, { data: commitments }, { data: triageSessions }] =
    await Promise.all([
      supabaseAdmin
        .from('users')
        .select('id, email, name, created_at, org_role, plan_tier, timezone, default_snooze_hours')
        .eq('id', userId)
        .single(),
      supabaseAdmin
        .from('commitments')
        .select('id, direction, status, summary, due_date, scanned_at, resolved_at')
        .eq('user_id', userId)
        .order('scanned_at', { ascending: false }),
      supabaseAdmin
        .from('triage_sessions')
        .select('id, triggered_at, emails_scanned, emails_surfaced')
        .eq('user_id', userId)
        .order('triggered_at', { ascending: false })
        .limit(200),
    ]);

  const payload = {
    exported_at:    new Date().toISOString(),
    profile:        user,
    commitments:    commitments    ?? [],
    triage_sessions: triageSessions ?? [],
  };

  const filename = `inbox-triage-${new Date().toISOString().split('T')[0]}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type':        'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
