-- M5 S3 — partner_sell_plans (planos de venda do canal)

CREATE TABLE IF NOT EXISTS public.partner_sell_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_platform_plan_id UUID REFERENCES public.plans(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  billing_interval TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly', 'yearly', 'quarterly', 'semiannual')),
  features_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_partner_sell_plans_partner_status
  ON public.partner_sell_plans (partner_tenant_id, status);

CREATE TRIGGER update_partner_sell_plans_updated_at
  BEFORE UPDATE ON public.partner_sell_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.partner_sell_plans IS
  'Planos de venda do Partner (license_pool: preço ≥ piso; revenue_share: preço imutável — pós-MVP)';
