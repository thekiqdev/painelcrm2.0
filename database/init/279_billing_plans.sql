-- BILLING ENGINE V2 — Sprint 2.1: Billing Plan (fundação).
-- Não altera motor de renovação; tabela nova apenas para evolução futura.

CREATE TABLE IF NOT EXISTS public.billing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived', 'cancelled')),
  version INT NOT NULL CHECK (version >= 1),
  currency TEXT NOT NULL DEFAULT 'BRL',
  billing_interval TEXT NOT NULL,
  billing_frequency INT NOT NULL DEFAULT 1 CHECK (billing_frequency >= 1),
  billing_anchor SMALLINT NULL CHECK (billing_anchor IS NULL OR (billing_anchor >= 1 AND billing_anchor <= 31)),
  starts_at DATE NOT NULL,
  ends_at DATE NULL,
  trial_until DATE NULL,
  next_generation_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_plans_subscription_version_unique UNIQUE (subscription_id, version)
);

COMMENT ON TABLE public.billing_plans IS
  'Billing Engine V2 — plano de recorrência versionado por assinatura. Sprint 2.1: fundação; motor legado não consome ainda.';

CREATE INDEX IF NOT EXISTS idx_billing_plans_subscription_id
  ON public.billing_plans(subscription_id);

CREATE INDEX IF NOT EXISTS idx_billing_plans_tenant_id
  ON public.billing_plans(tenant_id);

CREATE INDEX IF NOT EXISTS idx_billing_plans_status
  ON public.billing_plans(status);

CREATE INDEX IF NOT EXISTS idx_billing_plans_next_generation_at
  ON public.billing_plans(next_generation_at)
  WHERE next_generation_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_plans_tenant_status
  ON public.billing_plans(tenant_id, status);

-- No máximo 1 plano active por assinatura (versões antigas permanecem archived/cancelled/draft).
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_plans_one_active_per_subscription
  ON public.billing_plans(subscription_id)
  WHERE status = 'active';
