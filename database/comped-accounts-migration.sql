-- Comped / trial accounts
-- When comped_until is set and plan_tier = 'pro', the user has free Pro access
-- until that date. A daily cron at /api/cron/expire-comps resets them to 'free'.
-- Paying Stripe subscribers always have stripe_customer_id set and are unaffected.
--
-- Run in: Supabase Dashboard → SQL Editor

alter table users
  add column if not exists comped_until timestamptz;

comment on column users.comped_until is
  'If set alongside plan_tier = ''pro'', this user has admin-granted free Pro access '
  'until this timestamp. The /api/cron/expire-comps endpoint resets expired comps '
  'to free daily. Null for regular free or paid subscribers.';
