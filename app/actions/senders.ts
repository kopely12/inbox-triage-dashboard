'use server';

import { auth }          from '@/auth';
import { supabaseAdmin }  from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

// ── Sender rule helpers ───────────────────────────────────────────────────────
// Server actions used as form action= attributes must return void.
// Errors are logged server-side; UI refreshes via revalidatePath on success.

export async function pinSender(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;

  const senderEmail  = String(formData.get('sender_email') || '').trim().toLowerCase() || null;
  const senderDomain = String(formData.get('sender_domain') || '').trim().toLowerCase() || null;
  if (!senderEmail && !senderDomain) return;

  const { error } = await supabaseAdmin
    .from('sender_rules')
    .upsert({
      user_id:       session.user.id,
      sender_email:  senderEmail,
      sender_domain: senderDomain,
      rule_type:     'priority',
      rule_value:    'always',
      created_from:  'dashboard',
    }, {
      onConflict: 'user_id,sender_domain,sender_email,rule_type',
    });

  if (error) { console.error('[pinSender]', error.message); return; }
  revalidatePath('/senders');
  revalidatePath('/settings');
}

export async function suppressSender(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;

  const senderEmail  = String(formData.get('sender_email') || '').trim().toLowerCase() || null;
  const senderDomain = String(formData.get('sender_domain') || '').trim().toLowerCase() || null;
  if (!senderEmail && !senderDomain) return;

  const { error } = await supabaseAdmin
    .from('sender_rules')
    .upsert({
      user_id:       session.user.id,
      sender_email:  senderEmail,
      sender_domain: senderDomain,
      rule_type:     'priority',
      rule_value:    'never',
      created_from:  'dashboard',
    }, {
      onConflict: 'user_id,sender_domain,sender_email,rule_type',
    });

  if (error) { console.error('[suppressSender]', error.message); return; }
  revalidatePath('/senders');
  revalidatePath('/settings');
}

export async function clearSenderRule(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;

  const senderEmail  = String(formData.get('sender_email') || '').trim().toLowerCase() || null;
  const senderDomain = String(formData.get('sender_domain') || '').trim().toLowerCase() || null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabaseAdmin
    .from('sender_rules')
    .delete()
    .eq('user_id', session.user.id)
    .eq('rule_type', 'priority');

  if (senderEmail)  query = query.eq('sender_email',  senderEmail);
  if (senderDomain) query = query.eq('sender_domain', senderDomain);

  const { error } = await query;
  if (error) { console.error('[clearSenderRule]', error.message); return; }
  revalidatePath('/senders');
  revalidatePath('/settings');
}
