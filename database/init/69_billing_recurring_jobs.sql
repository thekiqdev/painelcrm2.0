-- Billing Engine Fase 1: tabela de jobs de recorrência (scheduler enfileira, worker processa).
-- Ref: docs/PLANO-BILLING-ENGINE-RECORRENCIA.md

CREATE TABLE IF NOT EXISTS public.billing_recurring_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL DEFAULT 'renewal' CHECK (job_type IN ('renewal', 'retry_payment', 'cancel_subscription', 'sync_gateway', 'send_invoice_email')),
  cycle_key TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  retry_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  locked_at TIMESTAMPTZ NULL,
  locked_by TEXT NULL,
  result_invoice_id UUID NULL,
  result_invoice_type TEXT NULL CHECK (result_invoice_type IS NULL OR result_invoice_type IN ('tenant_billing', 'customer_invoice')),
  error_message TEXT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(subscription_id, cycle_key)
);

CREATE INDEX IF NOT EXISTS idx_billing_recurring_jobs_status_scheduled_retry
  ON public.billing_recurring_jobs(status, scheduled_at, retry_at);

CREATE INDEX IF NOT EXISTS idx_billing_recurring_jobs_tenant_id
  ON public.billing_recurring_jobs(tenant_id);

COMMENT ON TABLE public.billing_recurring_jobs IS 'Jobs de cobrança recorrente: scheduler insere (LIMIT 500/run), worker processa com FOR UPDATE SKIP LOCKED.';
