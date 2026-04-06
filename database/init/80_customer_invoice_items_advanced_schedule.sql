-- Fase 5 (base estrutural): opções avançadas por item de fatura.
-- Compatível com produção: apenas colunas opcionais, sem quebra de fluxo atual.

ALTER TABLE public.customer_invoice_items
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS recurring_interval TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_due_date DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customer_invoice_items_recurring_interval_check'
  ) THEN
    ALTER TABLE public.customer_invoice_items
      ADD CONSTRAINT customer_invoice_items_recurring_interval_check
      CHECK (
        recurring_interval IS NULL
        OR recurring_interval IN ('daily', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'yearly')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.customer_invoice_items.is_recurring IS
  'Se o item participa dos próximos ciclos da recorrência (base Fase 5).';
COMMENT ON COLUMN public.customer_invoice_items.recurring_interval IS
  'Intervalo recorrente futuro por item (fase estrutural, sem job ativo).';
COMMENT ON COLUMN public.customer_invoice_items.scheduled_due_date IS
  'Data planejada para cobrança futura do item (fase estrutural, sem geração automática).';
