-- BILLING ENGINE V2 — Sprint 2.3E: Migration Readiness reports (READ ONLY audit).
CREATE TABLE IF NOT EXISTS public.billing_migration_readiness_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  overall_score INT NOT NULL DEFAULT 0 CHECK (overall_score >= 0 AND overall_score <= 100),
  approved BOOLEAN NOT NULL DEFAULT false,
  approval_level TEXT NOT NULL DEFAULT 'NOT_READY',
  recommendation TEXT NOT NULL DEFAULT 'WAIT_NEXT_CYCLE',
  blocking_issues_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  statistics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  shadow_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  projection_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  consistency_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  engine_health_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.billing_migration_readiness_reports IS
  'Avaliação de prontidão para migração Billing V2 por tenant — TTL 90 dias.';

CREATE INDEX IF NOT EXISTS idx_billing_migration_readiness_tenant_generated
  ON public.billing_migration_readiness_reports(tenant_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_migration_readiness_generated
  ON public.billing_migration_readiness_reports(generated_at DESC);
