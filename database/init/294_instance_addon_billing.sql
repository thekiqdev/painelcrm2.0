-- WI3: pending pointer + billing_reason instance_addon (conexões WhatsApp extras)

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS instance_addon_pending_billing_id UUID REFERENCES public.tenant_billing(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tenants.instance_addon_pending_billing_id IS
  'Fatura billing_reason=instance_addon em aberto; conexões extras só após pagamento confirmado.';

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
      'instance_addon'
    )
  );

COMMENT ON COLUMN public.tenant_billing.billing_reason IS
  'Motivo: plan_purchase, plan_upgrade, plan_renewal, manual_charge, seat_addon, instance_addon';
