-- BILLING ENGINE V2 — Sprint 2.3G: Cutover Orchestrator reports (READ ONLY audit).
CREATE TABLE IF NOT EXISTS public.billing_cutover_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  correlation_id TEXT NULL,
  approved BOOLEAN NOT NULL DEFAULT false,
  approval_level TEXT NOT NULL DEFAULT 'NOT_READY',
  recommendation TEXT NOT NULL DEFAULT 'KEEP_V1',
  overall_score INT NOT NULL DEFAULT 0 CHECK (overall_score >= 0 AND overall_score <= 100),
  blocking_issues_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  readiness_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  simulator_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  projection_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  consistency_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  shadow_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_ms INT NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.billing_cutover_reports IS
  'Decisão de cutover Billing V2 por tenant — orquestração READ ONLY, TTL 90 dias.';

CREATE INDEX IF NOT EXISTS idx_billing_cutover_reports_tenant_generated
  ON public.billing_cutover_reports(tenant_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_cutover_reports_generated
  ON public.billing_cutover_reports(generated_at DESC);
