-- Fase 5 (E2): fatura filha por item (cobrar em outra data) + vínculo pai ↔ item de origem.
-- Compatível com produção: colunas opcionais + ajuste do índice único (subscription, period_start).

-- 1) Colunas de vínculo
ALTER TABLE public.customer_invoices
  ADD COLUMN IF NOT EXISTS parent_invoice_id UUID NULL REFERENCES public.customer_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_invoice_item_id UUID NULL REFERENCES public.customer_invoice_items(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.customer_invoices.parent_invoice_id IS 'Fatura pai (E2) quando esta é filha gerada por item com scheduled_due_date.';
COMMENT ON COLUMN public.customer_invoices.parent_invoice_item_id IS 'Linha do item na fatura pai que originou esta fatura filha.';

-- 2) Tipo de fatura: incluir "child"
ALTER TABLE public.customer_invoices
  DROP CONSTRAINT IF EXISTS customer_invoices_invoice_type_check;
ALTER TABLE public.customer_invoices
  ADD CONSTRAINT customer_invoices_invoice_type_check
  CHECK (invoice_type IN ('recurring', 'manual', 'child'));

-- 3) Índice único (subscription_id, period_start) só para faturas "de ciclo" (não filhas)
DROP INDEX IF EXISTS public.idx_customer_invoices_subscription_period;
CREATE UNIQUE INDEX idx_customer_invoices_subscription_period
  ON public.customer_invoices (subscription_id, period_start)
  WHERE subscription_id IS NOT NULL
    AND period_start IS NOT NULL
    AND parent_invoice_id IS NULL;

-- 4) Idempotência: uma fatura filha por item de origem + data de vencimento
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_invoices_parent_item_due
  ON public.customer_invoices (parent_invoice_item_id, due_date)
  WHERE parent_invoice_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_invoices_parent_invoice_id
  ON public.customer_invoices (parent_invoice_id)
  WHERE parent_invoice_id IS NOT NULL;
