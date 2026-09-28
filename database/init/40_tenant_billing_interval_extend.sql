-- Estender billing_interval em tenant_billing para suportar trimestral e semestral (planos custom)
-- Remove o check antigo (nome pode variar) e adiciona novo com os 4 intervalos
DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'tenant_billing' AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%billing_interval%'
  LIMIT 1;
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.tenant_billing DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE public.tenant_billing
  ADD CONSTRAINT tenant_billing_billing_interval_check
  CHECK (billing_interval IN ('monthly', 'quarterly', 'semi_annual', 'yearly'));

COMMENT ON COLUMN public.tenant_billing.billing_interval IS 'Intervalo de cobrança: monthly, quarterly, semi_annual, yearly';
