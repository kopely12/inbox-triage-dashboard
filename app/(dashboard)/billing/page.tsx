import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { PricingTable } from '@/components/billing/pricing-table';
import { CreditCard, Receipt, ExternalLink } from 'lucide-react';
import Link from 'next/link';

function fmtAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style:    'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function fmtDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function InvoiceStatusBadge({ status }: { status: string | null }) {
  const styles: Record<string, string> = {
    paid:      'text-emerald-600 border-emerald-300 bg-emerald-50',
    open:      'text-amber-600  border-amber-300  bg-amber-50',
    void:      'text-muted-foreground',
    uncollectible: 'text-red-600 border-red-300 bg-red-50',
  };
  const label = status ?? 'unknown';
  return (
    <Badge variant="outline" className={`text-[10px] capitalize ${styles[label] ?? ''}`}>
      {label}
    </Badge>
  );
}

export default async function BillingPage() {
  const session  = await auth();
  const userId   = session!.user.id;
  const planTier = (session!.user.planTier ?? 'free') as 'free' | 'pro' | 'team';

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('created_at, stripe_customer_id, stripe_price_id')
    .eq('id', userId)
    .single();

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : '—';

  const stripeCustomerId = user?.stripe_customer_id ?? null;

  // ── Fetch invoices from Stripe ─────────────────────────────────────────────
  type InvoiceRow = {
    id:          string;
    date:        number;
    description: string;
    amount:      number;
    currency:    string;
    status:      string | null;
    pdfUrl:      string | null;
    hostedUrl:   string | null;
  };

  let invoices: InvoiceRow[] = [];

  if (stripeCustomerId && stripe) {
    try {
      const result = await stripe.invoices.list({ customer: stripeCustomerId, limit: 12 });
      invoices = result.data.map((inv) => ({
        id:          inv.id,
        date:        inv.created,
        description: inv.description ?? (inv.lines?.data?.[0]?.description ?? 'Subscription'),
        amount:      inv.amount_paid,
        currency:    inv.currency,
        status:      inv.status,
        pdfUrl:      (inv as any).invoice_pdf   ?? null,
        hostedUrl:   (inv as any).hosted_invoice_url ?? null,
      }));
    } catch (err) {
      console.error('Failed to fetch Stripe invoices:', err);
    }
  }

  // Plan display helpers
  const PLAN_LABELS: Record<string, string> = { free: 'Free', pro: 'Pro', team: 'Team' };

  // Maps Stripe Price IDs → human-readable billing cadence.
  // When you create a new price, add an entry here with the new price_id.
  // Existing subscribers keep their old entry — that's how grandfathering works.
  const PRICE_LABELS: Record<string, string> = {
    [process.env.STRIPE_PRO_MONTHLY_PRICE_ID!]: '$12 / month',
    [process.env.STRIPE_PRO_ANNUAL_PRICE_ID!]:  '$99 / year',
    // e.g. when you raise prices: [process.env.STRIPE_PRO_MONTHLY_V2_PRICE_ID!]: '$15 / month',
  };

  const billingLabel = user?.stripe_price_id
    ? (PRICE_LABELS[user.stripe_price_id] ?? 'Custom plan')
    : null;

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
              ? `You're on the free plan. Upgrade below to unlock unlimited triages and more.`
              : planTier === 'team'
                ? `Your access is covered by your team plan.`
                : `You have full access to all Pro features.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Plan</dt>
              <dd className="mt-0.5 font-medium">{PLAN_LABELS[planTier] ?? planTier}</dd>
            </div>
            {billingLabel && (
              <div>
                <dt className="text-xs text-muted-foreground">Billing</dt>
                <dd className="mt-0.5 font-medium">{billingLabel}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted-foreground">Member since</dt>
              <dd className="mt-0.5 font-medium">{memberSince}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Invoices</dt>
              <dd className="mt-0.5 font-medium">
                {invoices.length > 0 ? `${invoices.length} on file` : '—'}
              </dd>
            </div>
          </dl>
          {planTier === 'team' && (
            <p className="mt-4 text-xs text-muted-foreground border-t border-border pt-3">
              Team billing is managed on the{' '}
              <Link href="/team" className="underline underline-offset-2 hover:text-foreground">
                Team page
              </Link>.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Pricing table — hide for team plan members (managed by org) */}
      {planTier !== 'team' && (
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Choose a plan</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upgrade or downgrade at any time.
            </p>
          </div>
          <PricingTable
            currentPlan={planTier}
            stripeCustomerId={stripeCustomerId}
          />
        </section>
      )}

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
              {invoices.length > 0 ? (
                invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="pl-6 text-sm whitespace-nowrap">
                      {fmtDate(inv.date)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {inv.description}
                    </TableCell>
                    <TableCell className="text-sm font-medium whitespace-nowrap">
                      {fmtAmount(inv.amount, inv.currency)}
                    </TableCell>
                    <TableCell>
                      <InvoiceStatusBadge status={inv.status} />
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      {(inv.pdfUrl || inv.hostedUrl) ? (
                        <a
                          href={inv.pdfUrl ?? inv.hostedUrl ?? ''}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          View
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
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
