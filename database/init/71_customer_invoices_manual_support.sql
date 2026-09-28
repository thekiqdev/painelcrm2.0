-- Customer Billing: suporte a faturas manuais (subscription_id NULL, origin, invoice_type, etc.).
-- Ref: docs/PLANO-CUSTOMER-BILLING-FATURAS-TENANT.md, docs/VALIDACAO-FINAL-PRE-IMPLEMENTACAO-CUSTOMER-BILLING.md
-- Ordem segura: colunas → NULLs → CHECKs → índice parcial → UNIQUE(invoice_number) → índices → RLS.

-- 1) Novas colunas (DEFAULTs para NOT NULL)
ALTER TABLE public.customer_invoices
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'subscription',
  ADD COLUMN IF NOT EXISTS invoice_type TEXT NOT NULL DEFAULT 'recurring',
  ADD COLUMN IF NOT EXISTS description TEXT NULL;

-- 2) Permitir NULL em subscription_id, period_start, period_end (faturas manuais)
ALTER TABLE public.customer_invoices
  ALTER COLUMN subscription_id DROP NOT NULL,
  ALTER COLUMN period_start DROP NOT NULL,
  ALTER COLUMN period_end DROP NOT NULL;

-- 3) Ajustar CHECK de status (alinhar a 75_payment_status_check_multi_gateway.sql: 8 valores internos)
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
    EXECUTE format('ALTER TABLE public.customer_invoices DROP CONSTRAINT %I', conname);
  END IF;
END $$;

-- Dados legados / fora do domínio (ex.: valores de 75 ou inserts sem CHECK) → pending
UPDATE public.customer_invoices
SET status = 'pending'
WHERE status IS NULL
   OR btrim(status::text) = ''
   OR lower(btrim(status::text)) NOT IN (
     'pending', 'waiting_payment', 'processing', 'paid', 'overdue',
     'cancelled', 'failed', 'refunded'
   );

-- Canonicalizar capitalização para o CHECK literal (ex.: Paid → paid)
UPDATE public.customer_invoices
SET status = lower(btrim(status::text))
WHERE status IS NOT NULL
  AND lower(btrim(status::text)) IN (
    'pending', 'waiting_payment', 'processing', 'paid', 'overdue',
    'cancelled', 'failed', 'refunded'
  )
  AND status <> lower(btrim(status::text));

ALTER TABLE public.customer_invoices
  ADD CONSTRAINT customer_invoices_status_check
  CHECK (status IN ('pending', 'waiting_payment', 'processing', 'paid', 'overdue', 'cancelled', 'failed', 'refunded'));

-- 4) CHECK de origin e invoice_type
ALTER TABLE public.customer_invoices
  DROP CONSTRAINT IF EXISTS customer_invoices_origin_check;
ALTER TABLE public.customer_invoices
  ADD CONSTRAINT customer_invoices_origin_check
  CHECK (origin IN ('manual', 'subscription', 'api', 'import'));

ALTER TABLE public.customer_invoices
  DROP CONSTRAINT IF EXISTS customer_invoices_invoice_type_check;
ALTER TABLE public.customer_invoices
  ADD CONSTRAINT customer_invoices_invoice_type_check
  CHECK (invoice_type IN ('recurring', 'manual'));

-- 5) Consistência: origin = 'subscription' ⇔ subscription_id IS NOT NULL
ALTER TABLE public.customer_invoices
  DROP CONSTRAINT IF EXISTS customer_invoices_origin_subscription_consistency;
ALTER TABLE public.customer_invoices
  ADD CONSTRAINT customer_invoices_origin_subscription_consistency
  CHECK (
    (origin = 'subscription' AND subscription_id IS NOT NULL)
    OR (origin IN ('manual', 'api', 'import') AND subscription_id IS NULL)
  );

-- 6) Índice único parcial (subscription_id, period_start) apenas para recorrência
DROP INDEX IF EXISTS public.idx_customer_invoices_subscription_period;
CREATE UNIQUE INDEX idx_customer_invoices_subscription_period
  ON public.customer_invoices (subscription_id, period_start)
  WHERE subscription_id IS NOT NULL;

-- 7) Garantir unicidade de invoice_number antes de ADD UNIQUE
-- 7a) Preencher NULLs com valor único
UPDATE public.customer_invoices
SET invoice_number = 'CINV-LEGACY-' || id
WHERE invoice_number IS NULL;

-- 7b) Desduplicar: manter uma linha por invoice_number (a de menor id), demais recebem sufixo único
UPDATE public.customer_invoices ci
SET invoice_number = 'CINV-LEGACY-' || ci.id
WHERE ci.invoice_number IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.customer_invoices ci2
    WHERE ci2.invoice_number = ci.invoice_number AND ci2.id < ci.id
  );

-- 7c) UNIQUE global em invoice_number
ALTER TABLE public.customer_invoices
  DROP CONSTRAINT IF EXISTS customer_invoices_invoice_number_key;
ALTER TABLE public.customer_invoices
  ADD CONSTRAINT customer_invoices_invoice_number_key UNIQUE (invoice_number);

-- 8) Índice para lookup do webhook (gateway + asaas_payment_id) — só se a coluna existir (tabela pode ter sido criada antes de 70 com asaas_*)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customer_invoices' AND column_name = 'asaas_payment_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_customer_invoices_gateway_asaas_payment_id
      ON public.customer_invoices (gateway, asaas_payment_id)
      WHERE gateway IS NOT NULL AND asaas_payment_id IS NOT NULL;
  END IF;
END $$;

-- 9) Índice para listagem "últimas faturas" do dashboard (tenant_id + created_at DESC)
CREATE INDEX IF NOT EXISTS idx_customer_invoices_tenant_created_at
  ON public.customer_invoices (tenant_id, created_at DESC);

-- 10) RLS: isolamento por tenant_id (mesmo padrão de tenant_billing)
ALTER TABLE public.customer_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_invoices_tenant_policy ON public.customer_invoices;
CREATE POLICY customer_invoices_tenant_policy ON public.customer_invoices
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

COMMENT ON COLUMN public.customer_invoices.origin IS 'Origem da fatura: manual (painel), subscription (Billing Engine), api, import.';
COMMENT ON COLUMN public.customer_invoices.invoice_type IS 'Tipo semântico para analytics: recurring ou manual.';
COMMENT ON TABLE public.customer_invoices IS 'Faturas dos clientes do CRM: recorrentes (Billing Engine) ou manuais (tenant cria no painel).';
