-- Admin enhancements
-- Run once in the Supabase SQL editor

alter table users
  add column if not exists admin_notes  text,
  add column if not exists suspended_at timestamptz;
