-- BILLING ENGINE V2 — Sprint 2.2A: Billing Item versioning & snapshot foundation.
-- Motor legado inalterado; sem leitura em produção.

ALTER TABLE public.billing_plan_items
  ADD COLUMN IF NOT EXISTS definition_hash TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS item_revision INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS effective_until DATE NULL,
  ADD COLUMN IF NOT EXISTS created_from_revision INT NULL,
  ADD COLUMN IF NOT EXISTS superseded_by_revision INT NULL,
  ADD COLUMN IF NOT EXISTS snapshot_strategy TEXT NOT NULL DEFAULT 'invoice_snapshot';

-- Backfill effective_from para linhas existentes
UPDATE public.billing_plan_items
SET effective_from = COALESCE(starts_at, (created_at AT TIME ZONE 'UTC')::date, CURRENT_DATE);

ALTER TABLE public.billing_plan_items DROP CONSTRAINT IF EXISTS billing_plan_items_plan_sequence_unique;

ALTER TABLE public.billing_plan_items DROP CONSTRAINT IF EXISTS billing_plan_items_item_revision_check;
ALTER TABLE public.billing_plan_items
  ADD CONSTRAINT billing_plan_items_item_revision_check
  CHECK (item_revision >= 1);

ALTER TABLE public.billing_plan_items DROP CONSTRAINT IF EXISTS billing_plan_items_snapshot_strategy_check;
ALTER TABLE public.billing_plan_items
  ADD CONSTRAINT billing_plan_items_snapshot_strategy_check
  CHECK (snapshot_strategy IN ('invoice_snapshot', 'logical_snapshot', 'future'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_plan_items_plan_sequence_revision
  ON public.billing_plan_items(billing_plan_id, sequence, item_revision);

CREATE INDEX IF NOT EXISTS idx_billing_plan_items_definition_hash
  ON public.billing_plan_items(definition_hash);

CREATE INDEX IF NOT EXISTS idx_billing_plan_items_effective_from
  ON public.billing_plan_items(effective_from);

CREATE INDEX IF NOT EXISTS idx_billing_plan_items_effective_until
  ON public.billing_plan_items(effective_until);

CREATE INDEX IF NOT EXISTS idx_billing_plan_items_item_revision
  ON public.billing_plan_items(item_revision);

COMMENT ON COLUMN public.billing_plan_items.definition_hash IS
  'SHA-256 determinístico da definição estrutural; muda quando regra de cobrança muda.';
COMMENT ON COLUMN public.billing_plan_items.item_revision IS
  'Revisão do item dentro do mesmo Billing Plan (sem novo plano).';
COMMENT ON COLUMN public.billing_plan_items.snapshot_strategy IS
  'Estratégia de snapshot lógico: invoice_snapshot | logical_snapshot | future.';
