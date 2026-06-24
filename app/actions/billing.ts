'use server';

import { auth } from '@/auth';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';

const BASE_URL = process.env.NEXTAUTH_URL ?? 'https://my.iinbox.io';

const PRICES = {
  pro_monthly:  process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
  pro_annual:   process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
  team_monthly: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID,
};

// ── Pro checkout ──────────────────────────────────────────────────────────────

export async function createProCheckoutUrl(
  priceKey: 'pro_monthly' | 'pro_annual',
): Promise<{ url: string } | { error: string }> {
  if (!stripe) return { error: 'Stripe not configured' };

  const session = await auth();
  if (!session?.user?.id) return { error: 'Not authenticated' };

  const userId = session.user.id;
  const email  = session.user.email!;

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single();

  let customerId = user?.stripe_customer_id as string | null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { userId },
    });
    customerId = customer.id;
    await supabaseAdmin
      .from('users')
      .update({ stripe_customer_id: customerId })
      .eq('id', userId);
  }

  const priceId = PRICES[priceKey];
  if (!priceId) return { error: 'Pricing not configured — contact support' };

  const checkout = await stripe.checkout.sessions.create({
    customer:    customerId,
    line_items:  [{ price: priceId, quantity: 1 }],
    mode:        'subscription',
    success_url: `${BASE_URL}/billing?upgraded=1`,
    cancel_url:  `${BASE_URL}/billing`,
    metadata:    { userId },
    subscription_data: { metadata: { userId } },
  });

  return { url: checkout.url! };
}

// ── Team checkout ─────────────────────────────────────────────────────────────

export async function createTeamCheckoutUrl(
  orgId:     string,
  seatCount: number,
): Promise<{ url: string } | { error: string }> {
  if (!stripe) return { error: 'Stripe not configured' };

  const session = await auth();
  if (!session?.user?.id)               return { error: 'Not authenticated' };
  if (session.user.orgRole !== 'owner') return { error: 'Only org owners can manage billing' };

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('stripe_customer_id, billing_email')
    .eq('id', orgId)
    .single();

  let customerId = org?.stripe_customer_id as string | null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email:    org?.billing_email ?? session.user.email!,
      metadata: { orgId },
    });
    customerId = customer.id;
    await supabaseAdmin
      .from('organizations')
      .update({ stripe_customer_id: customerId })
      .eq('id', orgId);
  }

  const teamPriceId = PRICES.team_monthly;
  if (!teamPriceId) return { error: 'Team pricing not configured — contact support' };

  const checkout = await stripe.checkout.sessions.create({
    customer:    customerId,
    line_items:  [{ price: teamPriceId, quantity: seatCount }],
    mode:        'subscription',
    success_url: `${BASE_URL}/team?upgraded=1`,
    cancel_url:  `${BASE_URL}/team`,
    metadata:    { orgId },
    subscription_data: { metadata: { orgId } },
  });

  return { url: checkout.url! };
}

// ── Customer portal ───────────────────────────────────────────────────────────

export async function createPortalUrl(
  scope: 'user' | 'org',
  orgId?: string,
): Promise<{ url: string } | { error: string }> {
  if (!stripe) return { error: 'Stripe not configured' };

  const session = await auth();
  if (!session?.user?.id) return { error: 'Not authenticated' };

  let customerId: string | null = null;

  if (scope === 'org' && orgId) {
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('stripe_customer_id')
      .eq('id', orgId)
      .single();
    customerId = org?.stripe_customer_id ?? null;
  } else {
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('stripe_customer_id')
      .eq('id', session.user.id)
      .single();
    customerId = user?.stripe_customer_id ?? null;
  }

  if (!customerId) return { error: 'No billing account found. Please subscribe first.' };

  const returnUrl = scope === 'org' ? `${BASE_URL}/team` : `${BASE_URL}/billing`;

  const portal = await stripe.billingPortal.sessions.create({
    customer:   customerId,
    return_url: returnUrl,
  });

  return { url: portal.url };
}
