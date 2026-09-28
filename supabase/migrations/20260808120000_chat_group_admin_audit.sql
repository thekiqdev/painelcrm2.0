-- Auditoria de ações administrativas em grupos WhatsApp (UazAPI), Fase 3.
CREATE TABLE IF NOT EXISTS public.chat_group_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  actor_user_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations (id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.chat_instances (id) ON DELETE CASCADE,
  group_jid text NOT NULL,
  action text NOT NULL,
  payload jsonb,
  uazapi_status int,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_group_admin_audit_conversation
  ON public.chat_group_admin_audit (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_group_admin_audit_tenant
  ON public.chat_group_admin_audit (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_group_admin_audit_actor
  ON public.chat_group_admin_audit (actor_user_id, created_at DESC);
