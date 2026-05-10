CREATE TABLE IF NOT EXISTS public.chat_conversation_system_delete_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  conversation_id UUID NOT NULL,
  external_chat_id TEXT,
  linked_client_id UUID,
  linked_lead_id UUID,
  deleted_messages_count INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_conv_system_delete_audit_tenant_created
  ON public.chat_conversation_system_delete_audit (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_conv_system_delete_audit_conversation
  ON public.chat_conversation_system_delete_audit (conversation_id, created_at DESC);

COMMENT ON TABLE public.chat_conversation_system_delete_audit IS
  'Auditoria de exclusão interna de conversas do PainelCRM sem apagar a conversa no WhatsApp.';
