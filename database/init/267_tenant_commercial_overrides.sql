-- Sprint M1 — overrides comerciais por tenant (preço individual sem alterar catálogo).

CREATE TABLE IF NOT EXISTS public.tenant_commercial_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id uuid NULL REFERENCES public.plans(id) ON DELETE SET NULL,
  billing_interval varchar(32) NULL,
  override_type varchar(32) NOT NULL,
  value_cents integer NULL,
  percent_off numeric(5, 2) NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NULL,
  reason text NULL,
  metadata_json jsonb NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_commercial_overrides_tenant_active
  ON public.tenant_commercial_overrides (tenant_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_tenant_commercial_overrides_tenant_plan_interval
  ON public.tenant_commercial_overrides (tenant_id, plan_id, billing_interval)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_tenant_commercial_overrides_validity
  ON public.tenant_commercial_overrides (tenant_id, valid_from, valid_until);
