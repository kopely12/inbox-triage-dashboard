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

  const subscriptionId     = session.subscription as string;
  const customerId         = session.customer as string;
  const { userId, orgId }  = session.metadata ?? {};

  const sub       = await stripe!.subscriptions.retrieve(subscriptionId);
  const status    = sub.status;
  const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
  const quantity  = sub.items.data[0]?.quantity ?? 1;

  if (userId) {
    // Individual Pro subscription
    await supabaseAdmin
      .from('users')
      .update({ plan_tier: 'pro', stripe_customer_id: customerId })
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
  const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
  const quantity  = sub.items.data[0]?.quantity ?? 1;

  if (userId) {
    // Sync plan tier with subscription status
    const planTier = (status === 'active' || status === 'trialing') ? 'pro' : 'free';
    await supabaseAdmin
      .from('users')
      .update({ plan_tier: planTier })
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
    await supabaseAdmin
      .from('users')
      .update({ plan_tier: 'free' })
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
  if (!invoice.subscription) return;

  // Retrieve the subscription to get metadata
  const sub = await stripe!.subscriptions.retrieve(invoice.subscription as string);
  const { orgId } = sub.metadata ?? {};

  if (orgId) {
    await supabaseAdmin
      .from('organizations')
      .update({ subscription_status: 'past_due' })
      .eq('id', orgId);
  }
  // For individual Pro users, customer.subscription.updated fires with
  // status = 'past_due' automatically — no extra handling needed here.
}
