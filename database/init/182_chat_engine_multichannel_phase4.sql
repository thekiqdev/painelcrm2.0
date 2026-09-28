-- Chat Engine Fase 4: preparação multicanal (não destrutivo)
-- WhatsApp/Uazapi permanece default; colunas novas com default/backfill seguro.

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'whatsapp_uazapi';

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS provider_conversation_id TEXT;

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS communication_contact_id UUID REFERENCES public.communication_contacts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.chat_conversations.provider IS
  'Canal lógico (ex.: whatsapp_uazapi, instagram, webchat).';
COMMENT ON COLUMN public.chat_conversations.provider_conversation_id IS
  'ID estável da conversa no provedor; para WA costuma espelhar external_chat_id.';
COMMENT ON COLUMN public.chat_conversations.communication_contact_id IS
  'FK para communication_contacts (identidade multicanal).';

UPDATE public.chat_conversations
SET provider_conversation_id = external_chat_id
WHERE provider = 'whatsapp_uazapi'
  AND provider_conversation_id IS NULL
  AND external_chat_id IS NOT NULL
  AND btrim(external_chat_id) <> '';

CREATE INDEX IF NOT EXISTS idx_chat_conversations_tenant_provider
  ON public.chat_conversations(instance_id, provider);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_communication_contact
  ON public.chat_conversations(communication_contact_id)
  WHERE communication_contact_id IS NOT NULL;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'whatsapp_uazapi';

COMMENT ON COLUMN public.chat_messages.provider IS
  'Canal de origem da mensagem; provider_message_id reutiliza external_message_id.';

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_provider
  ON public.chat_messages(conversation_id, provider);

-- Identidade: username como chave alternativa (Instagram/Facebook futuros)
CREATE UNIQUE INDEX IF NOT EXISTS uq_communication_contacts_tenant_provider_username
  ON public.communication_contacts(tenant_id, provider, username)
  WHERE username IS NOT NULL AND btrim(username) <> '';
