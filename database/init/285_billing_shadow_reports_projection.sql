-- BILLING ENGINE V2 — Sprint 2.3D: colunas de projeção em shadow reports.
ALTER TABLE public.billing_shadow_reports
  ADD COLUMN IF NOT EXISTS projection_duration_ms INT NULL,
  ADD COLUMN IF NOT EXISTS projection_score INT NULL,
  ADD COLUMN IF NOT EXISTS projection_version TEXT NULL,
  ADD COLUMN IF NOT EXISTS projection_engine_version TEXT NULL,
  ADD COLUMN IF NOT EXISTS projection_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS projection_success BOOLEAN NULL;

COMMENT ON COLUMN public.billing_shadow_reports.projection_hash IS
  'SHA-256 determinístico da ProjectedInvoice (Sprint 2.3D).';
