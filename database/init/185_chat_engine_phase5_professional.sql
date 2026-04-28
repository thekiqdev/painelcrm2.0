-- Chat Engine Fase 5 — Atendimento profissional (filas, status padronizados, transferências, SLA básico)
-- Compatível: não remove colunas; amplia attendance_status; reutiliza teams / team_members.

-- ---------------------------------------------------------------------------
-- Filas por tenant
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_chat_queues_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_chat_queues_tenant ON public.chat_queues(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_queues_tenant_active ON public.chat_queues(tenant_id, is_active);

DROP TRIGGER IF EXISTS update_chat_queues_updated_at ON public.chat_queues;
CREATE TRIGGER update_chat_queues_updated_at
  BEFORE UPDATE ON public.chat_queues
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.chat_queues IS 'Filas de atendimento do Chat (Fase 5), escopo por tenant';

-- ---------------------------------------------------------------------------
-- Equipe: permitir papel supervisor (além de lead/member)
-- ---------------------------------------------------------------------------
ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('lead', 'member', 'supervisor'));

COMMENT ON COLUMN public.team_members.role IS 'member | lead | supervisor (supervisor = mesmo grupo operacional com visão ampliada)';

-- ---------------------------------------------------------------------------
-- Histórico de transferências (formato canónico Fase 5)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_conversation_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  from_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  from_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  from_queue_id UUID REFERENCES public.chat_queues(id) ON DELETE SET NULL,
  to_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  to_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  to_queue_id UUID REFERENCES public.chat_queues(id) ON DELETE SET NULL,
  reason TEXT,
  transferred_by UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  transferred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_conv_transfers_conv
  ON public.chat_conversation_transfers(conversation_id, transferred_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conv_transfers_tenant
  ON public.chat_conversation_transfers(tenant_id, transferred_at DESC);

COMMENT ON TABLE public.chat_conversation_transfers IS 'Fase 5: histórico de transferências de conversa (usuário/equipe/fila)';

-- ---------------------------------------------------------------------------
-- Colunas adicionais em chat_conversations
-- ---------------------------------------------------------------------------
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS priority TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_conversations_priority_check'
  ) THEN
    ALTER TABLE public.chat_conversations
      ADD CONSTRAINT chat_conversations_priority_check
      CHECK (priority IS NULL OR priority IN ('low', 'normal', 'high', 'urgent'));
  END IF;
END $$;

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_customer_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_agent_message_at TIMESTAMPTZ;

COMMENT ON COLUMN public.chat_conversations.first_response_at IS 'Primeira resposta de agente (SLA básico)';
COMMENT ON COLUMN public.chat_conversations.last_customer_message_at IS 'Última mensagem recebida do cliente';
COMMENT ON COLUMN public.chat_conversations.last_agent_message_at IS 'Última mensagem enviada pelo agente';

-- ---------------------------------------------------------------------------
-- Migrar attendance_status para valores Fase 5 (open, pending, in_progress, …)
-- ---------------------------------------------------------------------------
ALTER TABLE public.chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_attendance_status_check;

UPDATE public.chat_conversations
SET attendance_status = CASE trim(lower(coalesce(attendance_status, '')))
  WHEN 'unassigned' THEN 'pending'
  WHEN 'queued' THEN 'pending'
  WHEN 'in_service' THEN 'in_progress'
  WHEN 'closed' THEN 'closed'
  ELSE attendance_status
END
WHERE attendance_status IS NOT NULL;

UPDATE public.chat_conversations
SET attendance_status = 'pending'
WHERE attendance_status IS NULL OR trim(attendance_status) = '';

ALTER TABLE public.chat_conversations
  ADD CONSTRAINT chat_conversations_attendance_status_check
  CHECK (
    attendance_status IN (
      'open',
      'pending',
      'in_progress',
      'waiting_customer',
      'closed',
      'archived'
    )
  );

-- Orfãos de queue_id antes do FK
UPDATE public.chat_conversations c
SET queue_id = NULL
WHERE c.queue_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.chat_queues q WHERE q.id = c.queue_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_conversations_queue_id_fkey'
  ) THEN
    ALTER TABLE public.chat_conversations
      ADD CONSTRAINT chat_conversations_queue_id_fkey
      FOREIGN KEY (queue_id) REFERENCES public.chat_queues(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_priority
  ON public.chat_conversations(priority)
  WHERE priority IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_customer_msg
  ON public.chat_conversations(last_customer_message_at DESC)
  WHERE last_customer_message_at IS NOT NULL;

COMMENT ON COLUMN public.chat_conversations.attendance_status IS
  'Fase 5: open | pending | in_progress | waiting_customer | closed | archived';

-- ---------------------------------------------------------------------------
-- RLS (espelha padrão tenant)
-- ---------------------------------------------------------------------------
ALTER TABLE public.chat_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversation_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_queues_tenant_policy ON public.chat_queues;
CREATE POLICY chat_queues_tenant_policy ON public.chat_queues
  FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR tenant_id = public.app_current_tenant_id()
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR tenant_id = public.app_current_tenant_id()
  );

DROP POLICY IF EXISTS chat_conversation_transfers_tenant_policy ON public.chat_conversation_transfers;
CREATE POLICY chat_conversation_transfers_tenant_policy ON public.chat_conversation_transfers
  FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR tenant_id = public.app_current_tenant_id()
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR tenant_id = public.app_current_tenant_id()
  );
