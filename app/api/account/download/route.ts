import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// ── DB-backed rate limiter ─────────────────────────────────────────────────
// Timestamps are stored inside user_preferences.prefs.__download_timestamps
// so they persist across serverless cold starts and multiple instances.

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_HITS  = 3;               // max downloads per window

async function checkRateLimit(
  userId: string,
): Promise<{ limited: boolean; retryAfterSecs: number }> {
  const now = Date.now();

  const { data } = await supabaseAdmin
    .from('user_preferences')
    .select('prefs')
    .eq('user_id', userId)
    .maybeSingle();

  const existing   = (data?.prefs as Record<string, unknown>) ?? {};
  const raw        = existing.__download_timestamps;
  const allHits    = Array.isArray(raw) ? (raw as number[]) : [];
  const recent     = allHits.filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_HITS) {
    const oldest = Math.min(...recent);
    return { limited: true, retryAfterSecs: Math.ceil((WINDOW_MS - (now - oldest)) / 1000) };
  }

  // Record this hit
  const updated = [...recent, now];
  await supabaseAdmin
    .from('user_preferences')
    .upsert(
      {
        user_id:    userId,
        prefs:      { ...existing, __download_timestamps: updated },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  return { limited: false, retryAfterSecs: 0 };
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  const { limited, retryAfterSecs } = await checkRateLimit(userId);
  if (limited) {
    return NextResponse.json(
      { error: 'Too many requests. You can download your data up to 3 times per hour.' },
      {
        status: 429,
        headers: {
          'Retry-After':           String(retryAfterSecs),
          'X-RateLimit-Limit':     String(MAX_HITS),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset':     String(Math.ceil((Date.now() + retryAfterSecs * 1000) / 1000)),
        },
      },
    );
  }

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
    exported_at:     new Date().toISOString(),
    profile:         user,
    commitments:     commitments     ?? [],
    triage_sessions: triageSessions ?? [],
  };

  const filename = `iinbox-${new Date().toISOString().split('T')[0]}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type':        'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  });
}
