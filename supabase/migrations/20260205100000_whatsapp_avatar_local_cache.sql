-- Mirror of database/init/197_whatsapp_avatar_local_cache.sql

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS avatar_cached_url text,
  ADD COLUMN IF NOT EXISTS avatar_source_url text,
  ADD COLUMN IF NOT EXISTS avatar_cached_at timestamptz,
  ADD COLUMN IF NOT EXISTS avatar_cache_status text;

ALTER TABLE public.communication_contacts
  ADD COLUMN IF NOT EXISTS avatar_cached_url text,
  ADD COLUMN IF NOT EXISTS avatar_source_url text,
  ADD COLUMN IF NOT EXISTS avatar_cached_at timestamptz,
  ADD COLUMN IF NOT EXISTS avatar_cache_status text;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS whatsapp_avatar_cached_url text,
  ADD COLUMN IF NOT EXISTS whatsapp_avatar_source_url text,
  ADD COLUMN IF NOT EXISTS whatsapp_avatar_cached_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_avatar_cache_status text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS whatsapp_avatar_cached_url text,
  ADD COLUMN IF NOT EXISTS whatsapp_avatar_source_url text,
  ADD COLUMN IF NOT EXISTS whatsapp_avatar_cached_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_avatar_cache_status text;
