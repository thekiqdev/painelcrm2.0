-- Fase 1 — Modelo unificado /api/financial (financial_accounts, financial_transactions, expense_categories).
-- Não altera customer_invoices, invoices, expenses nem tabelas finance_* da migração 149.

CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_system_name_unique
  ON public.expense_categories (lower(name))
  WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_tenant_name_unique
  ON public.expense_categories (tenant_id, lower(name))
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expense_categories_tenant ON public.expense_categories(tenant_id);

CREATE TABLE IF NOT EXISTS public.financial_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('bank', 'cash', 'wallet')),
  initial_balance_cents BIGINT NOT NULL DEFAULT 0,
  initial_balance_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_accounts_tenant ON public.financial_accounts(tenant_id);

CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  description TEXT NOT NULL,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  reference_name TEXT,
  transaction_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_transactions_tenant_date ON public.financial_transactions(tenant_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_tenant_type ON public.financial_transactions(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_account ON public.financial_transactions(account_id);

DROP TRIGGER IF EXISTS financial_accounts_updated_at ON public.financial_accounts;
CREATE TRIGGER financial_accounts_updated_at
  BEFORE UPDATE ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS financial_transactions_updated_at ON public.financial_transactions;
CREATE TRIGGER financial_transactions_updated_at
  BEFORE UPDATE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expense_categories_select ON public.expense_categories;
CREATE POLICY expense_categories_select ON public.expense_categories
  FOR SELECT
  USING (
    public.app_can_bypass_rls()
    OR tenant_id IS NULL
    OR public.app_tenant_visible(tenant_id)
  );

DROP POLICY IF EXISTS expense_categories_insert ON public.expense_categories;
CREATE POLICY expense_categories_insert ON public.expense_categories
  FOR INSERT
  WITH CHECK (
    public.app_can_bypass_rls()
    OR (tenant_id IS NOT NULL AND tenant_id = public.app_current_tenant_id())
  );

DROP POLICY IF EXISTS expense_categories_update ON public.expense_categories;
CREATE POLICY expense_categories_update ON public.expense_categories
  FOR UPDATE
  USING (
    public.app_can_bypass_rls()
    OR (tenant_id IS NOT NULL AND public.app_tenant_visible(tenant_id))
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR (tenant_id IS NOT NULL AND tenant_id = public.app_current_tenant_id())
  );

DROP POLICY IF EXISTS expense_categories_delete ON public.expense_categories;
CREATE POLICY expense_categories_delete ON public.expense_categories
  FOR DELETE
  USING (
    public.app_can_bypass_rls()
    OR (tenant_id IS NOT NULL AND public.app_tenant_visible(tenant_id))
  );

ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_accounts_tenant_policy ON public.financial_accounts;
CREATE POLICY financial_accounts_tenant_policy ON public.financial_accounts
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_transactions_tenant_policy ON public.financial_transactions;
CREATE POLICY financial_transactions_tenant_policy ON public.financial_transactions
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

-- Categorias padrão do sistema (tenant_id NULL), idempotente
INSERT INTO public.expense_categories (tenant_id, name)
SELECT NULL, v.name
FROM (
  VALUES
    ('Aluguel'),
    ('Energia'),
    ('Água'),
    ('Internet'),
    ('Salários'),
    ('Impostos'),
    ('Marketing'),
    ('Ferramentas'),
    ('Outros')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.expense_categories ec
  WHERE ec.tenant_id IS NULL AND lower(ec.name) = lower(v.name)
);
