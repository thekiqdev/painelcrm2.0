-- Fase 1 — Persistência de preferências de horário da recorrência por tenant.
-- Não altera comportamento do motor ainda; apenas prepara configuração.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS recurring_generate_time_local TIME WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS invoice_notify_same_as_generation BOOLEAN,
  ADD COLUMN IF NOT EXISTS invoice_notify_time_local TIME WITHOUT TIME ZONE;

UPDATE public.tenants
SET recurring_generate_time_local = COALESCE(recurring_generate_time_local, TIME '09:00'),
    invoice_notify_same_as_generation = COALESCE(invoice_notify_same_as_generation, true)
WHERE recurring_generate_time_local IS NULL
   OR invoice_notify_same_as_generation IS NULL;

ALTER TABLE public.tenants
  ALTER COLUMN recurring_generate_time_local SET DEFAULT TIME '09:00',
  ALTER COLUMN recurring_generate_time_local SET NOT NULL,
  ALTER COLUMN invoice_notify_same_as_generation SET DEFAULT true,
  ALTER COLUMN invoice_notify_same_as_generation SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_invoice_notify_time_consistency_chk'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_invoice_notify_time_consistency_chk
      CHECK (
        invoice_notify_same_as_generation = true
        OR invoice_notify_time_local IS NOT NULL
      );
  END IF;
END $$;

COMMENT ON COLUMN public.tenants.recurring_generate_time_local IS
  'Horário local preferencial para geração de recorrência (HH:mm). Fase 1: persistência/config.';
COMMENT ON COLUMN public.tenants.invoice_notify_same_as_generation IS
  'Se true, notificação usa mesmo horário da geração. Fase 1: persistência/config.';
COMMENT ON COLUMN public.tenants.invoice_notify_time_local IS
  'Horário local preferencial de notificação quando separado da geração (HH:mm).';

