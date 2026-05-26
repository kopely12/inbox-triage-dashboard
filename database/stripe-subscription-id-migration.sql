-- Add stripe_subscription_id to users so we can directly reference the
-- Stripe subscription without an extra API list call.
--
-- Run in: Supabase Dashboard → SQL Editor

alter table users
  add column if not exists stripe_subscription_id text;

comment on column users.stripe_subscription_id is
  'Stripe Subscription ID for the user''s active individual Pro subscription '
  '(e.g. sub_xxxxx). Populated by webhooks on checkout.session.completed; '
  'cleared on customer.subscription.deleted. Null for free-tier and team users.';
