-- Fase 1 — Painel de Gateways (PLANO-EVOLUCAO-PAYMENT-GATEWAYS-PANEL)
-- Banco de dados: novas colunas, índices e tabela payment_customers.
-- Sem mudança de comportamento da aplicação.

-- =============================================================================
-- 1) Novas colunas em payment_gateway_configs
-- =============================================================================

ALTER TABLE public.payment_gateway_configs
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE public.payment_gateway_configs
  ADD COLUMN IF NOT EXISTS last_connection_test_at TIMESTAMPTZ NULL;

ALTER TABLE public.payment_gateway_configs
  ADD COLUMN IF NOT EXISTS last_connection_status TEXT NULL;

-- Constraint: valores permitidos para status (pending, active, error, disabled)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_gateway_configs_status_check'
  ) THEN
    ALTER TABLE public.payment_gateway_configs
      ADD CONSTRAINT payment_gateway_configs_status_check
      CHECK (status IN ('pending', 'active', 'error', 'disabled'));
  END IF;
END $$;

-- Constraint: valores permitidos para last_connection_status (ok, auth_error, error)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_gateway_configs_last_connection_status_check'
  ) THEN
    ALTER TABLE public.payment_gateway_configs
      ADD CONSTRAINT payment_gateway_configs_last_connection_status_check
      CHECK (last_connection_status IS NULL OR last_connection_status IN ('ok', 'auth_error', 'error'));
  END IF;
END $$;

COMMENT ON COLUMN public.payment_gateway_configs.status IS 'Estado da config: pending (nunca testado), active (ok), error (falha), disabled (desligado).';
COMMENT ON COLUMN public.payment_gateway_configs.last_connection_test_at IS 'Data/hora do último teste de conexão.';
COMMENT ON COLUMN public.payment_gateway_configs.last_connection_status IS 'Resultado do último teste: ok, auth_error, error.';

-- =============================================================================
-- 2) Backfill: configs existentes com credenciais → status = 'active'
-- =============================================================================

UPDATE public.payment_gateway_configs
SET status = 'active'
WHERE status = 'pending'
  AND credentials IS NOT NULL
  AND credentials != '{}'::jsonb
  AND COALESCE(credentials->>'api_key', '') != '';

-- =============================================================================
-- 3) Índices para o Resolver (performance com muitos tenants)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_pg_configs_tenant
  ON public.payment_gateway_configs (tenant_id);

-- gateway_key já possui idx_payment_gateway_configs_gateway_key no 60; criamos
-- idx_pg_configs_gateway para alinhar ao plano (uso opcional).
CREATE INDEX IF NOT EXISTS idx_pg_configs_gateway
  ON public.payment_gateway_configs (gateway_key);

CREATE INDEX IF NOT EXISTS idx_pg_configs_active
  ON public.payment_gateway_configs (tenant_id, gateway_key)
  WHERE status = 'active';

-- =============================================================================
-- 4) Tabela payment_customers (vínculo tenant ↔ cliente no gateway)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  gateway_key TEXT NOT NULL,
  gateway_customer_id TEXT NOT NULL,
  external_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, gateway_key)
);

COMMENT ON TABLE public.payment_customers IS 'Vínculo tenant ↔ cliente no gateway; evita consultar a API do gateway em todo ensureCustomer.';
COMMENT ON COLUMN public.payment_customers.external_reference IS 'Valor enviado ao gateway (ex.: tenant_id) para resolver tenant no webhook.';

CREATE INDEX IF NOT EXISTS idx_payment_customers_tenant_gateway
  ON public.payment_customers (tenant_id, gateway_key);
