-- Fase 3 — Cartões de crédito (financial_credit_cards, purchases, installments, statements).
-- Não altera customer_invoices nem motor de faturas recorrentes.

INSERT INTO public.expense_categories (tenant_id, name)
SELECT NULL, v.name
FROM (VALUES
  ('Cartão de crédito'),
  ('Despesas não cadastradas'),
  ('Ajuste cartão')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.expense_categories ec
  WHERE ec.tenant_id IS NULL AND lower(ec.name) = lower(v.name)
);

CREATE TABLE IF NOT EXISTS public.financial_credit_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('personal', 'business')),
  limit_cents BIGINT CHECK (limit_cents IS NULL OR limit_cents >= 0),
  closing_day INTEGER NOT NULL CHECK (closing_day >= 1 AND closing_day <= 31),
  due_day INTEGER NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  default_payment_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_credit_cards_tenant ON public.financial_credit_cards(tenant_id);

CREATE TABLE IF NOT EXISTS public.financial_credit_card_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_card_id UUID NOT NULL REFERENCES public.financial_credit_cards(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  purchase_date DATE NOT NULL,
  total_amount_cents BIGINT NOT NULL CHECK (total_amount_cents >= 0),
  installments_count INTEGER NOT NULL DEFAULT 1 CHECK (installments_count >= 1),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_cc_purchases_card ON public.financial_credit_card_purchases(credit_card_id);
CREATE INDEX IF NOT EXISTS idx_financial_cc_purchases_tenant ON public.financial_credit_card_purchases(tenant_id);

CREATE TABLE IF NOT EXISTS public.financial_credit_card_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_card_id UUID NOT NULL REFERENCES public.financial_credit_cards(id) ON DELETE CASCADE,
  purchase_id UUID NOT NULL REFERENCES public.financial_credit_card_purchases(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  installment_number INTEGER NOT NULL CHECK (installment_number >= 1),
  installments_count INTEGER NOT NULL CHECK (installments_count >= 1),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  statement_month DATE NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'paid', 'cancelled')),
  financial_transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT financial_cc_inst_unique_num UNIQUE (purchase_id, installment_number)
);

CREATE INDEX IF NOT EXISTS idx_financial_cc_inst_tenant_stmt ON public.financial_credit_card_installments(tenant_id, statement_month);
CREATE INDEX IF NOT EXISTS idx_financial_cc_inst_card_stmt ON public.financial_credit_card_installments(credit_card_id, statement_month);
CREATE INDEX IF NOT EXISTS idx_financial_cc_inst_status ON public.financial_credit_card_installments(tenant_id, status);

CREATE TABLE IF NOT EXISTS public.financial_credit_card_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_card_id UUID NOT NULL REFERENCES public.financial_credit_cards(id) ON DELETE CASCADE,
  statement_month DATE NOT NULL,
  closing_date DATE NOT NULL,
  due_date DATE NOT NULL,
  expected_amount_cents BIGINT NOT NULL DEFAULT 0 CHECK (expected_amount_cents >= 0),
  manual_amount_cents BIGINT CHECK (manual_amount_cents IS NULL OR manual_amount_cents >= 0),
  difference_amount_cents BIGINT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'paid')),
  paid_at TIMESTAMPTZ,
  payment_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  payment_transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  payment_extra_transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT financial_cc_stmt_unique_month UNIQUE (credit_card_id, statement_month)
);

CREATE INDEX IF NOT EXISTS idx_financial_cc_stmt_tenant ON public.financial_credit_card_statements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_financial_cc_stmt_due ON public.financial_credit_card_statements(tenant_id, due_date);

DROP TRIGGER IF EXISTS financial_credit_cards_updated_at ON public.financial_credit_cards;
CREATE TRIGGER financial_credit_cards_updated_at
  BEFORE UPDATE ON public.financial_credit_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS financial_credit_card_purchases_updated_at ON public.financial_credit_card_purchases;
CREATE TRIGGER financial_credit_card_purchases_updated_at
  BEFORE UPDATE ON public.financial_credit_card_purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS financial_credit_card_installments_updated_at ON public.financial_credit_card_installments;
CREATE TRIGGER financial_credit_card_installments_updated_at
  BEFORE UPDATE ON public.financial_credit_card_installments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS financial_credit_card_statements_updated_at ON public.financial_credit_card_statements;
CREATE TRIGGER financial_credit_card_statements_updated_at
  BEFORE UPDATE ON public.financial_credit_card_statements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.financial_credit_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_credit_cards_tenant_policy ON public.financial_credit_cards;
CREATE POLICY financial_credit_cards_tenant_policy ON public.financial_credit_cards
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

ALTER TABLE public.financial_credit_card_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_credit_card_purchases_tenant_policy ON public.financial_credit_card_purchases;
CREATE POLICY financial_credit_card_purchases_tenant_policy ON public.financial_credit_card_purchases
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

ALTER TABLE public.financial_credit_card_installments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_credit_card_installments_tenant_policy ON public.financial_credit_card_installments;
CREATE POLICY financial_credit_card_installments_tenant_policy ON public.financial_credit_card_installments
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

ALTER TABLE public.financial_credit_card_statements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_credit_card_statements_tenant_policy ON public.financial_credit_card_statements;
CREATE POLICY financial_credit_card_statements_tenant_policy ON public.financial_credit_card_statements
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());
