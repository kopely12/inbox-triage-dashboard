-- site_settings: generic key/value store for app-wide configuration.
-- Starting use-case: the global announcement banner shown to all dashboard users.
--
-- Run in: Supabase Dashboard → SQL Editor

create table if not exists site_settings (
  key        text primary key,
  value      jsonb        not null default '{}',
  updated_at timestamptz  not null default now()
);

comment on table site_settings is
  'App-wide configuration store. Each row is a named setting. '
  'Current keys: "announcement" → { active, message, type }.';

-- Seed an inactive announcement so the row exists from the start
insert into site_settings (key, value)
values (
  'announcement',
  '{"active": false, "message": "", "type": "info"}'
)
on conflict (key) do nothing;
