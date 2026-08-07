-- Chatbot Flows S29.1 — idempotência opcional do ensure_conversation (ex.: order.id).
CREATE TABLE IF NOT EXISTS public.chatbot_flow_ensure_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.chatbot_flows(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chatbot_flow_ensure_idempotency_key_len
    CHECK (char_length(idempotency_key) >= 1 AND char_length(idempotency_key) <= 256)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chatbot_flow_ensure_idempotency_tenant_flow_key
  ON public.chatbot_flow_ensure_idempotency (tenant_id, flow_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_chatbot_flow_ensure_idempotency_conversation
  ON public.chatbot_flow_ensure_idempotency (conversation_id);

COMMENT ON TABLE public.chatbot_flow_ensure_idempotency IS
  'S29.1 — mapeia chave opcional (ex. order.id) → conversation_id por flow; evita N conversas em reenvio Woo.';
