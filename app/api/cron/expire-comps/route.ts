import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/cron/expire-comps
 *
 * Runs daily at 06:00 UTC via Vercel Cron (see vercel.json).
 * Finds all users whose comped Pro access has expired and resets them to free.
 *
 * Vercel automatically sends: Authorization: Bearer <CRON_SECRET>
 * Add CRON_SECRET to your Vercel environment variables (any random string).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date().toISOString();

  // Find comped Pro users whose access window has closed
  const { data: expired, error: fetchErr } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .eq('plan_tier', 'pro')
    .not('comped_until', 'is', null)
    .lt('comped_until', now);

  if (fetchErr) {
    console.error('[cron/expire-comps] fetch error:', fetchErr.message);
    return NextResponse.json({ error: 'DB fetch failed' }, { status: 500 });
  }

  if (!expired?.length) {
    return NextResponse.json({ expired: 0, message: 'Nothing to expire.' });
  }

  const ids = expired.map((u) => u.id);

  const { error: updateErr } = await supabaseAdmin
    .from('users')
    .update({ plan_tier: 'free', comped_until: null, updated_at: now })
    .in('id', ids);

  if (updateErr) {
    console.error('[cron/expire-comps] update error:', updateErr.message);
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
  }

  console.log(
    `[cron/expire-comps] Expired ${ids.length} comp(s):`,
    expired.map((u) => u.email),
  );

  return NextResponse.json({ expired: ids.length });
}
