'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { auth }          from '@/auth';
import { revalidatePath } from 'next/cache';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AlertType = 'engagement_decay' | 'volume_spike' | 'post_unsubscribe';

export type InboxAlert = {
  id:           string;
  alert_type:   AlertType;
  sender_email: string;
  sender_name:  string | null;
  metadata:     Record<string, unknown>;
  dismissed:    boolean;
  created_at:   string;
  updated_at:   string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) return { userId: null as string | null, error: 'Not authenticated' };
  return { userId: session.user.id, error: null as string | null };
}

// ── Actions ───────────────────────────────────────────────────────────────────

export async function getProtectionAlerts(): Promise<{ alerts: InboxAlert[]; error?: string }> {
  const { userId, error } = await requireUser();
  if (error) return { alerts: [], error };

  const { data, error: dbErr } = await supabaseAdmin
    .from('inbox_alerts')
    .select('*')
    .eq('user_id', userId!)
    .eq('dismissed', false)
    .order('created_at', { ascending: false });

  if (dbErr) return { alerts: [], error: dbErr.message };
  return { alerts: (data ?? []) as InboxAlert[] };
}

export async function dismissProtectionAlert(alertId: string): Promise<{ error?: string }> {
  const { userId, error } = await requireUser();
  if (error) return { error };

  const { error: dbErr } = await supabaseAdmin
    .from('inbox_alerts')
    .update({ dismissed: true, updated_at: new Date().toISOString() })
    .eq('id', alertId)
    .eq('user_id', userId!);

  if (dbErr) return { error: dbErr.message };
  revalidatePath('/');
  return {};
}

const API_URL     = process.env.BACKEND_API_URL     || 'http://localhost:3000';
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

export async function actionProtectionAlert(alertId: string): Promise<{ action?: string; error?: string }> {
  const { userId, error } = await requireUser();
  if (error) return { error };

  try {
    const res = await fetch(`${API_URL}/api/protection/alerts/${alertId}/action`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-key': SERVICE_KEY,
      },
      body: JSON.stringify({ user_id: userId }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error };
    revalidatePath('/');
    return { action: data.action };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Request failed' };
  }
}
