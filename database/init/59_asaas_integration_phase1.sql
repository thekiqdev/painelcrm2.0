-- Fase 1 — Integração Asaas: colunas e tabelas para customer, cobrança, webhook e tenant_billing.
-- Escopo v1: criação de customer, cobrança avulsa, webhook de pagamento, ativação de plano, registro em tenant_billing.

-- 1) Tenants: vínculo com cliente Asaas
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_asaas_customer_id
  ON public.tenants(asaas_customer_id)
  WHERE asaas_customer_id IS NOT NULL;

COMMENT ON COLUMN public.tenants.asaas_customer_id IS 'ID do customer no Asaas (quando integração ativa); usado para criar cobranças.';

-- 2) Tenant_billing: gateway, método de pagamento, IDs Asaas, período (opcional v1)
ALTER TABLE public.tenant_billing
  ADD COLUMN IF NOT EXISTS gateway TEXT NOT NULL DEFAULT 'asaas',
  ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('PIX', 'BOLETO', 'CREDIT_CARD')),
  ADD COLUMN IF NOT EXISTS asaas_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS asaas_status TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE;

-- Índice para lookup no webhook (buscar billing por gateway + asaas_payment_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_billing_gateway_asaas_payment_id
  ON public.tenant_billing(gateway, asaas_payment_id)
  WHERE gateway = 'asaas' AND asaas_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_billing_idempotency_key
  ON public.tenant_billing(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.tenant_billing.gateway IS 'Gateway de pagamento (ex.: asaas, stripe); permite múltiplos no futuro.';
COMMENT ON COLUMN public.tenant_billing.payment_method IS 'Forma de pagamento: PIX, BOLETO ou CREDIT_CARD.';
COMMENT ON COLUMN public.tenant_billing.asaas_payment_id IS 'ID do pagamento no Asaas; usado no webhook para atualizar status.';
COMMENT ON COLUMN public.tenant_billing.asaas_status IS 'Espelho do status no Asaas (pending, received, confirmed, overdue, refunded, etc.).';
COMMENT ON COLUMN public.tenant_billing.idempotency_key IS 'Chave de idempotência para evitar cobrança duplicada.';
COMMENT ON COLUMN public.tenant_billing.period_start IS 'Início do período cobrado (opcional na v1; futuro: billing mensal/anual).';
COMMENT ON COLUMN public.tenant_billing.period_end IS 'Fim do período cobrado (opcional na v1).';

-- 3) Tabela de eventos de webhook Asaas (idempotência, retry e replay)
CREATE TABLE IF NOT EXISTS public.asaas_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payment_id TEXT,
  payload_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_asaas_webhook_events_event_id ON public.asaas_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_asaas_webhook_events_payment_id ON public.asaas_webhook_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_asaas_webhook_events_status ON public.asaas_webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_asaas_webhook_events_payload_hash ON public.asaas_webhook_events(payload_hash) WHERE payload_hash IS NOT NULL;

COMMENT ON TABLE public.asaas_webhook_events IS 'Eventos de webhook do Asaas processados; idempotência por event_id e payload_hash (evita replay).';
