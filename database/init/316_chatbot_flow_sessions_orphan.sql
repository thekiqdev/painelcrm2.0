-- Chatbot Flows S28.1 — sessão webhook sem conversation_id (órfã até ensure_conversation).
ALTER TABLE public.chatbot_flow_sessions
  ALTER COLUMN conversation_id DROP NOT NULL;

DROP INDEX IF EXISTS uq_chatbot_flow_sessions_live_conversation;
CREATE UNIQUE INDEX IF NOT EXISTS uq_chatbot_flow_sessions_live_conversation
  ON public.chatbot_flow_sessions(conversation_id)
  WHERE conversation_id IS NOT NULL
    AND status IN ('active', 'waiting_input', 'waiting_delay', 'waiting_http');

COMMENT ON COLUMN public.chatbot_flow_sessions.conversation_id IS
  'Conversa WhatsApp amarrada à sessão. NULL = sessão órfã (webhook sem conversation_id) até ensure_conversation (S28.1/S29).';
