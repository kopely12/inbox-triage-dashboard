import { NextResponse }  from 'next/server';
import { auth }          from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ overdue: 0 });

  const todayISO = new Date().toISOString().slice(0, 10);

  const { count } = await supabaseAdmin
    .from('commitments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', session.user.id)
    .eq('status', 'open')
    .not('due_date', 'is', null)
    .lt('due_date', todayISO);

  return NextResponse.json({ overdue: count ?? 0 });
}
