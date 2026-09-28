-- Fase 5 — Eventos de webhook para debug (PLANO-EVOLUCAO-PAYMENT-GATEWAYS-PANEL)
-- Tabela genérica para listar últimos eventos (GET .../payments/webhooks/events).

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_key TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload_summary JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  external_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gateway_key, event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_gateway_created
  ON public.payment_webhook_events (gateway_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_external_ref
  ON public.payment_webhook_events (external_reference) WHERE external_reference IS NOT NULL;

COMMENT ON TABLE public.payment_webhook_events IS 'Eventos de webhook por gateway para listagem/debug (GET .../payments/webhooks/events).';
COMMENT ON COLUMN public.payment_webhook_events.external_reference IS 'Ex.: tenant_id extraído do payload para filtro por tenant.';
