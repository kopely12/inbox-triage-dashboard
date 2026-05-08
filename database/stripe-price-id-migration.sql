-- Add stripe_price_id to users so we know exactly which Stripe Price
-- each subscriber is on. This enables grandfathering: when you create
-- a new Price for a plan, existing users keep their old price_id and
-- new subscribers get the new one.
--
-- Run in: Supabase Dashboard → SQL Editor

alter table users
  add column if not exists stripe_price_id text;

comment on column users.stripe_price_id is
  'Stripe Price ID the user is currently subscribed to (e.g. price_xxxxx). '
  'Populated by webhooks on checkout.session.completed and '
  'customer.subscription.updated. Null for free-tier users.';
