-- Auditoria do motor de recovery / auto-healing (Fase 3). Não altera regras financeiras.

CREATE TABLE IF NOT EXISTS public.billing_recovery_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT NULL,
  entity_id TEXT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT true,
  detail JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_recovery_audit_run_created
  ON public.billing_recovery_audit (run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_recovery_audit_action_created
  ON public.billing_recovery_audit (action_type, created_at DESC);

COMMENT ON TABLE public.billing_recovery_audit IS
  'Registo de scans e reparações leves do billing recovery engine (superadmin / cron).';
