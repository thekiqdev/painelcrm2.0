-- BILLING ENGINE V2 — Sprint 2.3F: Migration Simulation reports (READ ONLY audit).
CREATE TABLE IF NOT EXISTS public.billing_migration_simulation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id UUID NULL REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  cycle_key TEXT NULL,
  correlation_id TEXT NULL,
  overall_score INT NOT NULL DEFAULT 0 CHECK (overall_score >= 0 AND overall_score <= 100),
  recommendation TEXT NOT NULL DEFAULT 'REQUIRES_REVIEW',
  risk TEXT NOT NULL DEFAULT 'MEDIUM',
  rollback_safe BOOLEAN NOT NULL DEFAULT true,
  projection_hash TEXT NULL,
  simulation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  impact_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_ms INT NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.billing_migration_simulation_reports IS
  'Simulação de migração Billing V2 por tenant — TTL 90 dias.';

CREATE INDEX IF NOT EXISTS idx_billing_migration_simulation_tenant_generated
  ON public.billing_migration_simulation_reports(tenant_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_migration_simulation_subscription
  ON public.billing_migration_simulation_reports(subscription_id, generated_at DESC);
