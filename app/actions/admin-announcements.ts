'use server';

import { auth }          from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { updateTag }     from 'next/cache';
import type { AnnouncementConfig } from '@/lib/get-announcement';

export async function saveAnnouncement(
  config: AnnouncementConfig,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) return { ok: false, error: 'Unauthorized' };

  if (config.active && !config.message.trim()) {
    return { ok: false, error: 'Message cannot be empty when publishing.' };
  }

  const { error } = await supabaseAdmin
    .from('site_settings')
    .upsert(
      { key: 'announcement', value: config, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );

  if (error) {
    console.error('[admin] saveAnnouncement error:', error.message);
    return { ok: false, error: 'Failed to save announcement.' };
  }

  // Bust the 60-second unstable_cache so the banner appears/disappears immediately.
  // updateTag is the Next.js 16 API for invalidating unstable_cache entries from
  // within a server action (supports read-your-own-writes semantics).
  updateTag('announcement');
  return { ok: true };
}
