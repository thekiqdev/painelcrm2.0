-- M5 S6 — suspensão Partner + migração clientes (D15) preservando preço

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS migrated_from_partner_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS partner_migrated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tenants_migrated_from_partner
  ON public.tenants (migrated_from_partner_id)
  WHERE migrated_from_partner_id IS NOT NULL;

COMMENT ON COLUMN public.tenants.migrated_from_partner_id IS
  'S6 D15: Partner de origem após migração para platform_customer';
COMMENT ON COLUMN public.tenants.partner_migrated_at IS
  'S6 D15: quando o tenant deixou o canal Partner';

CREATE TABLE IF NOT EXISTS public.partner_suspension_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reason TEXT,
  customers_migrated INTEGER NOT NULL DEFAULT 0,
  customers_skipped INTEGER NOT NULL DEFAULT 0,
  price_overrides_created INTEGER NOT NULL DEFAULT 0,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_suspension_events_partner
  ON public.partner_suspension_events (partner_tenant_id, created_at DESC);

COMMENT ON TABLE public.partner_suspension_events IS
  'S6: auditoria de suspensão + migração D15 (idempotente por cliente)';
