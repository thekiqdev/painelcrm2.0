-- M5 S5 — Central de Vendedores: regras, ledger e payouts

-- Regras: seller_user_id NULL = default da equipe; NOT NULL = override do vendedor
CREATE TABLE IF NOT EXISTS public.partner_commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  seller_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL DEFAULT 'percent'
    CHECK (rule_type IN ('percent', 'fixed', 'hybrid')),
  percent_bps INTEGER
    CHECK (percent_bps IS NULL OR (percent_bps >= 0 AND percent_bps <= 10000)),
  fixed_cents INTEGER
    CHECK (fixed_cents IS NULL OR fixed_cents >= 0),
  -- Base operacional S5: sempre lucro (venda − custo). Coluna para evolução.
  base_definition TEXT NOT NULL DEFAULT 'profit'
    CHECK (base_definition IN ('profit')),
  cycle_mode TEXT NOT NULL DEFAULT 'recurring'
    CHECK (cycle_mode IN ('recurring', 'custom_cycles')),
  custom_cycle_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  applies_to TEXT NOT NULL DEFAULT 'both'
    CHECK (applies_to IN ('first_only', 'renewals', 'both')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT partner_commission_rules_hybrid_chk CHECK (
    (rule_type = 'percent' AND percent_bps IS NOT NULL)
    OR (rule_type = 'fixed' AND fixed_cents IS NOT NULL)
    OR (rule_type = 'hybrid' AND percent_bps IS NOT NULL AND fixed_cents IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_commission_team_rule_active
  ON public.partner_commission_rules (partner_tenant_id)
  WHERE seller_user_id IS NULL AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_commission_seller_rule_active
  ON public.partner_commission_rules (partner_tenant_id, seller_user_id)
  WHERE seller_user_id IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_partner_commission_rules_partner
  ON public.partner_commission_rules (partner_tenant_id);

CREATE TRIGGER update_partner_commission_rules_updated_at
  BEFORE UPDATE ON public.partner_commission_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.partner_commission_rules IS
  'S5: regra equipe (seller null) ou override por vendedor; comissão capped no lucro no accrual';

CREATE TABLE IF NOT EXISTS public.partner_commission_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  seller_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  reference TEXT,
  marked_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_commission_payouts_partner_seller
  ON public.partner_commission_payouts (partner_tenant_id, seller_user_id);

CREATE TABLE IF NOT EXISTS public.partner_commission_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  seller_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  customer_tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  billing_id UUID REFERENCES public.tenant_billing(id) ON DELETE SET NULL,
  cycle_number INTEGER NOT NULL DEFAULT 1 CHECK (cycle_number >= 1),
  sale_amount_cents INTEGER NOT NULL CHECK (sale_amount_cents >= 0),
  cost_amount_cents INTEGER NOT NULL CHECK (cost_amount_cents >= 0),
  profit_amount_cents INTEGER NOT NULL,
  commission_amount_cents INTEGER NOT NULL CHECK (commission_amount_cents >= 0),
  commission_capped BOOLEAN NOT NULL DEFAULT false,
  rule_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('pending', 'available', 'paid', 'clawed_back')),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  payout_id UUID REFERENCES public.partner_commission_payouts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_commission_ledger_billing_unique
  ON public.partner_commission_ledger (billing_id)
  WHERE billing_id IS NOT NULL AND status <> 'clawed_back';

CREATE INDEX IF NOT EXISTS idx_partner_commission_ledger_partner_seller
  ON public.partner_commission_ledger (partner_tenant_id, seller_user_id, status);

CREATE INDEX IF NOT EXISTS idx_partner_commission_ledger_customer
  ON public.partner_commission_ledger (customer_tenant_id);

CREATE TRIGGER update_partner_commission_ledger_updated_at
  BEFORE UPDATE ON public.partner_commission_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.partner_commission_ledger IS
  'S5: accrual imutável (snapshot); paid via payout; clawback auditável';
COMMENT ON COLUMN public.partner_commission_ledger.commission_capped IS
  'S5.cap=truncate: true se raw > lucro e commission foi truncada';
