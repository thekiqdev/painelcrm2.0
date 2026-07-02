-- BILLING ENGINE V2 — Sprint 2.3B: Billing Consistency Validator reports.
-- Somente auditoria; motor V1 inalterado.

CREATE TABLE IF NOT EXISTS public.billing_consistency_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id UUID NULL REFERENCES public.billing_plans(id) ON DELETE SET NULL,
  confidence INT NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 100),
  score INT NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  approved BOOLEAN NOT NULL DEFAULT false,
  checks_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  errors_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  execution_ms INT NOT NULL DEFAULT 0,
  correlation_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.billing_consistency_reports IS
  'Auditoria de consistência Billing Plan + Items (Sprint 2.3B). TTL via limpeza operacional.';

CREATE INDEX IF NOT EXISTS idx_billing_consistency_reports_subscription_created
  ON public.billing_consistency_reports(subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_consistency_reports_tenant_created
  ON public.billing_consistency_reports(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_consistency_reports_plan_id
  ON public.billing_consistency_reports(plan_id);

-- Shadow reports: anexar resultado de consistência (não bloqueia shadow).
ALTER TABLE public.billing_shadow_reports
  ADD COLUMN IF NOT EXISTS consistency_failed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consistency_confidence INT NULL,
  ADD COLUMN IF NOT EXISTS consistency_reason TEXT NULL;
