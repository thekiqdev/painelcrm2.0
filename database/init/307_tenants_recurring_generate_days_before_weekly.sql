-- Sprint 5.1: antecipação de geração separada para assinaturas weekly.
-- NULL = herda tenants.recurring_invoice_generate_days_before_due (comportamento anterior).

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS recurring_invoice_generate_days_before_due_weekly INTEGER NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_recurring_invoice_generate_days_before_due_weekly_chk'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_recurring_invoice_generate_days_before_due_weekly_chk
      CHECK (
        recurring_invoice_generate_days_before_due_weekly IS NULL
        OR (
          recurring_invoice_generate_days_before_due_weekly >= 0
          AND recurring_invoice_generate_days_before_due_weekly <= 60
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.tenants.recurring_invoice_generate_days_before_due_weekly IS
  'Dias antes do vencimento para enfileirar renovação de assinaturas weekly. NULL = herda recurring_invoice_generate_days_before_due. Efetivo ainda limitado pelo cap do intervalo (máx. 6).';
