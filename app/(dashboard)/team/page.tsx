import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { getOrCreateOrg } from '@/lib/org';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MembersTable }  from '@/components/team/members-table';
import { InviteModal }   from '@/components/team/invite-modal';
import { BillingCard }   from '@/components/team/billing-card';
import { OrgNameForm }   from '@/components/settings/org-name-form';
import { Activity, Mail, Settings2, UserCheck, Users } from 'lucide-react';

export const metadata = { title: 'Team — Inbox Triage' };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default async function TeamPage() {
  const session   = await auth();
  const role      = session?.user?.orgRole;
  const planTier  = session?.user?.planTier;

  if (planTier !== 'team' || (role !== 'admin' && role !== 'owner')) redirect('/account');

  const orgId = await getOrCreateOrg(
    session!.user.id,
    session!.user.email ?? '',
    session!.user.orgRole,
  );

  let members:         any[] = [];
  let invites:         any[] = [];
  let orgName                = 'Your Team';
  let orgBilling:      any   = null;
  let activityInvites: any[] = [];

  if (orgId) {
    const [
      { data: membersData },
      { data: invitesData },
      { data: orgData },
      { data: activityData },
    ] = await Promise.all([
      supabaseAdmin
        .from('org_members')
        .select('id, user_id, role, joined_at, users(name, email, avatar_url)')
        .eq('org_id', orgId)
        .eq('status', 'active')
        .order('joined_at', { ascending: true }),

      supabaseAdmin
        .from('org_invites')
        .select('id, email, role, created_at, expires_at, token')
        .eq('org_id', orgId)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }),

      supabaseAdmin
        .from('organizations')
        .select('name, seat_count, billing_email, subscription_status, current_period_end, billing_provider, stripe_subscription_id')
        .eq('id', orgId)
        .single(),

      // Activity log: all invites (accepted + pending + expired), newest first
      supabaseAdmin
        .from('org_invites')
        .select('id, email, role, created_at, expires_at, accepted_at, inviter:users!invited_by(name, email)')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    members         = membersData  ?? [];
    invites         = invitesData  ?? [];
    orgName         = orgData?.name ?? 'Your Team';
    orgBilling      = orgData       ?? null;
    activityInvites = activityData  ?? [];
  }

  const baseUrl  = process.env.NEXTAUTH_URL ?? 'https://inbox-triage-dashboard.vercel.app';
  const isAdmin  = role === 'admin' || role === 'owner';
  const isOwner  = role === 'owner';

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{orgName}</h2>
          <p className="text-sm text-muted-foreground">
            {members.length} member{members.length !== 1 ? 's' : ''}
            {invites.length > 0
              ? ` · ${invites.length} pending invite${invites.length !== 1 ? 's' : ''}`
              : ''}
          </p>
        </div>
        {isAdmin && <InviteModal />}
      </div>

      {/* Members & invites */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            Members &amp; invites
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <MembersTable
            members={members}
            invites={invites}
            currentUserId={session!.user.id}
            isAdmin={isAdmin}
            viewerIsOwner={isOwner}
            baseUrl={baseUrl}
          />
        </CardContent>
      </Card>

      {/* Organization settings */}
      {isAdmin && orgId && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-muted-foreground" />
              Organization settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OrgNameForm currentName={orgName} />
          </CardContent>
        </Card>
      )}

      {/* Team subscription / billing */}
      {orgId && orgBilling && (
        <BillingCard
          orgId={orgId}
          seatCount={orgBilling.seat_count ?? 5}
          activeMemberCount={members.length}
          billingEmail={orgBilling.billing_email ?? null}
          subscriptionStatus={orgBilling.subscription_status ?? 'active'}
          currentPeriodEnd={orgBilling.current_period_end ?? null}
          billingProvider={orgBilling.billing_provider ?? 'stripe'}
          stripeSubscriptionId={orgBilling.stripe_subscription_id ?? null}
          isOwner={isOwner}
        />
      )}

      {/* Activity log */}
      {isAdmin && activityInvites.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              Recent activity
            </CardTitle>
            <CardDescription>
              Invites sent and membership changes for your organization.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {activityInvites.map((inv: any) => {
                const accepted   = !!inv.accepted_at;
                const expired    = !accepted && new Date(inv.expires_at) < new Date();
                const inviterName = inv.inviter?.name ?? inv.inviter?.email ?? null;

                return (
                  <div key={inv.id} className="flex items-start gap-3 px-6 py-3">
                    {/* Icon */}
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                      {accepted
                        ? <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                        : <Mail      className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>

                    {/* Description */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug">
                        <span className="font-medium">{inv.email}</span>
                        {accepted
                          ? ' accepted an invite'
                          : ' was invited'}
                        {' '}as <span className="capitalize">{inv.role}</span>
                        {inviterName && (
                          <> by <span className="font-medium">{inviterName}</span></>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {fmtDate(accepted ? inv.accepted_at : inv.created_at)}
                      </p>
                    </div>

                    {/* Status badge */}
                    {accepted ? (
                      <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 shrink-0">
                        Joined
                      </Badge>
                    ) : expired ? (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">
                        Expired
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        Pending
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
