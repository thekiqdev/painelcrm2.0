-- Migração incremental: adicionar campos de atribuição/filas em chat_conversations
-- e criar tabela de eventos de conversa para histórico de transferências/etc.

-- 1) Novos campos em chat_conversations

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS queue TEXT;

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMPTZ;

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS last_assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Índices auxiliares para filtros por responsável / status / fila

CREATE INDEX IF NOT EXISTS idx_chat_conversations_assigned_to
  ON public.chat_conversations(assigned_to);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_status
  ON public.chat_conversations(status);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_queue
  ON public.chat_conversations(queue);


-- 2) Tabela de eventos de conversa (histórico de atribuições/transferências/etc.)

CREATE TABLE IF NOT EXISTS public.chat_conversation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  from_user_id UUID,
  to_user_id UUID,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversation_events_conversation
  ON public.chat_conversation_events(conversation_id);

CREATE INDEX IF NOT EXISTS idx_chat_conversation_events_type
  ON public.chat_conversation_events(type);


