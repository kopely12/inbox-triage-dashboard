import { createClient } from '@supabase/supabase-js';

// Server-side admin client — never expose to browser.
// Fallback strings are only used during Next.js build-time module analysis;
// real requests at runtime will always have the actual env vars from Vercel.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export type UserRow = {
  id: string;
  email: string;
  google_id: string | null;
  name: string | null;
  avatar_url: string | null;
  plan_tier: 'free' | 'pro';
  org_role: 'owner' | 'admin' | 'member' | null;
  stripe_customer_id: string | null;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
