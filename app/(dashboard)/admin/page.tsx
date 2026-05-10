import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, UserCheck, Zap, CalendarPlus, Activity, Building2 } from 'lucide-react';
import { AdminTabs }            from '@/components/admin/admin-tabs';
import { AnnouncementManager }  from '@/components/admin/announcement-manager';
import type { UserRow }           from '@/components/admin/users-panel';
import type { OrgRow, OrgMemberInfo } from '@/components/admin/orgs-panel';
import type { InviteRow }         from '@/components/admin/invites-panel';
import { getAnnouncement }        from '@/lib/get-announcement';

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) redirect('/account');

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const monthStart    = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  // Announcement (shared cache with layout — no extra DB round-trip in practice)
  const announcementRow = await getAnnouncement();
  const currentAnnouncement = announcementRow?.value ?? null;

  // Fetch all data in parallel
  const [
    { data: users, error: usersError },
    { data: triageSessions },
    { data: orgs },
    { data: orgMembers },
    { data: rawInvites },
  ] =
    await Promise.all([
      supabaseAdmin
        .from('users')
        .select('id, email, name, plan_tier, org_role, created_at, admin_notes, suspended_at, stripe_customer_id, last_seen_at, comped_until')
        .order('created_at', { ascending: false }),

      supabaseAdmin
        .from('triage_sessions')
        .select('user_id, triggered_at')
        .order('triggered_at', { ascending: false }),

      supabaseAdmin
        .from('organizations')
        .select('id, name, owner_id, created_at, billing_email, billing_provider, billing_cycle, subscription_status, current_period_end, seat_count, billing_amount, stripe_customer_id, stripe_subscription_id, custom_notes')
        .order('created_at', { ascending: false }),

      supabaseAdmin
        .from('org_members')
        .select('id, org_id, user_id, role')
        .eq('status', 'active'),

      // Pending + expired invites (not yet accepted)
      supabaseAdmin
        .from('org_invites')
        .select('id, org_id, email, role, created_at, expires_at, invited_by')
        .is('accepted_at', null)
        .order('created_at', { ascending: false }),
    ]);

  // Surface DB errors clearly instead of silently showing empty tables.
  // Most common cause: a migration hasn't been run yet and a new column is missing.
  if (usersError) {
    return (
      <div className="max-w-2xl space-y-3">
        <h2 className="text-lg font-semibold">Admin</h2>
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 space-y-1">
          <p className="font-medium">Failed to load users — database error</p>
          <p className="font-mono text-xs opacity-80">{usersError.message}</p>
          <p className="text-xs opacity-70 pt-1">
            If this mentions an unknown column, a pending migration may not have been run.
            Check the <code>database/</code> folder for SQL files to run in Supabase.
          </p>
        </div>
      </div>
    );
  }

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
  const proOnlyUsers = allUsers.filter((u) => u.plan_tier === 'pro').length;
  const teamUsers    = allUsers.filter((u) => u.plan_tier === 'team').length;
  const teamCount    = (orgs ?? []).length;
  const newThisMonth = allUsers.filter((u) => u.created_at >= monthStart).length;
  const activeUsers  = allUsers.filter((u) => {
    const t = triageMap.get(u.id);
    return t && t.lastDate >= thirtyDaysAgo;
  }).length;

  const tiles: { label: string; value: number; sublabel?: string; icon: React.ElementType }[] = [
    { label: 'Total users',      value: totalUsers,   icon: Users        },
    { label: 'Free',             value: freeUsers,    icon: UserCheck    },
    { label: 'Pro',              value: proOnlyUsers, icon: Zap          },
    { label: 'Teams',            value: teamCount,    icon: Building2,   sublabel: `${teamUsers} user${teamUsers !== 1 ? 's' : ''}` },
    { label: 'Active (30 days)', value: activeUsers,  icon: Activity     },
    { label: 'New this month',   value: newThisMonth, icon: CalendarPlus },
  ];

  // ── org name lookup (used in user rows) ──────────────────────────────────
  const orgNameByUserId = new Map<string, string>();
  for (const member of (orgMembers ?? [])) {
    const orgName = (orgs ?? []).find((o) => o.id === member.org_id)?.name;
    if (orgName) orgNameByUserId.set(member.user_id, orgName);
  }

  // ── user rows ─────────────────────────────────────────────────────────────
  const userRows: UserRow[] = allUsers.map((u) => {
    const triage    = triageMap.get(u.id);
    const plan      = (u.plan_tier ?? 'free') as 'free' | 'pro' | 'team';
    const name      = u.name ?? u.email.split('@')[0];
    const initials  = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
    const isActive  = triage && triage.lastDate >= thirtyDaysAgo;
    const status: UserRow['status'] = isActive ? 'active' : triage ? 'inactive' : 'never';
    return {
      id: u.id, email: u.email, name, initials, plan, org_role: u.org_role,
      created_at: u.created_at, admin_notes: u.admin_notes ?? null,
      suspended_at: u.suspended_at ?? null, stripe_customer_id: u.stripe_customer_id ?? null,
      last_seen_at: u.last_seen_at ?? null, comped_until: u.comped_until ?? null,
      orgName: orgNameByUserId.get(u.id) ?? null,
      triage, status,
    };
  });

  // ── invite rows ───────────────────────────────────────────────────────────
  const orgById     = new Map((orgs ?? []).map((o) => [o.id, o]));
  const userEmailById = new Map(allUsers.map((u) => [u.id, u.email]));
  const now         = new Date().toISOString();

  const inviteRows: InviteRow[] = (rawInvites ?? []).map((inv) => ({
    id:             inv.id,
    orgId:          inv.org_id,
    orgName:        orgById.get(inv.org_id)?.name ?? '(unknown org)',
    email:          inv.email,
    role:           inv.role ?? 'member',
    invitedByEmail: userEmailById.get(inv.invited_by) ?? '(unknown)',
    createdAt:      inv.created_at,
    expiresAt:      inv.expires_at,
    isExpired:      inv.expires_at < now,
  }));

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
      billingCycle:         org.billing_cycle        ?? 'monthly',
      billingEmail:         org.billing_email        ?? null,
      subscriptionStatus:   org.subscription_status  ?? 'active',
      currentPeriodEnd:     org.current_period_end   ?? null,
      seatCount:            org.seat_count           ?? 5,
      billingAmount:        org.billing_amount       ?? null,
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

      {/* Announcement manager */}
      <AnnouncementManager current={currentAnnouncement} />

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map(({ label, value, sublabel, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex flex-col gap-2">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold leading-none">{value}</p>
                  {sublabel && (
                    <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-tight">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs: Users / Organizations / Invites */}
      <AdminTabs userRows={userRows} orgRows={orgRows} inviteRows={inviteRows} />
    </div>
  );
}
