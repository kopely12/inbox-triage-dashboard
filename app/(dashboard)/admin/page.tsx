import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, UserCheck, Zap, CalendarPlus, Activity } from 'lucide-react';
import { AdminTabs } from '@/components/admin/admin-tabs';
import type { UserRow } from '@/components/admin/users-panel';
import type { OrgRow, OrgMemberInfo } from '@/components/admin/orgs-panel';

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) redirect('/account');

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const monthStart    = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  // Fetch all data in parallel
  const [{ data: users }, { data: triageSessions }, { data: orgs }, { data: orgMembers }] =
    await Promise.all([
      supabaseAdmin
        .from('users')
        .select('id, email, name, plan_tier, org_role, created_at, admin_notes, suspended_at, stripe_customer_id')
        .order('created_at', { ascending: false }),

      supabaseAdmin
        .from('triage_sessions')
        .select('user_id, triggered_at')
        .order('triggered_at', { ascending: false }),

      supabaseAdmin
        .from('organizations')
        .select('id, name, owner_id, created_at, billing_email, billing_provider, subscription_status, current_period_end, seat_count, stripe_customer_id, stripe_subscription_id, custom_notes')
        .order('created_at', { ascending: false }),

      supabaseAdmin
        .from('org_members')
        .select('id, org_id, user_id, role')
        .eq('status', 'active'),
    ]);

  // ── triage map ────────────────────────────────────────────────────────────
  const triageMap = new Map<string, { count: number; lastDate: string }>();
  for (const s of (triageSessions ?? [])) {
    const entry = triageMap.get(s.user_id);
    if (!entry) triageMap.set(s.user_id, { count: 1, lastDate: s.triggered_at });
    else entry.count++;
  }

  const allUsers = users ?? [];

  // ── stat tiles ────────────────────────────────────────────────────────────
  const totalUsers   = allUsers.length;
  const freeUsers    = allUsers.filter((u) => !u.plan_tier || u.plan_tier === 'free').length;
  const proUsers     = allUsers.filter((u) => u.plan_tier === 'pro' || u.plan_tier === 'team').length;
  const newThisMonth = allUsers.filter((u) => u.created_at >= monthStart).length;
  const activeUsers  = allUsers.filter((u) => {
    const t = triageMap.get(u.id);
    return t && t.lastDate >= thirtyDaysAgo;
  }).length;

  const tiles = [
    { label: 'Total users',      value: totalUsers,   icon: Users        },
    { label: 'Free plan',        value: freeUsers,    icon: UserCheck    },
    { label: 'Pro / Team',       value: proUsers,     icon: Zap          },
    { label: 'Active (30 days)', value: activeUsers,  icon: Activity     },
    { label: 'New this month',   value: newThisMonth, icon: CalendarPlus },
  ];

  // ── user rows ─────────────────────────────────────────────────────────────
  const userRows: UserRow[] = allUsers.map((u) => {
    const triage    = triageMap.get(u.id);
    const plan      = (u.plan_tier ?? 'free') as 'free' | 'pro' | 'team';
    const name      = u.name ?? u.email.split('@')[0];
    const initials  = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
    const isActive  = triage && triage.lastDate >= thirtyDaysAgo;
    const status: UserRow['status'] = isActive ? 'active' : triage ? 'inactive' : 'never';
    return { id: u.id, email: u.email, name, initials, plan, org_role: u.org_role, created_at: u.created_at, admin_notes: u.admin_notes ?? null, suspended_at: u.suspended_at ?? null, stripe_customer_id: u.stripe_customer_id ?? null, triage, status };
  });

  // ── org rows ──────────────────────────────────────────────────────────────
  const userById = new Map(allUsers.map((u) => [u.id, u]));

  const orgRows: OrgRow[] = (orgs ?? []).map((org) => {
    const members: OrgMemberInfo[] = (orgMembers ?? [])
      .filter((m) => m.org_id === org.id)
      .map((m) => {
        const u        = userById.get(m.user_id);
        const name     = u?.name ?? u?.email?.split('@')[0] ?? 'Unknown';
        const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
        return {
          memberId: m.id,
          userId:   m.user_id,
          email:    u?.email ?? '',
          name,
          initials,
          role:     m.role,
          isOwner:  m.role === 'owner' || m.user_id === org.owner_id,
        };
      });

    return {
      id:                   org.id,
      name:                 org.name,
      createdAt:            org.created_at,
      memberCount:          members.length,
      members,
      billingProvider:      org.billing_provider     ?? 'stripe',
      billingEmail:         org.billing_email        ?? null,
      subscriptionStatus:   org.subscription_status  ?? 'active',
      currentPeriodEnd:     org.current_period_end   ?? null,
      seatCount:            org.seat_count           ?? 5,
      stripeCustomerId:     org.stripe_customer_id   ?? null,
      stripeSubscriptionId: org.stripe_subscription_id ?? null,
      customNotes:          org.custom_notes         ?? null,
    };
  });

  return (
    <div className="max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Admin</h2>
          <p className="text-sm text-muted-foreground">
            {totalUsers} account{totalUsers !== 1 ? 's' : ''} · {(orgs ?? []).length} organization{(orgs ?? []).length !== 1 ? 's' : ''}
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">Super admin</Badge>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {tiles.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex flex-col gap-2">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground leading-tight">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs: Users / Organizations */}
      <AdminTabs userRows={userRows} orgRows={orgRows} />
    </div>
  );
}
