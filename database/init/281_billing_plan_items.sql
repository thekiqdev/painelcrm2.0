-- BILLING ENGINE V2 — Sprint 2.2: Billing Plan Items (fundação).
-- Regra de cobrança recorrente; motor legado inalterado.

CREATE TABLE IF NOT EXISTS public.billing_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  billing_plan_id UUID NOT NULL REFERENCES public.billing_plans(id) ON DELETE CASCADE,
  sequence INT NOT NULL CHECK (sequence >= 1),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('active', 'paused', 'cancelled', 'archived', 'draft')),
  item_type TEXT NOT NULL DEFAULT 'service'
    CHECK (item_type IN ('product', 'service', 'fee', 'adjustment', 'discount', 'shipping', 'custom')),
  origin TEXT NOT NULL DEFAULT 'subscription'
    CHECK (origin IN ('subscription', 'manual', 'migration', 'contract', 'future')),
  name TEXT NOT NULL,
  description TEXT NULL,
  quantity NUMERIC(18, 4) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit_price BIGINT NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount_type TEXT NULL CHECK (discount_type IS NULL OR discount_type IN ('none', 'fixed', 'percent')),
  discount_value BIGINT NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  tax_rate NUMERIC(8, 4) NULL,
  tax_value BIGINT NOT NULL DEFAULT 0 CHECK (tax_value >= 0),
  total_amount BIGINT NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  is_recurring BOOLEAN NOT NULL DEFAULT true,
  billing_interval TEXT NULL,
  billing_frequency INT NOT NULL DEFAULT 1 CHECK (billing_frequency >= 1),
  billing_anchor SMALLINT NULL CHECK (billing_anchor IS NULL OR (billing_anchor >= 1 AND billing_anchor <= 31)),
  proration_mode TEXT NULL CHECK (proration_mode IS NULL OR proration_mode IN ('none', 'daily', 'monthly', 'cycle')),
  starts_at DATE NULL,
  ends_at DATE NULL,
  trial_until DATE NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_plan_items_plan_sequence_unique UNIQUE (billing_plan_id, sequence)
);

COMMENT ON TABLE public.billing_plan_items IS
  'Billing Engine V2 — regra de cobrança recorrente por plano. Não é invoice nem snapshot de invoice_item.';

CREATE INDEX IF NOT EXISTS idx_billing_plan_items_billing_plan_id
  ON public.billing_plan_items(billing_plan_id);

CREATE INDEX IF NOT EXISTS idx_billing_plan_items_tenant_id
  ON public.billing_plan_items(tenant_id);

CREATE INDEX IF NOT EXISTS idx_billing_plan_items_status
  ON public.billing_plan_items(status);

CREATE INDEX IF NOT EXISTS idx_billing_plan_items_item_type
  ON public.billing_plan_items(item_type);

CREATE INDEX IF NOT EXISTS idx_billing_plan_items_origin
  ON public.billing_plan_items(origin);

CREATE INDEX IF NOT EXISTS idx_billing_plan_items_is_recurring
  ON public.billing_plan_items(is_recurring);

CREATE INDEX IF NOT EXISTS idx_billing_plan_items_tenant_status
  ON public.billing_plan_items(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_billing_plan_items_plan_sequence
  ON public.billing_plan_items(billing_plan_id, sequence);
