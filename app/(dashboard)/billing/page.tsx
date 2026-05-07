import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { PricingTable } from '@/components/billing/pricing-table';
import { CreditCard, Receipt } from 'lucide-react';

export default async function BillingPage() {
  const session  = await auth();
  const userId   = session!.user.id;
  const planTier = (session!.user.planTier ?? 'free') as 'free' | 'pro' | 'team';

  // Fetch user for joined date + usage context
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('created_at, stripe_customer_id')
    .eq('id', userId)
    .single();

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : '—';

  const hasStripe = Boolean(user?.stripe_customer_id);

  // Plan display labels
  const PLAN_LABELS: Record<string, string> = {
    free: 'Free',
    pro:  'Pro',
    team: 'Team',
  };

  const NEXT_PLAN: Record<string, string> = {
    free: 'Pro — $12 / month',
    pro:  'Team — $39 / month',
    team: '',
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Billing</h2>
        <p className="text-sm text-muted-foreground">Manage your plan and payment history.</p>
      </div>

      {/* Current plan summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              Current plan
            </CardTitle>
            <Badge
              variant={planTier === 'free' ? 'secondary' : 'default'}
              className="capitalize"
            >
              {PLAN_LABELS[planTier] ?? planTier}
            </Badge>
          </div>
          <CardDescription>
            {planTier === 'free'
              ? `You're on the free plan. Upgrade to unlock unlimited triages and more.`
              : `You have full access to all ${PLAN_LABELS[planTier]} features.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Plan</dt>
              <dd className="mt-0.5 font-medium">{PLAN_LABELS[planTier] ?? planTier}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Member since</dt>
              <dd className="mt-0.5 font-medium">{memberSince}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Billing</dt>
              <dd className="mt-0.5 font-medium">
                {planTier === 'free' ? 'Free' : hasStripe ? 'Monthly' : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Next renewal</dt>
              <dd className="mt-0.5 font-medium">
                {planTier === 'free' ? '—' : hasStripe ? 'Via Stripe portal' : '—'}
              </dd>
            </div>
          </dl>
          {planTier !== 'team' && NEXT_PLAN[planTier] && (
            <p className="mt-4 text-xs text-muted-foreground border-t border-border pt-3">
              Next tier: <span className="font-medium text-foreground">{NEXT_PLAN[planTier]}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Pricing table */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Choose a plan</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Upgrade or downgrade at any time. Billing is not yet active — you'll be notified when it launches.
          </p>
        </div>
        <PricingTable currentPlan={planTier} />
      </section>

      {/* Billing history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Receipt className="w-4 h-4 text-muted-foreground" />
            Billing history
          </CardTitle>
          <CardDescription>
            Invoices and receipts for your subscription payments.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6 text-right">Invoice</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hasStripe ? (
                /* Stripe invoices will be fetched and rendered here */
                <TableRow>
                  <TableCell colSpan={5} className="pl-6 py-8 text-center text-sm text-muted-foreground">
                    Loading invoices…
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="pl-6 py-10 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Receipt className="w-8 h-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">No invoices yet.</p>
                      <p className="text-xs text-muted-foreground">
                        Your billing history will appear here once you have an active subscription.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
