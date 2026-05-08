-- Track when each user last visited the dashboard.
-- Updated after every authenticated page render via next/server after().
-- Used in the admin panel to distinguish truly inactive accounts from
-- accounts that just never triaged.
--
-- Run in: Supabase Dashboard → SQL Editor

alter table users
  add column if not exists last_seen_at timestamptz;

comment on column users.last_seen_at is
  'Timestamp of the user''s most recent authenticated dashboard page load. '
  'Updated non-blocking after each render of the dashboard layout. '
  'Null for users who signed up but have never loaded the dashboard.';
