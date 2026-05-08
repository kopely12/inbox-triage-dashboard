-- Organization billing enhancements
-- Run once in the Supabase SQL editor

alter table organizations
  add column if not exists billing_email           text,
  add column if not exists billing_provider        text        not null default 'stripe',
  add column if not exists stripe_customer_id      text,
  add column if not exists stripe_subscription_id  text,
  add column if not exists subscription_status     text        not null default 'active',
  add column if not exists current_period_end      timestamptz,
  add column if not exists seat_count              integer     not null default 5,
  add column if not exists custom_notes            text;

-- billing_provider: 'stripe' | 'manual'
-- subscription_status: 'active' | 'trialing' | 'past_due' | 'canceled'
