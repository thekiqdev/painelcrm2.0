-- Billing Engine Fase 1: vínculo tenant_billing com subscriptions + snapshot do plano + idempotência por ciclo.
-- period_start/period_end já existem em 59; adicionar subscription_id, plan_name_snapshot, plan_price_snapshot e UNIQUE.

ALTER TABLE public.tenant_billing
  ADD COLUMN IF NOT EXISTS subscription_id UUID NULL REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan_name_snapshot TEXT NULL,
  ADD COLUMN IF NOT EXISTS plan_price_snapshot INT NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_billing_subscription_id
  ON public.tenant_billing(subscription_id)
  WHERE subscription_id IS NOT NULL;

-- Idempotência: uma assinatura não gera duas faturas para o mesmo período (period_start).
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_billing_subscription_period_start
  ON public.tenant_billing(subscription_id, period_start)
  WHERE subscription_id IS NOT NULL;

COMMENT ON COLUMN public.tenant_billing.subscription_id IS 'Assinatura que gerou esta fatura (recorrência). NULL para faturas avulsas (plan_purchase sem Billing Engine).';
COMMENT ON COLUMN public.tenant_billing.plan_name_snapshot IS 'Nome do plano no momento da emissão (histórico).';
COMMENT ON COLUMN public.tenant_billing.plan_price_snapshot IS 'Valor em centavos do plano no momento da emissão (histórico).';
