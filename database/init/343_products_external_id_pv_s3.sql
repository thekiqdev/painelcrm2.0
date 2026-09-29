-- PV Sprint 3 — external_id no produto pai (upsert import Woo)

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS external_id TEXT;

COMMENT ON COLUMN public.products.external_id IS
  'ID externo (ex.: WooCommerce ID) para reimport/upsert';

CREATE INDEX IF NOT EXISTS idx_products_external_id
  ON public.products (external_id)
  WHERE external_id IS NOT NULL;

-- Único por dono quando preenchido
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_user_external_id
  ON public.products (user_id, external_id)
  WHERE external_id IS NOT NULL AND btrim(external_id) <> '';
