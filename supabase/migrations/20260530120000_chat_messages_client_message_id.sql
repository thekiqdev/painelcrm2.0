-- Idempotência de envio: correlacionar mensagem outbound com UUID do cliente
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS client_message_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_conv_client_msg_unique
  ON public.chat_messages (conversation_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

COMMENT ON COLUMN public.chat_messages.client_message_id IS
  'UUID gerado no cliente para deduplicar envios e retries (único por conversa).';
