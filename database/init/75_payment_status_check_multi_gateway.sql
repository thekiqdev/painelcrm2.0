-- Alinha CHECK de status ao domínio InternalPaymentStatus (8 valores).
-- Ref: docs/ANALISE-CONFORMIDADE-STATUS-E-PLANO-CORRECAO-CHECK.md
-- Não altera colunas, webhook ou persistência; apenas expande o conjunto de status permitidos.

-- 1) customer_invoices: remover CHECK atual de status e criar novo com 8 valores
DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'customer_invoices' AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%status%'
  LIMIT 1;
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.customer_invoices DROP CONSTRAINT IF EXISTS %I', conname);
  END IF;
END $$;

ALTER TABLE public.customer_invoices
  ADD CONSTRAINT customer_invoices_status_check
  CHECK (status IN ('pending', 'waiting_payment', 'processing', 'paid', 'overdue', 'cancelled', 'failed', 'refunded'));

-- 2) tenant_billing: remover CHECK atual de status e criar novo com 8 valores
DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'tenant_billing' AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%status%'
  LIMIT 1;
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.tenant_billing DROP CONSTRAINT IF EXISTS %I', conname);
  END IF;
END $$;

ALTER TABLE public.tenant_billing
  ADD CONSTRAINT tenant_billing_status_check
  CHECK (status IN ('pending', 'waiting_payment', 'processing', 'paid', 'overdue', 'cancelled', 'failed', 'refunded'));
