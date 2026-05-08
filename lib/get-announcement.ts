import { unstable_cache } from 'next/cache';
import { supabaseAdmin }  from '@/lib/supabase';

export type AnnouncementType = 'info' | 'warning' | 'error' | 'success';

export type AnnouncementConfig = {
  active:  boolean;
  message: string;
  type:    AnnouncementType;
};

/**
 * Fetches the current announcement from site_settings, cached for up to 60 s.
 * Invalidated immediately via revalidateTag('announcement') when an admin saves.
 */
export const getAnnouncement = unstable_cache(
  async (): Promise<{ value: AnnouncementConfig; updated_at: string } | null> => {
    const { data } = await supabaseAdmin
      .from('site_settings')
      .select('value, updated_at')
      .eq('key', 'announcement')
      .single();
    return data ?? null;
  },
  ['announcement'],
  { tags: ['announcement'], revalidate: 60 },
);
