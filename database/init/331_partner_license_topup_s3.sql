-- M5-W Sprint 3 — Partner license top-up (one-shot Platform billing)
-- Plano: PLAN_SPRINTS_M5_W_PARTNER_WHOLESALE.md

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
      'partner_wholesale',
      'partner_license_topup'
    )
  );

COMMENT ON COLUMN public.tenant_billing.billing_reason IS
  'Motivo: plan_purchase, plan_upgrade, plan_renewal, manual_charge, seat_addon, instance_addon, partner_wholesale, partner_license_topup';
