-- Política comercial de assentos: upgrade pago (seat_addon) e downgrade agendado no próximo ciclo.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS max_users_scheduled_next_cycle INTEGER,
  ADD COLUMN IF NOT EXISTS seat_addon_pending_billing_id UUID REFERENCES public.tenant_billing(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tenants.max_users_scheduled_next_cycle IS
  'Plano custom: na próxima renovação, aplicar este número de assentos contratados (downgrade agendado; sem estorno).';
COMMENT ON COLUMN public.tenants.seat_addon_pending_billing_id IS
  'Fatura billing_reason=seat_addon em aberto; assentos extras só após pagamento confirmado.';

ALTER TABLE public.tenant_billing DROP CONSTRAINT IF EXISTS tenant_billing_billing_reason_check;
ALTER TABLE public.tenant_billing
  ADD CONSTRAINT tenant_billing_billing_reason_check
  CHECK (
    billing_reason IS NULL
    OR billing_reason IN ('plan_purchase', 'plan_upgrade', 'plan_renewal', 'manual_charge', 'seat_addon')
  );

COMMENT ON COLUMN public.tenant_billing.billing_reason IS
  'Motivo: plan_purchase, plan_upgrade, plan_renewal, manual_charge, seat_addon (pró-rata de assentos adicionais no ciclo atual)';
