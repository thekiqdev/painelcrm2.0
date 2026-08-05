-- Chatbot Flows — webhook de entrada: índice rápido do token publicado.
ALTER TABLE public.chatbot_flows
  ADD COLUMN IF NOT EXISTS inbound_webhook_token text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chatbot_flows_inbound_webhook_token
  ON public.chatbot_flows (inbound_webhook_token)
  WHERE inbound_webhook_token IS NOT NULL;

COMMENT ON COLUMN public.chatbot_flows.inbound_webhook_token IS
  'Token do nó webhook_in na versão publicada (lookup POST /webhooks/chatbot-flows/:token).';
