-- Etapa D.2 — Kanban de conversas (/chat/kanban): boards, colunas, cards
-- Política P1: mover card não altera CRM/funil. Sem sync automática com funnel_stages.
-- Position em cards: DOUBLE PRECISION (fractional indexing — simples de inserir entre dois valores sem renumberar tudo).

CREATE TABLE IF NOT EXISTS public.chat_kanban_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  updated_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  linked_sales_funnel_id UUID REFERENCES public.sales_funnels(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_kanban_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.chat_kanban_boards(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  position INTEGER NOT NULL,
  funnel_stage_id UUID REFERENCES public.funnel_stages(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (board_id, position)
);

CREATE TABLE IF NOT EXISTS public.chat_kanban_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.chat_kanban_boards(id) ON DELETE CASCADE,
  column_id UUID NOT NULL REFERENCES public.chat_kanban_columns(id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  archived_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (board_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_kanban_boards_tenant ON public.chat_kanban_boards(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_kanban_boards_tenant_archived ON public.chat_kanban_boards(tenant_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_chat_kanban_boards_tenant_sort ON public.chat_kanban_boards(tenant_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_chat_kanban_columns_board ON public.chat_kanban_columns(board_id);
CREATE INDEX IF NOT EXISTS idx_chat_kanban_columns_tenant ON public.chat_kanban_columns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_kanban_columns_board_position ON public.chat_kanban_columns(board_id, position);

CREATE INDEX IF NOT EXISTS idx_chat_kanban_cards_board_column_pos ON public.chat_kanban_cards(board_id, column_id, position);
CREATE INDEX IF NOT EXISTS idx_chat_kanban_cards_conversation ON public.chat_kanban_cards(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_kanban_cards_tenant_board ON public.chat_kanban_cards(tenant_id, board_id);

CREATE TRIGGER update_chat_kanban_boards_updated_at
  BEFORE UPDATE ON public.chat_kanban_boards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chat_kanban_columns_updated_at
  BEFORE UPDATE ON public.chat_kanban_columns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chat_kanban_cards_updated_at
  BEFORE UPDATE ON public.chat_kanban_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.chat_kanban_boards IS 'D.2 Kanban de conversas: quadro por tenant';
COMMENT ON TABLE public.chat_kanban_columns IS 'D.2 Colunas do board; exclusão bloqueada se existirem cards (ON DELETE RESTRICT)';
COMMENT ON COLUMN public.chat_kanban_cards.position IS 'Fractional indexing (DOUBLE PRECISION) para ordenação na coluna';
COMMENT ON COLUMN public.chat_kanban_boards.linked_sales_funnel_id IS 'Reservado: mapeamento futuro para sales_funnels; sem sync automática (P1)';

-- RLS: isolamento por tenant_id (padrão app.current_tenant_id / app_tenant_visible)
ALTER TABLE public.chat_kanban_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_kanban_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_kanban_boards_select_policy ON public.chat_kanban_boards;
DROP POLICY IF EXISTS chat_kanban_boards_insert_policy ON public.chat_kanban_boards;
DROP POLICY IF EXISTS chat_kanban_boards_update_policy ON public.chat_kanban_boards;
DROP POLICY IF EXISTS chat_kanban_boards_delete_policy ON public.chat_kanban_boards;

CREATE POLICY chat_kanban_boards_select_policy ON public.chat_kanban_boards  FOR SELECT
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id));

CREATE POLICY chat_kanban_boards_insert_policy ON public.chat_kanban_boards
  FOR INSERT
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

CREATE POLICY chat_kanban_boards_update_policy ON public.chat_kanban_boards
  FOR UPDATE
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

CREATE POLICY chat_kanban_boards_delete_policy ON public.chat_kanban_boards
  FOR DELETE
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id));

DROP POLICY IF EXISTS chat_kanban_columns_select_policy ON public.chat_kanban_columns;
DROP POLICY IF EXISTS chat_kanban_columns_insert_policy ON public.chat_kanban_columns;
DROP POLICY IF EXISTS chat_kanban_columns_update_policy ON public.chat_kanban_columns;
DROP POLICY IF EXISTS chat_kanban_columns_delete_policy ON public.chat_kanban_columns;

CREATE POLICY chat_kanban_columns_select_policy ON public.chat_kanban_columns
  FOR SELECT
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id));

CREATE POLICY chat_kanban_columns_insert_policy ON public.chat_kanban_columns
  FOR INSERT
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

CREATE POLICY chat_kanban_columns_update_policy ON public.chat_kanban_columns
  FOR UPDATE
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

CREATE POLICY chat_kanban_columns_delete_policy ON public.chat_kanban_columns
  FOR DELETE
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id));

DROP POLICY IF EXISTS chat_kanban_cards_select_policy ON public.chat_kanban_cards;
DROP POLICY IF EXISTS chat_kanban_cards_insert_policy ON public.chat_kanban_cards;
DROP POLICY IF EXISTS chat_kanban_cards_update_policy ON public.chat_kanban_cards;
DROP POLICY IF EXISTS chat_kanban_cards_delete_policy ON public.chat_kanban_cards;

CREATE POLICY chat_kanban_cards_select_policy ON public.chat_kanban_cards
  FOR SELECT
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id));

CREATE POLICY chat_kanban_cards_insert_policy ON public.chat_kanban_cards
  FOR INSERT
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

CREATE POLICY chat_kanban_cards_update_policy ON public.chat_kanban_cards
  FOR UPDATE
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

CREATE POLICY chat_kanban_cards_delete_policy ON public.chat_kanban_cards
  FOR DELETE
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id));
