-- Chatbot Flows S28 — URL de amostra fixa (captura sem runtime).
ALTER TABLE public.chatbot_flows
  ADD COLUMN IF NOT EXISTS inbound_webhook_sample_token text;

ALTER TABLE public.chatbot_flows
  ADD COLUMN IF NOT EXISTS inbound_webhook_sample_payload jsonb;

ALTER TABLE public.chatbot_flows
  ADD COLUMN IF NOT EXISTS inbound_webhook_sample_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chatbot_flows_inbound_webhook_sample_token
  ON public.chatbot_flows (inbound_webhook_sample_token)
  WHERE inbound_webhook_sample_token IS NOT NULL;

COMMENT ON COLUMN public.chatbot_flows.inbound_webhook_sample_token IS
  'Token estável para POST /webhooks/chatbot-flows-sample/:token (só captura payload; não dispara runtime).';
COMMENT ON COLUMN public.chatbot_flows.inbound_webhook_sample_payload IS
  'Último JSON capturado pela URL de amostra (S28).';
COMMENT ON COLUMN public.chatbot_flows.inbound_webhook_sample_at IS
  'Quando o último sample foi capturado.';
