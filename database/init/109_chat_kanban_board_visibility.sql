-- Kanban: visibilidade por tenant/usuários/equipes + board ativo

ALTER TABLE public.chat_kanban_boards
  ADD COLUMN IF NOT EXISTS visibility_mode TEXT NOT NULL DEFAULT 'tenant_all',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.chat_kanban_boards
  DROP CONSTRAINT IF EXISTS chat_kanban_boards_visibility_mode_chk;

ALTER TABLE public.chat_kanban_boards
  ADD CONSTRAINT chat_kanban_boards_visibility_mode_chk CHECK (visibility_mode IN ('tenant_all', 'restricted'));

COMMENT ON COLUMN public.chat_kanban_boards.visibility_mode IS 'tenant_all: todos do tenant veem; restricted: apenas listas em chat_kanban_board_users / chat_kanban_board_teams (+ criador e admins)';
COMMENT ON COLUMN public.chat_kanban_boards.is_active IS 'false: oculto na listagem para quem não é criador nem admin do tenant';

CREATE TABLE IF NOT EXISTS public.chat_kanban_board_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.chat_kanban_boards(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (board_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_kanban_board_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.chat_kanban_boards(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (board_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_kanban_board_users_board ON public.chat_kanban_board_users(board_id);
CREATE INDEX IF NOT EXISTS idx_chat_kanban_board_users_tenant ON public.chat_kanban_board_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_kanban_board_teams_board ON public.chat_kanban_board_teams(board_id);
CREATE INDEX IF NOT EXISTS idx_chat_kanban_board_teams_tenant ON public.chat_kanban_board_teams(tenant_id);

ALTER TABLE public.chat_kanban_board_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_kanban_board_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_kanban_board_users_select_policy ON public.chat_kanban_board_users;
DROP POLICY IF EXISTS chat_kanban_board_users_insert_policy ON public.chat_kanban_board_users;
DROP POLICY IF EXISTS chat_kanban_board_users_delete_policy ON public.chat_kanban_board_users;

CREATE POLICY chat_kanban_board_users_select_policy ON public.chat_kanban_board_users FOR SELECT
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id));
CREATE POLICY chat_kanban_board_users_insert_policy ON public.chat_kanban_board_users FOR INSERT
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());
CREATE POLICY chat_kanban_board_users_delete_policy ON public.chat_kanban_board_users FOR DELETE
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id));

DROP POLICY IF EXISTS chat_kanban_board_teams_select_policy ON public.chat_kanban_board_teams;
DROP POLICY IF EXISTS chat_kanban_board_teams_insert_policy ON public.chat_kanban_board_teams;
DROP POLICY IF EXISTS chat_kanban_board_teams_delete_policy ON public.chat_kanban_board_teams;

CREATE POLICY chat_kanban_board_teams_select_policy ON public.chat_kanban_board_teams FOR SELECT
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id));
CREATE POLICY chat_kanban_board_teams_insert_policy ON public.chat_kanban_board_teams FOR INSERT
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());
CREATE POLICY chat_kanban_board_teams_delete_policy ON public.chat_kanban_board_teams FOR DELETE
  USING (public.app_can_bypass_rls() OR public.app_tenant_visible(tenant_id));
