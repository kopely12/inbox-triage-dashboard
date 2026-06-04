'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { auth }          from '@/auth';
import { revalidatePath } from 'next/cache';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BundledSender = {
  sender_email:  string;
  sender_name:   string | null;
  sender_domain: string | null;
  added_at:      string;
};

export type SuggestedSender = {
  sender_email:     string;
  sender_name:      string | null;
  sender_domain:    string | null;
  emails_per_month: number;
  category:         string;
};

export type BundleSettings = {
  enabled:           boolean;
  delivery_hour:     number;
  timezone:          string;
  last_digest_at:    string | null;
  bundled_senders:   BundledSender[];
  suggested_senders: SuggestedSender[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) return { userId: null as string | null, error: 'Not authenticated' };
  return { userId: session.user.id, error: null as string | null };
}

const API_URL     = process.env.BACKEND_API_URL      || 'http://localhost:3000';
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

async function backendPost(path: string, userId: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-service-key': SERVICE_KEY },
    body:    JSON.stringify({ user_id: userId, ...body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Backend error ${res.status}`);
  return data;
}

async function backendDelete(path: string, userId: string) {
  const res = await fetch(`${API_URL}${path}?user_id=${userId}`, {
    method:  'DELETE',
    headers: { 'x-service-key': SERVICE_KEY },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Backend error ${res.status}`);
  return data;
}

// ── Read: fetch settings directly from Supabase ───────────────────────────────

export async function getBundleSettings(): Promise<{ settings?: BundleSettings; error?: string }> {
  const { userId, error } = await requireUser();
  if (error || !userId) return { error: error ?? 'Not authenticated' };

  const [{ data: user }, { data: bundled }, { data: suggested }] = await Promise.all([
    supabaseAdmin.from('users').select('preferences, timezone').eq('id', userId).single(),

    supabaseAdmin
      .from('bundled_senders')
      .select('sender_email, sender_name, sender_domain, added_at')
      .eq('user_id', userId)
      .order('added_at', { ascending: false }),

    supabaseAdmin
      .from('sender_engagement')
      .select('sender_email, sender_name, sender_domain, emails_received, engagement_rate, period_days, category')
      .eq('user_id', userId)
      .in('category', ['never_engage', 'rarely_engage'])
      .eq('has_unsubscribe_header', true)
      .not('unsubscribe_status', 'eq', 'unsubscribed')
      .gte('emails_received', 3)
      .order('emails_received', { ascending: false })
      .limit(50),
  ]);

  const userData     = user as { preferences?: Record<string, Record<string, unknown>>; timezone?: string } | null;
  const prefs        = userData?.preferences?.engagement ?? {};
  const timezone     = userData?.timezone || 'America/New_York';
  const bundledEmails = new Set((bundled ?? []).map((r) => r.sender_email));

  const suggestedFiltered: SuggestedSender[] = (suggested ?? [])
    .filter((r) => !bundledEmails.has(r.sender_email))
    .map((r) => ({
      sender_email:     r.sender_email,
      sender_name:      r.sender_name,
      sender_domain:    r.sender_domain,
      emails_per_month: Math.round((r.emails_received / ((r.period_days as number) || 90)) * 30),
      category:         r.category,
    }));

  return {
    settings: {
      enabled:           (prefs.bundle_enabled       as boolean) ?? false,
      delivery_hour:     (prefs.bundle_delivery_hour as number)  ?? 9,
      timezone,
      last_digest_at:    (prefs.bundle_last_digest_at as string) ?? null,
      bundled_senders:   (bundled ?? []) as BundledSender[],
      suggested_senders: suggestedFiltered,
    },
  };
}

// ── Enable / disable ──────────────────────────────────────────────────────────

export async function enableBundle(
  deliveryHour: number,
  senderEmails: string[],
): Promise<{ error?: string }> {
  const { userId, error } = await requireUser();
  if (error || !userId) return { error: error ?? 'Not authenticated' };

  try {
    await backendPost('/api/bundle/enable', userId, {
      delivery_hour:  deliveryHour,
      sender_emails:  senderEmails,
    });
    revalidatePath('/preferences');
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Request failed' };
  }
}

export async function disableBundle(): Promise<{ error?: string }> {
  const { userId, error } = await requireUser();
  if (error || !userId) return { error: error ?? 'Not authenticated' };

  try {
    await backendPost('/api/bundle/disable', userId);
    revalidatePath('/preferences');
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Request failed' };
  }
}

// ── Manage senders ────────────────────────────────────────────────────────────

export async function addSendersToBundle(senderEmails: string[]): Promise<{ added?: number; error?: string }> {
  const { userId, error } = await requireUser();
  if (error || !userId) return { error: error ?? 'Not authenticated' };

  try {
    const data = await backendPost('/api/bundle/senders', userId, { sender_emails: senderEmails });
    revalidatePath('/preferences');
    return { added: data.added };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Request failed' };
  }
}

export async function removeSenderFromBundle(senderEmail: string): Promise<{ error?: string }> {
  const { userId, error } = await requireUser();
  if (error || !userId) return { error: error ?? 'Not authenticated' };

  try {
    await backendDelete(`/api/bundle/senders/${encodeURIComponent(senderEmail)}`, userId);
    revalidatePath('/preferences');
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Request failed' };
  }
}

// ── Delivery hour ─────────────────────────────────────────────────────────────

export async function updateBundleDeliveryHour(hour: number): Promise<{ error?: string }> {
  const { userId, error } = await requireUser();
  if (error || !userId) return { error: error ?? 'Not authenticated' };

  try {
    const res = await fetch(`${API_URL}/api/bundle/delivery-hour`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-service-key': SERVICE_KEY },
      body:    JSON.stringify({ user_id: userId, delivery_hour: hour }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error };
    revalidatePath('/preferences');
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Request failed' };
  }
}

// ── Live bundle contents ──────────────────────────────────────────────────────

export type BundleContents = {
  enabled:        boolean;
  paused:         boolean;
  emailCount:     number;
  deliveryHour:   number;
  timezone:       string;
  lastDigestAt:   string | null;
  lastDigestCount: number | null;
  senders: { name: string; email: string; count: number; latestSubject: string }[];
};

export async function getBundleContents(): Promise<{ contents?: BundleContents; error?: string }> {
  const { userId, error } = await requireUser();
  if (error || !userId) return { error: error ?? 'Not authenticated' };

  try {
    const res = await fetch(`${API_URL}/api/bundle/contents?user_id=${userId}`, {
      headers: { 'x-service-key': SERVICE_KEY },
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error };
    return { contents: data as BundleContents };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Request failed' };
  }
}

export async function releaseBundleNow(senderEmail?: string): Promise<{ released?: number; error?: string }> {
  const { userId, error } = await requireUser();
  if (error || !userId) return { error: error ?? 'Not authenticated' };

  try {
    const body: Record<string, unknown> = {};
    if (senderEmail) body.sender_email = senderEmail;
    const data = await backendPost('/api/bundle/release', userId, body);
    revalidatePath('/sender-intelligence');
    return { released: data.released };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Request failed' };
  }
}

export async function setBundlePaused(paused: boolean): Promise<{ error?: string }> {
  const { userId, error } = await requireUser();
  if (error || !userId) return { error: error ?? 'Not authenticated' };

  try {
    await backendPost('/api/bundle/pause', userId, { paused });
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to update bundle' };
  }
}

// ── Send digest now ───────────────────────────────────────────────────────────

export async function sendDigestNow(): Promise<{ sent?: boolean; emailCount?: number; senderCount?: number; reason?: string; error?: string }> {
  const { userId, error } = await requireUser();
  if (error || !userId) return { error: error ?? 'Not authenticated' };

  try {
    const data = await backendPost('/api/bundle/digest/send', userId);
    return { sent: data.success, emailCount: data.emailCount, senderCount: data.senderCount, reason: data.reason };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Request failed' };
  }
}
