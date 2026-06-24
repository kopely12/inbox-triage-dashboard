import { auth }          from '@/auth';
import { supabaseAdmin }  from '@/lib/supabase';
import { redirect }       from 'next/navigation';
import { stripe }         from '@/lib/stripe';
import { ExtensionPrefsForm, type BillingData } from '@/components/settings/extension-prefs-form';
import { PREFS_DEFAULTS, type ExtensionPrefs }  from '@/lib/extension-prefs';
import { getAnalysisSchedule } from '@/app/actions/engagement';

export const metadata = { title: 'Settings — Inbox Triage' };

export default async function PreferencesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId   = session.user.id;
  const planTier = (session.user.planTier ?? 'free') as 'free' | 'pro' | 'team';

  const [{ data: prefsRow }, { data: user }, { data: dqSettings }, { schedule: analysisSchedule }] =
    await Promise.all([
      supabaseAdmin
        .from('user_preferences')
        .select('prefs, kb_bindings')
        .eq('user_id', userId)
        .maybeSingle(),
      supabaseAdmin
        .from('users')
        .select('timezone, name, email, created_at, stripe_customer_id, stripe_price_id')
        .eq('id', userId)
        .maybeSingle(),
      supabaseAdmin
        .from('draft_queue_settings')
        .select('enabled')
        .eq('user_id', userId)
        .maybeSingle(),
      getAnalysisSchedule(),
    ]);

  const extensionPrefs: ExtensionPrefs = { ...PREFS_DEFAULTS, ...(prefsRow?.prefs ?? {}) };
  const kbBindings: Record<string, string> = (prefsRow?.kb_bindings as Record<string, string>) ?? {};
  const draftQueueEnabled = dqSettings?.enabled ?? true;
  const timezone   = user?.timezone ?? 'America/New_York';
  const gmailEmail = user?.email    ?? session.user.email ?? '';
  const gmailName  = user?.name     ?? session.user.name  ?? null;

  // ── Billing data ─────────────────────────────────────────────────────────────
  const stripeCustomerId = user?.stripe_customer_id ?? null;
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : '—';

  const PRICE_LABELS: Record<string, string> = {};
  if (process.env.STRIPE_PRO_MONTHLY_PRICE_ID)
    PRICE_LABELS[process.env.STRIPE_PRO_MONTHLY_PRICE_ID] = '$12 / month';
  if (process.env.STRIPE_PRO_ANNUAL_PRICE_ID)
    PRICE_LABELS[process.env.STRIPE_PRO_ANNUAL_PRICE_ID]  = '$99 / year';
  const billingLabel = user?.stripe_price_id
    ? (PRICE_LABELS[user.stripe_price_id] ?? 'Custom plan')
    : null;

  type InvoiceRow = BillingData['invoices'][number];
  let invoices:            InvoiceRow[] = [];
  let nextBillingDate:     string | null = null;
  let paymentMethodLabel:  string | null = null;
  let subscriptionStatus:  string | null = null;
  let stripeError = false;

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
        nextBillingDate    = new Date(sub.current_period_end * 1000).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        });
        subscriptionStatus = sub.status as string;
      }

      const customer = customerResult as any;
      if (customer && !customer.deleted) {
        const pm = customer.invoice_settings?.default_payment_method;
        if (pm && typeof pm === 'object' && pm.type === 'card') {
          const brand = (pm.card?.brand ?? '') as string;
          const last4 = (pm.card?.last4 ?? '') as string;
          paymentMethodLabel = `${brand.charAt(0).toUpperCase() + brand.slice(1)} ···· ${last4}`;
        }
      }
    } catch (err) {
      console.error('Failed to fetch Stripe billing data:', err);
      stripeError = true;
    }
  }

  const billing: BillingData = {
    planTier, stripeCustomerId, memberSince, invoices,
    nextBillingDate, paymentMethodLabel, subscriptionStatus,
    stripeError, billingLabel,
  };

  return (
    <div className="max-w-2xl">
      <ExtensionPrefsForm
        initialPrefs={extensionPrefs}
        initialKbBindings={kbBindings}
        initialDraftQueueEnabled={draftQueueEnabled}
        initialTimezone={timezone}
        gmailEmail={gmailEmail}
        gmailName={gmailName}
        initialAnalysis={analysisSchedule}
        billing={billing}
      />
    </div>
  );
}
