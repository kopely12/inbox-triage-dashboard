import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-side admin client — never expose to browser
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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
