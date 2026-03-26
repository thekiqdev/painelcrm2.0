-- Fase 1 — Plano multi-gateway: colunas genéricas + payment_events (PLANO-REFATORACAO-MULTI-GATEWAY).
-- Objetivo: preparar banco para múltiplos gateways sem alterar comportamento da aplicação.
-- Nenhum código de aplicação alterado nesta fase.

-- =============================================================================
-- 1) customer_invoices: novas colunas genéricas
-- =============================================================================
ALTER TABLE public.customer_invoices
  ADD COLUMN IF NOT EXISTS gateway_reference_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS gateway_metadata JSONB NULL,
  ADD COLUMN IF NOT EXISTS gateway_status TEXT NULL;

COMMENT ON COLUMN public.customer_invoices.gateway_reference_id IS 'ID principal do pagamento no gateway (lookup webhook e API). Fonte: asaas_payment_id no backfill.';
COMMENT ON COLUMN public.customer_invoices.gateway_metadata IS 'IDs/dados extras por gateway (ex.: preference_id, charge_id).';
COMMENT ON COLUMN public.customer_invoices.gateway_status IS 'Status bruto do gateway (debug/suporte). Fonte: asaas_status no backfill.';

-- =============================================================================
-- 2) tenant_billing: novas colunas genéricas
-- =============================================================================
ALTER TABLE public.tenant_billing
  ADD COLUMN IF NOT EXISTS gateway_reference_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS gateway_metadata JSONB NULL,
  ADD COLUMN IF NOT EXISTS gateway_status TEXT NULL;

COMMENT ON COLUMN public.tenant_billing.gateway_reference_id IS 'ID principal do pagamento no gateway (lookup webhook e API). Fonte: asaas_payment_id no backfill.';
COMMENT ON COLUMN public.tenant_billing.gateway_metadata IS 'IDs/dados extras por gateway (ex.: preference_id, charge_id).';
COMMENT ON COLUMN public.tenant_billing.gateway_status IS 'Status bruto do gateway (debug/suporte). Fonte: asaas_status no backfill.';

-- =============================================================================
-- 3) Backfill: copiar asaas_* para gateway_* onde existir (só se as colunas asaas_* existirem)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customer_invoices' AND column_name = 'asaas_payment_id'
  ) THEN
    UPDATE public.customer_invoices
    SET
      gateway_reference_id = asaas_payment_id,
      gateway_status = asaas_status
    WHERE gateway IS NOT NULL AND asaas_payment_id IS NOT NULL
      AND (gateway_reference_id IS NULL OR gateway_reference_id IS DISTINCT FROM asaas_payment_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenant_billing' AND column_name = 'asaas_payment_id'
  ) THEN
    UPDATE public.tenant_billing
    SET
      gateway_reference_id = asaas_payment_id,
      gateway_status = asaas_status
    WHERE gateway IS NOT NULL AND asaas_payment_id IS NOT NULL
      AND (gateway_reference_id IS NULL OR gateway_reference_id IS DISTINCT FROM asaas_payment_id);
  END IF;
END $$;

-- =============================================================================
-- 4) Índices UNIQUE: garantia de unicidade (gateway, gateway_reference_id)
-- =============================================================================
-- Se houver duplicatas em (gateway, asaas_payment_id), o backfill já replicou e o UNIQUE falhará;
-- nesse caso tratar duplicatas antes de reexecutar a migration.

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_customer_invoices_gateway_reference
  ON public.customer_invoices (gateway, gateway_reference_id)
  WHERE gateway_reference_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_tenant_billing_gateway_reference
  ON public.tenant_billing (gateway, gateway_reference_id)
  WHERE gateway_reference_id IS NOT NULL;

-- =============================================================================
-- 5) Tabela payment_events: idempotência de webhook + log de decisão
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway TEXT NOT NULL,
  event_id TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ NULL,
  processed_result JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_payment_events_gateway_event_id UNIQUE (gateway, event_id)
);

COMMENT ON TABLE public.payment_events IS 'Eventos de webhook por gateway: idempotência (evitar reprocessar) e log de decisão (processed_result).';
COMMENT ON COLUMN public.payment_events.reference_id IS 'ID do pagamento no gateway (gateway_reference_id). Usado para localizar customer_invoice ou tenant_billing.';
COMMENT ON COLUMN public.payment_events.processed_result IS 'Log de decisão: previous_status, new_status, action, reason (debug e auditoria).';

CREATE INDEX IF NOT EXISTS idx_payment_events_gateway_reference_created
  ON public.payment_events (gateway, reference_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_events_processed
  ON public.payment_events (processed) WHERE processed = false;

-- =============================================================================
-- Validação pós-migration (executar manualmente e conferir que retorna 0 linhas):
-- SELECT 'customer_invoices' AS tbl, id FROM customer_invoices
--   WHERE gateway IS NOT NULL AND asaas_payment_id IS NOT NULL AND (gateway_reference_id IS NULL OR gateway_reference_id != asaas_payment_id)
-- UNION ALL
-- SELECT 'tenant_billing', id FROM tenant_billing
--   WHERE gateway IS NOT NULL AND asaas_payment_id IS NOT NULL AND (gateway_reference_id IS NULL OR gateway_reference_id != asaas_payment_id);
-- Se retornar 0 linhas, backfill está consistente.
