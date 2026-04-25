-- Fase 2 — Despesas recorrentes e ocorrências (financial_recurring_expenses, financial_recurring_expense_occurrences).
-- Não altera motor de faturas recorrentes nem customer_invoices.

CREATE TABLE IF NOT EXISTS public.financial_recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  category_id UUID NOT NULL REFERENCES public.expense_categories(id) ON DELETE RESTRICT,
  default_account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  periodicity TEXT NOT NULL CHECK (periodicity IN (
    'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual'
  )),
  /** Semanal/quinzenal: 1=seg … 7=dom (ISO). Mensal e superiores: dia do mês (1–31). */
  due_day INTEGER NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  start_date DATE NOT NULL,
  end_date DATE,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('infinite', 'finite')),
  max_occurrences INTEGER CHECK (max_occurrences IS NULL OR max_occurrences > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT financial_recurring_expenses_finite_requires_max CHECK (
    (schedule_type = 'infinite' AND max_occurrences IS NULL)
    OR (schedule_type = 'finite' AND max_occurrences IS NOT NULL)
  ),
  CONSTRAINT financial_recurring_expenses_end_after_start CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_financial_recurring_expenses_tenant
  ON public.financial_recurring_expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_financial_recurring_expenses_active
  ON public.financial_recurring_expenses(tenant_id, is_active);

CREATE TABLE IF NOT EXISTS public.financial_recurring_expense_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_expense_id UUID NOT NULL REFERENCES public.financial_recurring_expenses(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  due_date DATE NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'pending', 'paid', 'cancelled')),
  paid_at TIMESTAMPTZ,
  transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT financial_recurring_expense_occurrences_unique_due UNIQUE (recurring_expense_id, due_date)
);

CREATE INDEX IF NOT EXISTS idx_financial_recurring_occ_tenant_due
  ON public.financial_recurring_expense_occurrences(tenant_id, due_date);
CREATE INDEX IF NOT EXISTS idx_financial_recurring_occ_recurring
  ON public.financial_recurring_expense_occurrences(recurring_expense_id);

DROP TRIGGER IF EXISTS financial_recurring_expenses_updated_at ON public.financial_recurring_expenses;
CREATE TRIGGER financial_recurring_expenses_updated_at
  BEFORE UPDATE ON public.financial_recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS financial_recurring_expense_occurrences_updated_at ON public.financial_recurring_expense_occurrences;
CREATE TRIGGER financial_recurring_expense_occurrences_updated_at
  BEFORE UPDATE ON public.financial_recurring_expense_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.financial_recurring_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_recurring_expenses_tenant_policy ON public.financial_recurring_expenses;
CREATE POLICY financial_recurring_expenses_tenant_policy ON public.financial_recurring_expenses
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

ALTER TABLE public.financial_recurring_expense_occurrences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_recurring_expense_occurrences_tenant_policy ON public.financial_recurring_expense_occurrences;
CREATE POLICY financial_recurring_expense_occurrences_tenant_policy ON public.financial_recurring_expense_occurrences
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());
