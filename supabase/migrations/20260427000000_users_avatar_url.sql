-- Sync with database/init/158_users_avatar_url.sql

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
