-- Fix: user_preferences FK was pointing at auth.users (Supabase internal auth table).
-- The dashboard uses NextAuth, which only writes to public.users — so new users who
-- had never been through Supabase Auth would hit a FK violation on first prefs save.
--
-- Run this once in the Supabase SQL Editor.

ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_user_id_fkey,
  ADD CONSTRAINT user_preferences_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
