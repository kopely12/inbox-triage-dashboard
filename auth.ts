import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { supabaseAdmin } from '@/lib/supabase';

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Allow any verified host (Railway, Vercel, custom domains).
  // NEXTAUTH_URL / AUTH_URL still scopes allowed callback URLs.
  trustHost: true,

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== 'google' || !user.email) return false;

      // Upsert user into our existing users table.
      // Save google_refresh_token when present — returned on first auth or when
      // the user explicitly re-consents (e.g. via the Tune "Connect Gmail" flow).
      const upsertData: Record<string, unknown> = {
        email:      user.email,
        google_id:  account.providerAccountId,
        name:       user.name   ?? null,
        avatar_url: user.image  ?? null,
        updated_at: new Date().toISOString(),
      };
      if (account.refresh_token) upsertData.google_refresh_token = account.refresh_token;

      const { error } = await supabaseAdmin.from('users').upsert(
        upsertData,
        { onConflict: 'email', ignoreDuplicates: false }
      );

      if (error) {
        console.error('[auth] upsert error:', error.message);
        return false;
      }

      // Block suspended accounts
      const { data: dbUser } = await supabaseAdmin
        .from('users')
        .select('suspended_at')
        .eq('email', user.email)
        .single();

      if (dbUser?.suspended_at) return false;

      return true;
    },

    async jwt({ token, account, user, trigger, session }) {
      // ── Initial sign-in ───────────────────────────────────────────────────
      if (account && user?.email) {
        const { data } = await supabaseAdmin
          .from('users')
          .select('id, plan_tier, org_role')
          .eq('email', user.email)
          .single();

        if (data) {
          token.userId   = data.id;
          token.planTier = data.plan_tier;
          token.orgRole  = data.org_role;
        }

        token.isSuperAdmin  = user.email === process.env.SUPER_ADMIN_EMAIL;
        token.impersonating = null;
      }

      // ── Start impersonation ───────────────────────────────────────────────
      if (trigger === 'update' && (session as any)?.startImpersonation) {
        // Security gate: only real super admins can impersonate
        if (!token.isSuperAdmin) return token;

        const targetId = (session as any).startImpersonation as string;
        const { data: target } = await supabaseAdmin
          .from('users')
          .select('id, email, name, plan_tier, org_role')
          .eq('id', targetId)
          .single();

        // Refuse to impersonate non-existent users or other super admins
        if (!target || target.email === process.env.SUPER_ADMIN_EMAIL) return token;

        // Stash real admin credentials in the token
        token.realAdminId       = token.userId;
        token.realAdminPlanTier = token.planTier;
        token.realAdminOrgRole  = token.orgRole;
        token.realAdminName     = token.name;
        token.realAdminEmail    = token.email;

        // Override token with target user's data
        token.userId        = target.id;
        token.planTier      = target.plan_tier;
        token.orgRole       = target.org_role;
        token.name          = target.name;
        token.email         = target.email;
        token.isSuperAdmin  = false;
        token.impersonating = { id: target.id, name: target.name, email: target.email };
      }

      // ── Stop impersonation ────────────────────────────────────────────────
      if (trigger === 'update' && (session as any)?.stopImpersonation) {
        if (!token.realAdminId) return token;

        token.userId        = token.realAdminId;
        token.planTier      = token.realAdminPlanTier;
        token.orgRole       = token.realAdminOrgRole;
        token.name          = token.realAdminName  as string | null | undefined;
        token.email         = token.realAdminEmail as string | null | undefined;
        token.isSuperAdmin  = true;
        token.impersonating = null;

        delete token.realAdminId;
        delete token.realAdminPlanTier;
        delete token.realAdminOrgRole;
        delete token.realAdminName;
        delete token.realAdminEmail;
      }

      return token;
    },

    async session({ session, token }) {
      if (token.userId) {
        session.user.id           = token.userId       as string;
        session.user.planTier     = token.planTier     as string;
        session.user.orgRole      = token.orgRole      as string | null;
        session.user.isSuperAdmin = (token.isSuperAdmin as boolean) ?? false;
        session.user.impersonating =
          (token.impersonating as { id: string; name: string; email: string } | null) ?? null;
      }
      return session;
    },
  },

  pages: {
    signIn: '/login',
    error:  '/login',
  },
});

// ─── NextAuth type augmentation ───────────────────────────────────────────────

declare module 'next-auth' {
  interface Session {
    user: {
      id:            string;
      name?:         string | null;
      email?:        string | null;
      image?:        string | null;
      planTier:      string;
      orgRole:       string | null;
      isSuperAdmin:  boolean;
      impersonating: { id: string; name: string; email: string } | null;
    };
  }
}
