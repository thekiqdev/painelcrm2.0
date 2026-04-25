-- Geração antecipada de faturas recorrentes: N dias antes do vencimento do ciclo (next_billing_date).
-- Default 0 = comportamento anterior (enfileirar a partir do dia do vencimento).

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS recurring_invoice_generate_days_before_due INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_recurring_invoice_generate_days_before_due_chk'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_recurring_invoice_generate_days_before_due_chk
      CHECK (
        recurring_invoice_generate_days_before_due >= 0
        AND recurring_invoice_generate_days_before_due <= 60
      );
  END IF;
END $$;

COMMENT ON COLUMN public.tenants.recurring_invoice_generate_days_before_due IS
  'Quantos dias antes de subscriptions.next_billing_date (vencimento do ciclo) o scheduler pode enfileirar a geração. 0 = no dia do vencimento. A fatura continua com due_date = ciclo.';
