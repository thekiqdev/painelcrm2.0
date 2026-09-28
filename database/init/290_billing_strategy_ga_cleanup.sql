-- Billing Engine 3.0 — Sprint 3.2B: remove deprecated billing_strategy default/enum value.
-- Existing rows with legacy_invoice_copy remain valid until manually migrated.

ALTER TABLE public.billing_plans DROP CONSTRAINT IF EXISTS billing_plans_billing_strategy_check;

ALTER TABLE public.billing_plans
  ALTER COLUMN billing_strategy SET DEFAULT 'billing_plan_items';

ALTER TABLE public.billing_plans
  ADD CONSTRAINT billing_plans_billing_strategy_check
  CHECK (billing_strategy IN ('billing_plan_items', 'mixed', 'future'));

COMMENT ON COLUMN public.billing_plans.billing_strategy IS
  'Billing Engine 3.0 — billing_plan_items (GA). legacy_invoice_copy removed from CHECK (Sprint 3.2B).';
