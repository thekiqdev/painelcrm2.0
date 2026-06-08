-- Sprint M2 — auditoria de alterações em tenant_commercial_overrides.

CREATE TABLE IF NOT EXISTS public.tenant_commercial_override_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  override_id uuid NOT NULL REFERENCES public.tenant_commercial_overrides(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action varchar(32) NOT NULL,
  before_json jsonb NULL,
  after_json jsonb NULL,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_commercial_override_audit_tenant
  ON public.tenant_commercial_override_audit (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_commercial_override_audit_override
  ON public.tenant_commercial_override_audit (override_id, created_at DESC);
