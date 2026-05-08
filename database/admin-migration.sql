-- Admin enhancements: notes column on users
-- Run once in the Supabase SQL editor

alter table users
  add column if not exists admin_notes text;
