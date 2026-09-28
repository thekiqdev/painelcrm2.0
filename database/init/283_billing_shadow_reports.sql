-- BILLING ENGINE V2 — Sprint 2.3: Shadow Mode audit reports.
-- Somente auditoria; motor V1 permanece fonte oficial.

CREATE TABLE IF NOT EXISTS public.billing_shadow_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  cycle_key TEXT NOT NULL,
  correlation_id TEXT NULL,
  comparison_score INT NOT NULL DEFAULT 0 CHECK (comparison_score >= 0 AND comparison_score <= 100),
  approved BOOLEAN NOT NULL DEFAULT false,
  summary TEXT NOT NULL DEFAULT '',
  differences_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  legacy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  shadow_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  engine_versions JSONB NOT NULL DEFAULT '{}'::jsonb,
  execution_failed BOOLEAN NOT NULL DEFAULT false,
  error_code TEXT NULL,
  duration_ms INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.billing_shadow_reports IS
  'Auditoria Shadow Mode — comparação Motor V1 vs Billing Plan V2 (READ ONLY). TTL via job de limpeza.';

CREATE INDEX IF NOT EXISTS idx_billing_shadow_reports_subscription_created
  ON public.billing_shadow_reports(subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_shadow_reports_tenant_created
  ON public.billing_shadow_reports(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_shadow_reports_cycle_key
  ON public.billing_shadow_reports(cycle_key);
