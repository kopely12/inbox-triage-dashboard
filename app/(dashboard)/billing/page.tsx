import { auth }          from '@/auth';
import { redirect }      from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { stripe }        from '@/lib/stripe';
import { cn }            from '@/lib/utils';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Badge }   from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { PricingTable }       from '@/components/billing/pricing-table';
import { ManageBillingButton } from '@/components/billing/manage-billing-button';
import {
  AlertTriangle, CheckCircle2, Clock, CreditCard,
  ExternalLink, Receipt, Users, XCircle,
} from 'lucide-react';
import Link from 'next/link';

export const metadata = { title: 'Billing — Inbox Triage' };

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function fmtDateUnix(unix: number) {
  return new Date(unix * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function InvoiceStatusBadge({ status }: { status: string | null }) {
  const styles: Record<string, string> = {
    paid:          'text-emerald-600 border-emerald-300 bg-emerald-50',
    open:          'text-amber-600 border-amber-300 bg-amber-50',
    void:          'text-muted-foreground',
    uncollectible: 'text-red-600 border-red-300 bg-red-50',
  };
  const label = status ?? 'unknown';
  return (
    <Badge variant="outline" className={`text-[10px] capitalize ${styles[label] ?? ''}`}>
      {label}
    </Badge>
  );
}

function SubscriptionStatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
    active:   { icon: <CheckCircle2 className="w-3 h-3" />, cls: 'text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800', label: 'Active'    },
    trialing: { icon: <Clock        className="w-3 h-3" />, cls: 'text-blue-600    border-blue-200    bg-blue-50    dark:bg-blue-950/30    dark:border-blue-800',    label: 'Trial'     },
    past_due: { icon: <AlertTriangle className="w-3 h-3" />, cls: 'text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800',          label: 'Past due'  },
    canceled: { icon: <XCircle      className="w-3 h-3" />, cls: 'text-red-600    border-red-200    bg-red-50    dark:bg-red-950/30    dark:border-red-800',          label: 'Canceled'  },
  };
  const cfg = map[status] ?? { icon: null, cls: 'text-muted-foreground', label: status };
  return (
    <Badge variant="outline" className={cn('text-[10px] flex items-center gap-1 capitalize', cfg.cls)}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId   = session.user.id;
  const planTier = (session.user.planTier ?? 'free') as 'free' | 'pro' | 'team';

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

  // ── Stripe data ──────────────────────────────────────────────────────────────

  type InvoiceRow = {
    id: string; date: number; description: string;
    amount: number; currency: string; status: string | null;
    pdfUrl: string | null; hostedUrl: string | null;
  };

  let invoices:            InvoiceRow[] = [];
  let nextBillingDate:     string | null = null;
  let paymentMethodLabel:  string | null = null;
  let subscriptionStatus:  string | null = null;

  if (stripeCustomerId && stripe) {
    try {
      const [invoiceResult, subsResult, customerResult] = await Promise.all([
        stripe.invoices.list({ customer: stripeCustomerId, limit: 12 }),
        planTier !== 'free'
          ? stripe.subscriptions.list({ customer: stripeCustomerId, status: 'active', limit: 1 })
          : Promise.resolve(null),
        planTier !== 'free'
          ? stripe.customers.retrieve(stripeCustomerId, {
              expand: ['invoice_settings.default_payment_method'],
            })
          : Promise.resolve(null),
      ]);

      invoices = invoiceResult.data.map((inv) => ({
        id:          inv.id,
        date:        inv.created,
        description: inv.description ?? (inv.lines?.data?.[0]?.description ?? 'Subscription'),
        amount:      inv.amount_paid,
        currency:    inv.currency,
        status:      inv.status,
        pdfUrl:      (inv as any).invoice_pdf        ?? null,
        hostedUrl:   (inv as any).hosted_invoice_url ?? null,
      }));

      const sub = subsResult?.data?.[0] as any;
      if (sub) {
        nextBillingDate    = fmtDateUnix(sub.current_period_end as number);
        subscriptionStatus = sub.status as string;
      }

      const customer = customerResult as any;
      if (customer && !customer.deleted) {
        const pm = customer.invoice_settings?.default_payment_method;
        if (pm && typeof pm === 'object' && pm.type === 'card') {
          const brand      = (pm.card?.brand ?? '') as string;
          const last4      = (pm.card?.last4 ?? '') as string;
          const brandLabel = brand.charAt(0).toUpperCase() + brand.slice(1);
          paymentMethodLabel = `${brandLabel} ···· ${last4}`;
        }
      }
    } catch (err) {
      console.error('Failed to fetch Stripe billing data:', err);
    }
  }

  // ── Display helpers ──────────────────────────────────────────────────────────

  const PLAN_LABELS: Record<string, string> = { free: 'Free', pro: 'Pro', team: 'Team' };

  // Maps Stripe Price IDs → human-readable billing cadence.
  const PRICE_LABELS: Record<string, string> = {
    [process.env.STRIPE_PRO_MONTHLY_PRICE_ID!]: '$12 / month',
    [process.env.STRIPE_PRO_ANNUAL_PRICE_ID!]:  '$99 / year',
  };

  const billingLabel  = user?.stripe_price_id ? (PRICE_LABELS[user.stripe_price_id] ?? 'Custom plan') : null;
  const isPaidPlan    = planTier !== 'free';
  const isTeamMember  = planTier === 'team';
  const isPastDue     = subscriptionStatus === 'past_due';
  const isCanceled    = subscriptionStatus === 'canceled';

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Billing</h2>
        <p className="text-sm text-muted-foreground">Manage your plan and payment history.</p>
      </div>

      {/* ── Current plan card ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            {/* Plan name + status badges */}
            <div className="space-y-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                Current plan
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant={planTier === 'free' ? 'secondary' : 'default'}
                  className="capitalize"
                >
                  {PLAN_LABELS[planTier] ?? planTier}
                </Badge>
                {subscriptionStatus && (
                  <SubscriptionStatusBadge status={subscriptionStatus} />
                )}
              </div>
            </div>

            {/* Manage billing — opens Stripe portal (cancel, update card, etc.) */}
            {isPaidPlan && stripeCustomerId && !isTeamMember && (
              <ManageBillingButton />
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Past-due alert */}
          {isPastDue && (
            <div className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Payment past due
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Your last payment failed. Update your payment method to keep Pro access — use{' '}
                  <span className="font-semibold">Manage billing</span> above.
                </p>
              </div>
            </div>
          )}

          {/* Canceled alert */}
          {isCanceled && (
            <div className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3">
              <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  Subscription canceled
                </p>
                <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                  {nextBillingDate
                    ? `Your access continues until ${nextBillingDate}, then reverts to the free plan.`
                    : 'Your access will revert to the free plan at the end of your current period.'}
                </p>
              </div>
            </div>
          )}

          {/* Plan detail grid */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            {billingLabel && (
              <div>
                <dt className="text-xs text-muted-foreground">Price</dt>
                <dd className="mt-0.5 font-medium">{billingLabel}</dd>
              </div>
            )}
            {nextBillingDate && !isCanceled && (
              <div>
                <dt className="text-xs text-muted-foreground">
                  {isPastDue ? 'Payment due' : 'Next billing'}
                </dt>
                <dd className={cn('mt-0.5 font-medium', isPastDue && 'text-amber-600')}>
                  {nextBillingDate}
                </dd>
              </div>
            )}
            {paymentMethodLabel && (
              <div>
                <dt className="text-xs text-muted-foreground">Payment method</dt>
                <dd className="mt-0.5 font-medium">{paymentMethodLabel}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted-foreground">Member since</dt>
              <dd className="mt-0.5 font-medium">{memberSince}</dd>
            </div>
            {invoices.length > 0 && (
              <div>
                <dt className="text-xs text-muted-foreground">Invoices</dt>
                <dd className="mt-0.5 font-medium">
                  <a href="#billing-history" className="hover:underline">
                    {invoices.length} on file
                  </a>
                </dd>
              </div>
            )}
          </dl>

          {/* Free-plan prompt */}
          {planTier === 'free' && (
            <p className="text-xs text-muted-foreground">
              You&apos;re on the free plan. Upgrade below to unlock unlimited triages and all Pro features.
            </p>
          )}

          {/* Team-member note */}
          {isTeamMember && (
            <p className="text-xs text-muted-foreground border-t border-border pt-4">
              Team billing is managed on the{' '}
              <Link href="/team" className="underline underline-offset-2 hover:text-foreground">
                Team page
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Change plan ─────────────────────────────────────────────────────────── */}
      {!isTeamMember ? (
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Change plan</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upgrade, downgrade, or switch billing cycles at any time.
              {isPaidPlan && stripeCustomerId && (
                <> To cancel, open <span className="font-medium">Manage billing</span> above — it takes you directly to your Stripe portal.</>
              )}
            </p>
          </div>
          <PricingTable currentPlan={planTier} stripeCustomerId={stripeCustomerId} />
        </section>
      ) : (
        /* Team members: explain why the pricing table is absent */
        <Card className="border-dashed bg-muted/30">
          <CardContent className="flex items-start gap-3 py-5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <Users className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Access managed by your organization</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your plan and seat are controlled by your team&apos;s admin.
                Individual plan changes aren&apos;t available while you&apos;re part of a team.
              </p>
              <Link
                href="/team"
                className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 hover:text-foreground transition-colors"
              >
                View team billing
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Billing history ──────────────────────────────────────────────────────── */}
      <Card id="billing-history" className="scroll-mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Receipt className="w-4 h-4 text-muted-foreground" />
            Billing history
          </CardTitle>
          <CardDescription>Invoices and receipts for your subscription payments.</CardDescription>
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
                invoices.map((inv, i) => (
                  <TableRow key={inv.id} className={i % 2 !== 0 ? 'bg-muted/30' : ''}>
                    <TableCell className="pl-6 py-3.5 text-sm whitespace-nowrap">
                      {fmtDateUnix(inv.date)}
                    </TableCell>
                    <TableCell className="py-3.5 text-sm text-muted-foreground max-w-[240px] truncate">
                      {inv.description}
                    </TableCell>
                    <TableCell className="py-3.5 text-sm font-medium whitespace-nowrap">
                      {fmtAmount(inv.amount, inv.currency)}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <InvoiceStatusBadge status={inv.status} />
                    </TableCell>
                    <TableCell className="pr-6 py-3.5 text-right">
                      {(inv.pdfUrl || inv.hostedUrl) ? (
                        <div className="flex items-center justify-end gap-2">
                          {inv.pdfUrl && (
                            <a
                              href={inv.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              PDF
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          {inv.hostedUrl && (
                            <a
                              href={inv.hostedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              View
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Receipt className="w-8 h-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">No invoices yet.</p>
                      <p className="text-xs text-muted-foreground">
                        Your billing history will appear here once you subscribe.
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
