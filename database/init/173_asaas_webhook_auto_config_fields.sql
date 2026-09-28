-- Integração Asaas automática: metadados do webhook por tenant/gateway.

ALTER TABLE public.payment_gateway_configs
  ADD COLUMN IF NOT EXISTS webhook_id TEXT;

ALTER TABLE public.payment_gateway_configs
  ADD COLUMN IF NOT EXISTS webhook_auth_token TEXT;

ALTER TABLE public.payment_gateway_configs
  ADD COLUMN IF NOT EXISTS webhook_status TEXT;

ALTER TABLE public.payment_gateway_configs
  ADD COLUMN IF NOT EXISTS webhook_url TEXT;

ALTER TABLE public.payment_gateway_configs
  ADD COLUMN IF NOT EXISTS webhook_email TEXT;

ALTER TABLE public.payment_gateway_configs
  ADD COLUMN IF NOT EXISTS webhook_events JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.payment_gateway_configs
  ADD COLUMN IF NOT EXISTS last_webhook_received_at TIMESTAMPTZ;

ALTER TABLE public.payment_gateway_configs
  ADD COLUMN IF NOT EXISTS last_webhook_error TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_gateway_configs_webhook_status_check'
  ) THEN
    ALTER TABLE public.payment_gateway_configs
      ADD CONSTRAINT payment_gateway_configs_webhook_status_check
      CHECK (webhook_status IS NULL OR webhook_status IN ('created', 'pending', 'error'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pg_configs_tenant_gateway_webhook
  ON public.payment_gateway_configs (tenant_id, gateway_key, webhook_id);

