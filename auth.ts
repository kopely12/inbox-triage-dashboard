import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { supabaseAdmin } from '@/lib/supabase';

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Vercel auto-sets VERCEL_URL; fall back to NEXTAUTH_URL for local dev
  ...(process.env.NEXTAUTH_URL && { trustHost: true }),

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== 'google' || !user.email) return false;

      // Upsert user into our existing users table
      const { error } = await supabaseAdmin.from('users').upsert(
        {
          email:      user.email,
          google_id:  account.providerAccountId,
          name:       user.name   ?? null,
          avatar_url: user.image  ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'email', ignoreDuplicates: false }
      );

      if (error) {
        console.error('[auth] upsert error:', error.message);
        return false;
      }
      return true;
    },

    async jwt({ token, account, user }) {
      // On initial sign-in, fetch our user record and embed id + role in token
      if (account && user?.email) {
        const { data } = await supabaseAdmin
          .from('users')
          .select('id, plan_tier, org_role')
          .eq('email', user.email)
          .single();

        if (data) {
          token.userId    = data.id;
          token.planTier  = data.plan_tier;
          token.orgRole   = data.org_role;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (token.userId) {
        session.user.id       = token.userId as string;
        session.user.planTier = token.planTier as string;
        session.user.orgRole  = token.orgRole  as string | null;
      }
      return session;
    },
  },

  pages: {
    signIn: '/login',
    error:  '/login',
  },
});

// Augment NextAuth types
declare module 'next-auth' {
  interface Session {
    user: {
      id:        string;
      name?:     string | null;
      email?:    string | null;
      image?:    string | null;
      planTier:  string;
      orgRole:   string | null;
    };
  }
}
