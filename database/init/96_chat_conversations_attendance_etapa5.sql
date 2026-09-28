-- Etapa 5 — atendimento multiusuário / fila (chat): estado na conversa + histórico auditável
-- Compatível com installs existentes (IF NOT EXISTS).

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS attendance_status TEXT NOT NULL DEFAULT 'unassigned'
    CHECK (attendance_status IN ('unassigned', 'queued', 'in_service', 'closed'));

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS queue_id UUID NULL;

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS last_assignment_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_attendance_status
  ON public.chat_conversations(attendance_status);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_assigned_to_user_id
  ON public.chat_conversations(assigned_to_user_id)
  WHERE assigned_to_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_queue_id
  ON public.chat_conversations(queue_id)
  WHERE queue_id IS NOT NULL;

COMMENT ON COLUMN public.chat_conversations.attendance_status IS 'Etapa 5: unassigned | queued | in_service | closed';
COMMENT ON COLUMN public.chat_conversations.assigned_to_user_id IS 'Etapa 5: atendente atual (usuário do painel)';
COMMENT ON COLUMN public.chat_conversations.queue_id IS 'Etapa 5: reservado para filas futuras; FK opcional depois';

CREATE TABLE IF NOT EXISTS public.chat_conversation_assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  from_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  to_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  queue_id UUID NULL,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  operation TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_conv_assign_hist_conversation
  ON public.chat_conversation_assignment_history(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_conv_assign_hist_tenant
  ON public.chat_conversation_assignment_history(tenant_id, created_at DESC);

COMMENT ON TABLE public.chat_conversation_assignment_history IS 'Etapa 5: auditoria de atendimento (status/atribuição/fila)';

ALTER TABLE public.chat_conversation_assignment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_conversation_assignment_history_tenant_policy ON public.chat_conversation_assignment_history;
CREATE POLICY chat_conversation_assignment_history_tenant_policy
  ON public.chat_conversation_assignment_history
  FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR (
      tenant_id IS NOT NULL
      AND tenant_id = public.app_current_tenant_id()
    )
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR (
      tenant_id IS NOT NULL
      AND tenant_id = public.app_current_tenant_id()
    )
  );
