-- Sync with database/init/163_financial_account_visibility.sql

ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS visibility_mode TEXT NOT NULL DEFAULT 'all_finance_users'
    CHECK (visibility_mode IN ('all_finance_users', 'admins_only', 'restricted'));

CREATE TABLE IF NOT EXISTS public.financial_account_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('view', 'manage')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT financial_account_permissions_one_target CHECK (
    (user_id IS NOT NULL AND team_id IS NULL) OR (user_id IS NULL AND team_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_fap_account_user
  ON public.financial_account_permissions (tenant_id, account_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_fap_account_team
  ON public.financial_account_permissions (tenant_id, account_id, team_id)
  WHERE team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fap_tenant_account ON public.financial_account_permissions (tenant_id, account_id);

DROP TRIGGER IF EXISTS financial_account_permissions_updated_at ON public.financial_account_permissions;
CREATE TRIGGER financial_account_permissions_updated_at
  BEFORE UPDATE ON public.financial_account_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.financial_account_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_account_permissions_policy ON public.financial_account_permissions;
CREATE POLICY financial_account_permissions_policy ON public.financial_account_permissions
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());
