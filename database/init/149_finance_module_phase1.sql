-- Fase 1 — Módulo financeiro profissional (contas, categorias, entradas e despesas tenant-scoped).
-- Compatível com produção: não altera invoices/expenses/customer_invoices existentes.

CREATE TABLE IF NOT EXISTS public.finance_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('bank', 'cash', 'wallet', 'digital')),
  opening_balance_cents BIGINT NOT NULL DEFAULT 0,
  opening_balance_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_accounts_tenant ON public.finance_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_accounts_tenant_active ON public.finance_accounts(tenant_id, is_active);

CREATE TABLE IF NOT EXISTS public.finance_expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT finance_expense_categories_tenant_name_unique UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_finance_expense_categories_tenant ON public.finance_expense_categories(tenant_id);

CREATE TABLE IF NOT EXISTS public.finance_income_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  finance_account_id UUID NOT NULL REFERENCES public.finance_accounts(id) ON DELETE RESTRICT,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  received_at DATE NOT NULL,
  description TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  manual_payee_name TEXT,
  category_tag TEXT,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_income_tenant_received ON public.finance_income_entries(tenant_id, received_at);
CREATE INDEX IF NOT EXISTS idx_finance_income_account ON public.finance_income_entries(finance_account_id);

CREATE TABLE IF NOT EXISTS public.finance_expense_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  finance_account_id UUID REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.finance_expense_categories(id) ON DELETE SET NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  expense_date DATE NOT NULL,
  due_date DATE NOT NULL,
  paid_at DATE,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('expected', 'pending', 'paid', 'overdue', 'cancelled')),
  supplier_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_expense_tenant_date ON public.finance_expense_entries(tenant_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_finance_expense_tenant_status ON public.finance_expense_entries(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_finance_expense_account ON public.finance_expense_entries(finance_account_id);

CREATE TRIGGER finance_accounts_updated_at
  BEFORE UPDATE ON public.finance_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER finance_expense_categories_updated_at
  BEFORE UPDATE ON public.finance_expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER finance_income_entries_updated_at
  BEFORE UPDATE ON public.finance_income_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER finance_expense_entries_updated_at
  BEFORE UPDATE ON public.finance_expense_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS (Etapa 5)
ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_accounts_tenant_policy ON public.finance_accounts;
CREATE POLICY finance_accounts_tenant_policy ON public.finance_accounts
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

ALTER TABLE public.finance_expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_expense_categories_tenant_policy ON public.finance_expense_categories;
CREATE POLICY finance_expense_categories_tenant_policy ON public.finance_expense_categories
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

ALTER TABLE public.finance_income_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_income_entries_tenant_policy ON public.finance_income_entries;
CREATE POLICY finance_income_entries_tenant_policy ON public.finance_income_entries
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

ALTER TABLE public.finance_expense_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_expense_entries_tenant_policy ON public.finance_expense_entries;
CREATE POLICY finance_expense_entries_tenant_policy ON public.finance_expense_entries
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

-- Categorias padrão para todos os tenants existentes
INSERT INTO public.finance_expense_categories (tenant_id, name, sort_order)
SELECT t.id, v.name, v.ord
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('Aluguel', 10),
    ('Energia', 20),
    ('Água', 30),
    ('Internet', 40),
    ('Telefone', 50),
    ('Salários', 60),
    ('Pró-labore', 70),
    ('Impostos', 80),
    ('Marketing', 90),
    ('Tráfego pago', 100),
    ('Ferramentas/SaaS', 110),
    ('Contabilidade', 120),
    ('Fornecedores', 130),
    ('Manutenção', 140),
    ('Transporte', 150),
    ('Alimentação', 160),
    ('Empréstimos', 170),
    ('Cartão de crédito', 180),
    ('Outros', 999)
) AS v(name, ord)
ON CONFLICT ON CONSTRAINT finance_expense_categories_tenant_name_unique DO NOTHING;
