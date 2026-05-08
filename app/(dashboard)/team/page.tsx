import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { getOrCreateOrg } from '@/lib/org';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MembersTable } from '@/components/team/members-table';
import { InviteModal }  from '@/components/team/invite-modal';
import { BillingCard }  from '@/components/team/billing-card';
import { Users } from 'lucide-react';

export default async function TeamPage() {
  const session = await auth();
  const role = session?.user?.orgRole;

  if (role !== 'admin' && role !== 'owner') redirect('/account');

  const orgId = await getOrCreateOrg(
    session!.user.id,
    session!.user.email ?? '',
    session!.user.orgRole,
  );

  let members:   any[]   = [];
  let invites:   any[]   = [];
  let orgName            = 'Your Team';
  let orgBilling: any    = null;

  if (orgId) {
    const [{ data: membersData }, { data: invitesData }, { data: orgData }] = await Promise.all([
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
    ]);

    members    = membersData ?? [];
    invites    = invitesData  ?? [];
    orgName    = orgData?.name ?? 'Your Team';
    orgBilling = orgData ?? null;
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://inbox-triage-dashboard.vercel.app';
  const isAdmin = role === 'admin' || role === 'owner';
  const isOwner = role === 'owner';

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

      {/* Members card */}
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
            baseUrl={baseUrl}
          />
        </CardContent>
      </Card>

      {/* Billing card — visible to all org members, editable by owner */}
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
    </div>
  );
}
