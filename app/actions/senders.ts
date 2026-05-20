'use server';

import { auth }          from '@/auth';
import { supabaseAdmin }  from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export async function pinSender(email: string): Promise<{ error: string | null }> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthenticated' };

  const senderEmail = email.trim().toLowerCase();
  if (!senderEmail) return { error: 'No email provided' };

  const { error } = await supabaseAdmin
    .from('sender_rules')
    .upsert({
      user_id:       session.user.id,
      sender_email:  senderEmail,
      sender_domain: null,
      rule_type:     'priority',
      rule_value:    'always',
      created_from:  'dashboard',
    }, {
      onConflict: 'user_id,sender_domain,sender_email,rule_type',
    });

  if (error) return { error: error.message };
  revalidatePath('/senders');
  return { error: null };
}

export async function suppressSender(email: string): Promise<{ error: string | null }> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthenticated' };

  const senderEmail = email.trim().toLowerCase();
  if (!senderEmail) return { error: 'No email provided' };

  const { error } = await supabaseAdmin
    .from('sender_rules')
    .upsert({
      user_id:       session.user.id,
      sender_email:  senderEmail,
      sender_domain: null,
      rule_type:     'priority',
      rule_value:    'never',
      created_from:  'dashboard',
    }, {
      onConflict: 'user_id,sender_domain,sender_email,rule_type',
    });

  if (error) return { error: error.message };
  revalidatePath('/senders');
  return { error: null };
}

export async function clearSenderRule(email: string): Promise<{ error: string | null }> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthenticated' };

  const senderEmail = email.trim().toLowerCase();

  const { error } = await supabaseAdmin
    .from('sender_rules')
    .delete()
    .eq('user_id',      session.user.id)
    .eq('rule_type',    'priority')
    .eq('sender_email', senderEmail);

  if (error) return { error: error.message };
  revalidatePath('/senders');
  return { error: null };
}
