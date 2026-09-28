-- Fase 2 chat: tipo de conversa (direct / group / community)
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS conversation_type TEXT NOT NULL DEFAULT 'direct';

ALTER TABLE public.chat_conversations
  DROP CONSTRAINT IF EXISTS chat_conversations_conversation_type_check;

ALTER TABLE public.chat_conversations
  ADD CONSTRAINT chat_conversations_conversation_type_check
  CHECK (conversation_type IN ('direct', 'group', 'community'));

UPDATE public.chat_conversations
SET conversation_type = 'group'
WHERE external_chat_id LIKE '%@g.us'
  AND conversation_type = 'direct';

CREATE INDEX IF NOT EXISTS idx_chat_conversations_conversation_type
  ON public.chat_conversations (instance_id, conversation_type);
