import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Users, UserCheck, Zap, CalendarPlus, Activity } from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function relativeDate(iso: string) {
  const diffMs  = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)  return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return formatDate(iso);
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function AdminPage() {
  // Super-admin gate — server-side only
  const session = await auth();
  if (!session?.user?.isSuperAdmin) redirect('/account');

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const monthStart    = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  // Fetch everything in parallel
  const [{ data: users }, { data: triageSessions }] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select('id, email, name, avatar_url, plan_tier, org_role, created_at, stripe_customer_id')
      .order('created_at', { ascending: false }),

    supabaseAdmin
      .from('triage_sessions')
      .select('user_id, triggered_at')
      .order('triggered_at', { ascending: false }),
  ]);

  // Build per-user triage stats (sessions already ordered DESC, so first hit = latest)
  const triageMap = new Map<string, { count: number; lastDate: string }>();
  for (const s of (triageSessions ?? [])) {
    const entry = triageMap.get(s.user_id);
    if (!entry) {
      triageMap.set(s.user_id, { count: 1, lastDate: s.triggered_at });
    } else {
      entry.count++;
    }
  }

  const allUsers = users ?? [];

  // ── overview stats ────────────────────────────────────────────────────────
  const totalUsers   = allUsers.length;
  const freeUsers    = allUsers.filter((u) => !u.plan_tier || u.plan_tier === 'free').length;
  const proUsers     = allUsers.filter((u) => u.plan_tier === 'pro').length;
  const newThisMonth = allUsers.filter((u) => u.created_at >= monthStart).length;
  const activeUsers  = allUsers.filter((u) => {
    const t = triageMap.get(u.id);
    return t && t.lastDate >= thirtyDaysAgo;
  }).length;

  const tiles = [
    { label: 'Total users',       value: totalUsers,   icon: Users,       color: '' },
    { label: 'Free plan',         value: freeUsers,    icon: UserCheck,   color: '' },
    { label: 'Pro / Team',        value: proUsers,     icon: Zap,         color: '' },
    { label: 'Active (30 days)',  value: activeUsers,  icon: Activity,    color: '' },
    { label: 'New this month',    value: newThisMonth, icon: CalendarPlus, color: '' },
  ];

  // ── per-user rows ─────────────────────────────────────────────────────────
  const rows = allUsers.map((u) => {
    const triage    = triageMap.get(u.id);
    const plan      = u.plan_tier ?? 'free';
    const name      = u.name ?? u.email.split('@')[0];
    const initials  = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
    const isActive  = triage && triage.lastDate >= thirtyDaysAgo;
    const hasTriaged = Boolean(triage);

    const status = isActive   ? 'active'
                 : hasTriaged ? 'inactive'
                 : 'never';

    return { ...u, name, initials, plan, triage, status };
  });

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Admin</h2>
          <p className="text-sm text-muted-foreground">
            User overview — {totalUsers} account{totalUsers !== 1 ? 's' : ''} total.
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

      {/* User table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5 w-64">User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last triage</TableHead>
              <TableHead className="text-right">Triages</TableHead>
              <TableHead className="pr-5">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-sm text-muted-foreground">
                  No users yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {/* User */}
                  <TableCell className="pl-5">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="w-7 h-7 shrink-0">
                        <AvatarFallback className="text-xs">{row.initials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{row.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{row.email}</p>
                      </div>
                    </div>
                  </TableCell>

                  {/* Plan */}
                  <TableCell>
                    <Badge
                      variant={row.plan === 'free' ? 'secondary' : 'default'}
                      className="capitalize text-xs"
                    >
                      {row.plan}
                    </Badge>
                  </TableCell>

                  {/* Role */}
                  <TableCell className="text-sm text-muted-foreground capitalize">
                    {row.org_role ?? 'member'}
                  </TableCell>

                  {/* Joined */}
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(row.created_at)}
                  </TableCell>

                  {/* Last triage */}
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {row.triage ? relativeDate(row.triage.lastDate) : '—'}
                  </TableCell>

                  {/* Triage count */}
                  <TableCell className="text-right text-sm font-medium pr-3">
                    {row.triage?.count ?? 0}
                  </TableCell>

                  {/* Status */}
                  <TableCell className="pr-5">
                    {row.status === 'active' ? (
                      <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300 bg-emerald-50">
                        Active
                      </Badge>
                    ) : row.status === 'inactive' ? (
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50">
                        Inactive
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Never triaged
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
