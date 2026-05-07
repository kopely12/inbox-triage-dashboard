'use server';

import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export async function updateName(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthenticated');

  const name = (formData.get('name') as string)?.trim();
  if (!name || name.length < 1 || name.length > 100) {
    return { error: 'Name must be between 1 and 100 characters.' };
  }

  const { error } = await supabaseAdmin
    .from('users')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', session.user.id);

  if (error) return { error: 'Failed to update name. Please try again.' };

  revalidatePath('/account');
  return { success: true };
}
