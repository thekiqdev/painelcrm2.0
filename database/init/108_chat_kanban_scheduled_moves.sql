-- Kanban (/chat/kanbam): agendamentos de movimento automático por tempo entre colunas.
-- Uma linha `scheduled` por (card_id, from_column_id) — ver índice parcial único.

CREATE TABLE IF NOT EXISTS public.chat_kanban_scheduled_moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES public.chat_kanban_boards(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.chat_kanban_cards(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  from_column_id UUID NOT NULL REFERENCES public.chat_kanban_columns(id) ON DELETE CASCADE,
  to_column_id UUID NOT NULL REFERENCES public.chat_kanban_columns(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL DEFAULT 'time_delay',
  delay_value INTEGER NOT NULL,
  delay_unit TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  cancelled_reason TEXT,
  executed_at TIMESTAMPTZ,
  error_message TEXT,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_kanban_scheduled_moves_status_chk CHECK (
    status IN ('scheduled', 'executed', 'cancelled', 'skipped', 'failed')
  ),
  CONSTRAINT chat_kanban_scheduled_moves_trigger_chk CHECK (trigger_type = 'time_delay'),
  CONSTRAINT chat_kanban_scheduled_moves_unit_chk CHECK (
    delay_unit IN ('seconds', 'minutes', 'hours', 'days')
  ),
  CONSTRAINT chat_kanban_scheduled_moves_delay_positive_chk CHECK (delay_value >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_chat_kanban_sched_pending_card_from
  ON public.chat_kanban_scheduled_moves (card_id, from_column_id)
  WHERE (status = 'scheduled');

CREATE INDEX IF NOT EXISTS idx_chat_kanban_scheduled_moves_due
  ON public.chat_kanban_scheduled_moves (status, scheduled_for)
  WHERE (status = 'scheduled');

CREATE INDEX IF NOT EXISTS idx_chat_kanban_scheduled_moves_tenant
  ON public.chat_kanban_scheduled_moves (tenant_id);

CREATE INDEX IF NOT EXISTS idx_chat_kanban_scheduled_moves_card
  ON public.chat_kanban_scheduled_moves (card_id);

CREATE TRIGGER update_chat_kanban_scheduled_moves_updated_at
  BEFORE UPDATE ON public.chat_kanban_scheduled_moves
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.chat_kanban_scheduled_moves IS 'Agendamentos de movimento automático de cartão Kanban por tempo (backend)';

ALTER TABLE public.chat_kanban_scheduled_moves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_kanban_scheduled_moves_select_policy ON public.chat_kanban_scheduled_moves;
DROP POLICY IF EXISTS chat_kanban_scheduled_moves_insert_policy ON public.chat_kanban_scheduled_moves;
DROP POLICY IF EXISTS chat_kanban_scheduled_moves_update_policy ON public.chat_kanban_scheduled_moves;
DROP POLICY IF EXISTS chat_kanban_scheduled_moves_delete_policy ON public.chat_kanban_scheduled_moves;

CREATE POLICY chat_kanban_scheduled_moves_select_policy ON public.chat_kanban_scheduled_moves
  FOR SELECT
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id));

CREATE POLICY chat_kanban_scheduled_moves_insert_policy ON public.chat_kanban_scheduled_moves
  FOR INSERT
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

CREATE POLICY chat_kanban_scheduled_moves_update_policy ON public.chat_kanban_scheduled_moves
  FOR UPDATE
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

CREATE POLICY chat_kanban_scheduled_moves_delete_policy ON public.chat_kanban_scheduled_moves
  FOR DELETE
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id));
