import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';
import type Stripe from 'stripe';

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const body = await req.text();
  const sig  = req.headers.get('stripe-signature');

  if (!sig) return NextResponse.json({ error: 'No signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case 'customer.deleted':
        await handleCustomerDeleted(event.data.object as Stripe.Customer);
        break;
    }
  } catch (err) {
    console.error(`Error handling ${event.type}:`, err);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ── handlers ──────────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== 'subscription' || !session.subscription) return;

  const subscriptionId    = session.subscription as string;
  const customerId        = session.customer as string;
  const { userId, orgId } = session.metadata ?? {};

  const sub       = await stripe!.subscriptions.retrieve(subscriptionId);
  const status    = sub.status;
  const item      = sub.items.data[0];
  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000).toISOString()
    : null;
  const quantity  = item?.quantity ?? 1;
  const priceId   = item?.price?.id ?? null;

  if (userId) {
    // Individual Pro subscription — save subscription ID so we can reference it
    // directly without a Stripe list call (e.g. for cancellation, status checks).
    await supabaseAdmin
      .from('users')
      .update({
        plan_tier:               'pro',
        stripe_customer_id:      customerId,
        stripe_subscription_id:  subscriptionId,
        stripe_price_id:         priceId,
      })
      .eq('id', userId);
  }

  if (orgId) {
    // Team / org subscription
    await supabaseAdmin
      .from('organizations')
      .update({
        stripe_customer_id:     customerId,
        stripe_subscription_id: subscriptionId,
        subscription_status:    status,
        current_period_end:     periodEnd,
        seat_count:             quantity,
      })
      .eq('id', orgId);

    // Upgrade all active org members to the team plan
    const { data: members } = await supabaseAdmin
      .from('org_members')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('status', 'active');

    if (members?.length) {
      await supabaseAdmin
        .from('users')
        .update({ plan_tier: 'team' })
        .in('id', members.map((m) => m.user_id));
    }
  }
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const { userId, orgId } = sub.metadata ?? {};
  const status    = sub.status;
  const item      = sub.items.data[0];
  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000).toISOString()
    : null;
  const quantity  = item?.quantity ?? 1;
  const priceId   = item?.price?.id ?? null;

  if (userId) {
    // Sync plan tier and active price with subscription status.
    // Keeping stripe_price_id up to date here means it automatically
    // reflects mid-cycle price changes (e.g. from a Subscription Schedule).
    const planTier = (status === 'active' || status === 'trialing') ? 'pro' : 'free';
    await supabaseAdmin
      .from('users')
      .update({ plan_tier: planTier, stripe_price_id: priceId })
      .eq('id', userId);
  }

  if (orgId) {
    await supabaseAdmin
      .from('organizations')
      .update({
        subscription_status: status,
        current_period_end:  periodEnd,
        seat_count:          quantity,
      })
      .eq('id', orgId);
  }
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const { userId, orgId } = sub.metadata ?? {};

  if (userId) {
    // Clear the subscription ID along with plan downgrade.
    // stripe_customer_id is intentionally preserved — the Stripe customer
    // record still exists and is needed if the user re-subscribes later.
    await supabaseAdmin
      .from('users')
      .update({ plan_tier: 'free', stripe_price_id: null, stripe_subscription_id: null })
      .eq('id', userId);
  }

  if (orgId) {
    await supabaseAdmin
      .from('organizations')
      .update({ subscription_status: 'canceled' })
      .eq('id', orgId);

    // Downgrade all active org members back to free
    const { data: members } = await supabaseAdmin
      .from('org_members')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('status', 'active');

    if (members?.length) {
      await supabaseAdmin
        .from('users')
        .update({ plan_tier: 'free' })
        .in('id', members.map((m) => m.user_id));
    }
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  // In the dahlia API, subscription moved to invoice.parent.subscription_details.subscription
  const subRef = (invoice as any).parent?.subscription_details?.subscription
    ?? (invoice as any).subscription; // fallback for older API versions
  if (!subRef) return;

  const subscriptionId = typeof subRef === 'string' ? subRef : subRef.id;

  // Retrieve the subscription to get metadata
  const sub = await stripe!.subscriptions.retrieve(subscriptionId);
  const { userId, orgId } = sub.metadata ?? {};

  if (orgId) {
    await supabaseAdmin
      .from('organizations')
      .update({ subscription_status: 'past_due' })
      .eq('id', orgId);
  }

  if (userId) {
    // Belt-and-suspenders: customer.subscription.updated fires with status='past_due'
    // and our handler there sets plan_tier='free', but webhook delivery is best-effort.
    // Handling it here ensures individual users are downgraded even if that event
    // is delayed, deduplicated, or missed entirely.
    await supabaseAdmin
      .from('users')
      .update({ plan_tier: 'free' })
      .eq('id', userId);
  }
}

// ── customer.deleted ──────────────────────────────────────────────────────────
// Fired when a Stripe Customer object is deleted (e.g. via the API or dashboard).
// The subscription.deleted event handles plan downgrade; this clears the stale
// customer ID so a new Stripe customer is created on the next checkout.

async function handleCustomerDeleted(customer: Stripe.Customer) {
  const customerId = customer.id;

  // Clear from individual users
  await supabaseAdmin
    .from('users')
    .update({ stripe_customer_id: null, stripe_subscription_id: null })
    .eq('stripe_customer_id', customerId);

  // Clear from organizations
  await supabaseAdmin
    .from('organizations')
    .update({ stripe_customer_id: null, stripe_subscription_id: null })
    .eq('stripe_customer_id', customerId);
}
