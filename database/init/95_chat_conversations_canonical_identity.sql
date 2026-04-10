-- Identidade canônica UazAPI: separar provider id (external_chat_id) de JID para histórico e UI.

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS canonical_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS canonical_phone TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS identity_source TEXT,
  ADD COLUMN IF NOT EXISTS identity_strength TEXT,
  ADD COLUMN IF NOT EXISTS identity_state TEXT,
  ADD COLUMN IF NOT EXISTS history_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS last_history_sync_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_history_sync_at TIMESTAMPTZ;

COMMENT ON COLUMN public.chat_conversations.external_chat_id IS 'Provider raw wa_chatid (pode ser @lid); chave única com instance_id';
COMMENT ON COLUMN public.chat_conversations.canonical_chat_id IS 'JID para POST /message/find e histórico (ex.: …@s.whatsapp.net); NULL se não resolvido';
COMMENT ON COLUMN public.chat_conversations.canonical_phone IS 'MSISDN normalizado (só dígitos) quando conhecido';
COMMENT ON COLUMN public.chat_conversations.display_name IS 'Título seguro para UI (nunca @lid como nome principal)';
COMMENT ON COLUMN public.chat_conversations.avatar_url IS 'Foto de perfil conhecida; não sobrescrever com vazio';
COMMENT ON COLUMN public.chat_conversations.identity_state IS 'resolved | unresolved';
COMMENT ON COLUMN public.chat_conversations.history_sync_status IS 'ready | blocked_unresolved | synced | failed';

CREATE INDEX IF NOT EXISTS idx_chat_conversations_canonical_ready
  ON public.chat_conversations (instance_id, identity_state, history_sync_status)
  WHERE identity_state = 'resolved' AND history_sync_status = 'ready';

-- MSISDN a partir de phone ou JID PN
UPDATE public.chat_conversations
SET
  canonical_phone = CASE
    WHEN phone_number IS NOT NULL AND length(regexp_replace(phone_number, '\D', '', 'g')) >= 10
      THEN regexp_replace(phone_number, '\D', '', 'g')
    WHEN external_chat_id ~ '^[0-9]+@s\.whatsapp\.net$'
      THEN split_part(lower(external_chat_id), '@', 1)
    ELSE canonical_phone
  END
WHERE canonical_phone IS NULL;

-- JID canônico para histórico
UPDATE public.chat_conversations
SET
  canonical_chat_id = CASE
    WHEN external_chat_id LIKE '%@g.us' THEN external_chat_id
    WHEN external_chat_id LIKE '%@s.whatsapp.net' OR external_chat_id LIKE '%@c.us' THEN external_chat_id
    WHEN canonical_phone IS NOT NULL
      AND length(canonical_phone) BETWEEN 10 AND 15
      THEN canonical_phone || '@s.whatsapp.net'
    ELSE canonical_chat_id
  END
WHERE canonical_chat_id IS NULL;

UPDATE public.chat_conversations
SET
  identity_state = CASE
    WHEN canonical_chat_id IS NOT NULL THEN 'resolved'
    ELSE 'unresolved'
  END,
  identity_strength = CASE
    WHEN canonical_chat_id IS NOT NULL THEN COALESCE(identity_strength, 'medium')
    ELSE COALESCE(identity_strength, 'weak')
  END,
  identity_source = COALESCE(identity_source, 'legacy_backfill'),
  history_sync_status = CASE
    WHEN canonical_chat_id IS NOT NULL THEN COALESCE(history_sync_status, 'ready')
    ELSE COALESCE(history_sync_status, 'blocked_unresolved')
  END,
  last_history_sync_reason = CASE
    WHEN canonical_chat_id IS NULL AND last_history_sync_reason IS NULL
      THEN 'legacy_unresolved_no_canonical_jid'
    ELSE last_history_sync_reason
  END;

UPDATE public.chat_conversations
SET display_name = NULLIF(trim(contact_name), '')
WHERE (display_name IS NULL OR trim(display_name) = '') AND contact_name IS NOT NULL;

UPDATE public.chat_conversations
SET
  avatar_url = COALESCE(avatar_url, NULLIF(trim(metadata->>'whatsapp_profile_photo'), ''))
WHERE (avatar_url IS NULL OR trim(avatar_url) = '') AND metadata IS NOT NULL;

UPDATE public.chat_conversations SET identity_state = 'unresolved' WHERE identity_state IS NULL;
UPDATE public.chat_conversations SET history_sync_status = 'blocked_unresolved' WHERE history_sync_status IS NULL;

ALTER TABLE public.chat_conversations
  ALTER COLUMN identity_state SET DEFAULT 'unresolved',
  ALTER COLUMN history_sync_status SET DEFAULT 'blocked_unresolved';

ALTER TABLE public.chat_conversations
  ALTER COLUMN identity_state SET NOT NULL,
  ALTER COLUMN history_sync_status SET NOT NULL;
