-- M5-W Sprint 2 — Partner wholesale assign + Platform checkout
-- Plano: PLAN_SPRINTS_M5_W_PARTNER_WHOLESALE.md

ALTER TABLE public.partner_profiles
  ADD COLUMN IF NOT EXISTS wholesale_subscription_id UUID NULL
    REFERENCES public.subscriptions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_partner_profiles_wholesale_subscription
  ON public.partner_profiles (wholesale_subscription_id)
  WHERE wholesale_subscription_id IS NOT NULL;

COMMENT ON COLUMN public.partner_profiles.wholesale_subscription_id IS
  'M5-W: subscription SaaS (Platform) do plano atacado do Partner.';

ALTER TABLE public.tenant_billing DROP CONSTRAINT IF EXISTS tenant_billing_billing_reason_check;
ALTER TABLE public.tenant_billing
  ADD CONSTRAINT tenant_billing_billing_reason_check
  CHECK (
    billing_reason IS NULL
    OR billing_reason IN (
      'plan_purchase',
      'plan_upgrade',
      'plan_renewal',
      'manual_charge',
      'seat_addon',
      'instance_addon',
      'partner_wholesale'
    )
  );

COMMENT ON COLUMN public.tenant_billing.billing_reason IS
  'Motivo: plan_purchase, plan_upgrade, plan_renewal, manual_charge, seat_addon, instance_addon, partner_wholesale';
