-- Billing Engine Fase 1: tabela universal de assinaturas (saas | customer).
-- Ref: docs/PLANO-BILLING-ENGINE-RECORRENCIA.md

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('saas', 'customer')),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NULL,
  plan_id UUID NULL REFERENCES public.plans(id) ON DELETE SET NULL,
  amount_cents INT NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  billing_anchor_day SMALLINT NULL CHECK (billing_anchor_day IS NULL OR (billing_anchor_day >= 1 AND billing_anchor_day <= 31)),
  billing_cycle_count INT DEFAULT 0,
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'quarterly', 'semi_annual', 'yearly')),
  status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing', 'paused')),
  next_billing_date DATE NOT NULL,
  current_period_start DATE NULL,
  current_period_end DATE NULL,
  grace_period_days INT DEFAULT 3,
  default_payment_method TEXT NULL,
  users_count INT NULL,
  gateway TEXT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false,
  cancelled_at TIMESTAMPTZ NULL,
  metadata JSONB NULL,
  created_by TEXT NULL,
  last_job_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status_next_billing
  ON public.subscriptions(status, next_billing_date)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_currency
  ON public.subscriptions(tenant_id, currency);

CREATE INDEX IF NOT EXISTS idx_subscriptions_type_tenant
  ON public.subscriptions(type, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_saas_active_tenant
  ON public.subscriptions(tenant_id)
  WHERE type = 'saas' AND status = 'active';

COMMENT ON TABLE public.subscriptions IS 'Assinaturas recorrentes: saas (plano do sistema) ou customer (faturas dos clientes do CRM). Billing Engine universal.';
