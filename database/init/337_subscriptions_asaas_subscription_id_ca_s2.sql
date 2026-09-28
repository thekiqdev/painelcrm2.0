-- CA S2 — vínculo da assinatura SaaS local com Assinatura Asaas (`sub_…`).
-- Usado no checkout cartão: createSubscription no Asaas em vez de cobrança avulsa.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS asaas_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS asaas_subscription_gateway TEXT;

COMMENT ON COLUMN public.subscriptions.asaas_subscription_id IS
  'CA S2 — ID da Assinatura Asaas (sub_…). NULL = sem recorrência nativa no gateway.';
COMMENT ON COLUMN public.subscriptions.asaas_subscription_gateway IS
  'Gateway que emitiu asaas_subscription_id (ex.: asaas).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_asaas_subscription_id
  ON public.subscriptions (asaas_subscription_gateway, asaas_subscription_id)
  WHERE asaas_subscription_id IS NOT NULL
    AND asaas_subscription_gateway IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_saas_asaas_sub
  ON public.subscriptions (tenant_id)
  WHERE type = 'saas' AND asaas_subscription_id IS NOT NULL;
