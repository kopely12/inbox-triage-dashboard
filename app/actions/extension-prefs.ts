'use server';

import { auth }          from '@/auth';
import { supabaseAdmin }  from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import type { ExtensionPrefs } from '@/lib/extension-prefs';

/** Merge partial prefs into the user's saved prefs row in Supabase. */
export async function saveExtensionPrefs(
  partial: Partial<ExtensionPrefs>,
): Promise<{ error?: string; success?: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthenticated' };

  const userId = session.user.id;

  // Fetch existing row so we can deep-merge
  const { data: existing } = await supabaseAdmin
    .from('user_preferences')
    .select('prefs')
    .eq('user_id', userId)
    .maybeSingle();

  const merged = { ...(existing?.prefs ?? {}), ...partial };

  const { error } = await supabaseAdmin
    .from('user_preferences')
    .upsert(
      { user_id: userId, prefs: merged, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );

  if (error) {
    console.error('[extension-prefs] upsert error:', error.message);
    return { error: 'Failed to save preferences.' };
  }

  revalidatePath('/preferences');
  return { success: true };
}
