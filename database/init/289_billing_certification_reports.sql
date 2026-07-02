-- BILLING ENGINE V2 — Sprint 2.4A: Certification Suite reports (READ ONLY audit).
CREATE TABLE IF NOT EXISTS public.billing_certification_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  correlation_id TEXT NULL,
  certification_score INT NOT NULL DEFAULT 0 CHECK (certification_score >= 0 AND certification_score <= 100),
  certified BOOLEAN NOT NULL DEFAULT false,
  recommendation TEXT NOT NULL DEFAULT 'NOT_CERTIFIED',
  projection_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  consistency_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  shadow_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  readiness_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  simulator_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  cutover_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  failures_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  execution_time_ms INT NOT NULL DEFAULT 0,
  certified_at TIMESTAMPTZ NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.billing_certification_reports IS
  'Certificação Billing V2 por assinatura — orquestração READ ONLY, TTL 90 dias.';

CREATE INDEX IF NOT EXISTS idx_billing_certification_reports_subscription_generated
  ON public.billing_certification_reports(subscription_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_certification_reports_tenant_generated
  ON public.billing_certification_reports(tenant_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_certification_reports_generated
  ON public.billing_certification_reports(generated_at DESC);
