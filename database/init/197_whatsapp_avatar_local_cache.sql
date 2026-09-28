-- Cache local de avatar WhatsApp (URLs pps.whatsapp.net são efémeras).
-- avatar_url / whatsapp_avatar_url continuam a ser a URL efetiva para a UI (preferir *_cached quando existir).

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS avatar_cached_url text,
  ADD COLUMN IF NOT EXISTS avatar_source_url text,
  ADD COLUMN IF NOT EXISTS avatar_cached_at timestamptz,
  ADD COLUMN IF NOT EXISTS avatar_cache_status text;

COMMENT ON COLUMN public.chat_conversations.avatar_cached_url IS
  'URL pública em catálogo (/api/public/catalog-media/raw) quando o avatar foi persistido em disco.';
COMMENT ON COLUMN public.chat_conversations.avatar_source_url IS
  'Última URL de origem WhatsApp/CDN usada para tentar cache.';
COMMENT ON COLUMN public.chat_conversations.avatar_cached_at IS
  'Momento em que o cache local foi gravado com sucesso.';
COMMENT ON COLUMN public.chat_conversations.avatar_cache_status IS
  'ok | fetch_failed | skipped | null';

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
