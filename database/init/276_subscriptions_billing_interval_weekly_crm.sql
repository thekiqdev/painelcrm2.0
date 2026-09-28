-- Sprint S1: periodicidade semanal em assinaturas CRM (subscriptions.billing_interval).
-- Não altera tenant_billing, plan_interval_prices nem plans.

DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'subscriptions' AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%billing_interval%'
  LIMIT 1;
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.subscriptions DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_billing_interval_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_billing_interval_check
  CHECK (billing_interval IN ('weekly', 'monthly', 'quarterly', 'semi_annual', 'yearly'));

COMMENT ON COLUMN public.subscriptions.billing_interval IS
  'Intervalo de cobrança: weekly (CRM), monthly, quarterly, semi_annual, yearly';
