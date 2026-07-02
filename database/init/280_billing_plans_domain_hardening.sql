-- BILLING ENGINE V2 — Sprint 2.1A: domain hardening (Billing Plan).
-- Colunas estruturais; motor legado inalterado.

CREATE SEQUENCE IF NOT EXISTS billing_plan_number_seq START 1;

ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS plan_number TEXT,
  ADD COLUMN IF NOT EXISTS created_from TEXT NOT NULL DEFAULT 'subscription',
  ADD COLUMN IF NOT EXISTS engine_version TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS billing_strategy TEXT NOT NULL DEFAULT 'legacy_invoice_copy',
  ADD COLUMN IF NOT EXISTS plan_revision INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS plan_state TEXT NOT NULL DEFAULT 'draft';

-- Backfill plan_number para linhas existentes (se houver)
DO $$
DECLARE
  r RECORD;
  seq_val BIGINT;
BEGIN
  FOR r IN SELECT id FROM public.billing_plans WHERE plan_number IS NULL LOOP
    seq_val := nextval('billing_plan_number_seq');
    UPDATE public.billing_plans
    SET plan_number = 'BP-' || lpad(seq_val::text, 8, '0')
    WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.billing_plans
  ALTER COLUMN plan_number SET NOT NULL;

ALTER TABLE public.billing_plans DROP CONSTRAINT IF EXISTS billing_plans_created_from_check;
ALTER TABLE public.billing_plans
  ADD CONSTRAINT billing_plans_created_from_check
  CHECK (created_from IN ('subscription', 'checkout', 'manual', 'api', 'import', 'migration'));

ALTER TABLE public.billing_plans DROP CONSTRAINT IF EXISTS billing_plans_engine_version_check;
ALTER TABLE public.billing_plans
  ADD CONSTRAINT billing_plans_engine_version_check
  CHECK (engine_version IN ('v1', 'v2', 'future'));

ALTER TABLE public.billing_plans DROP CONSTRAINT IF EXISTS billing_plans_billing_strategy_check;
ALTER TABLE public.billing_plans
  ADD CONSTRAINT billing_plans_billing_strategy_check
  CHECK (billing_strategy IN ('legacy_invoice_copy', 'billing_plan_items', 'mixed', 'future'));

ALTER TABLE public.billing_plans DROP CONSTRAINT IF EXISTS billing_plans_plan_revision_check;
ALTER TABLE public.billing_plans
  ADD CONSTRAINT billing_plans_plan_revision_check
  CHECK (plan_revision >= 1);

ALTER TABLE public.billing_plans DROP CONSTRAINT IF EXISTS billing_plans_plan_state_check;
ALTER TABLE public.billing_plans
  ADD CONSTRAINT billing_plans_plan_state_check
  CHECK (plan_state IN ('draft', 'running', 'paused', 'expired', 'completed', 'cancelled'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_plans_plan_number
  ON public.billing_plans(plan_number);

CREATE INDEX IF NOT EXISTS idx_billing_plans_subscription_version_revision
  ON public.billing_plans(subscription_id, version DESC, plan_revision DESC);

COMMENT ON COLUMN public.billing_plans.plan_number IS 'Identificador global BP-00000001; nunca reutilizado.';
COMMENT ON COLUMN public.billing_plans.plan_revision IS 'Ajustes menores dentro da mesma version estrutural.';
COMMENT ON COLUMN public.billing_plans.plan_state IS 'Estado operacional; independente de status (lifecycle).';
