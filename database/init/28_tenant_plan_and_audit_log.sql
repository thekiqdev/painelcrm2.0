-- Etapa 5.1: Histórico de plano por tenant e log de auditoria do Super Admin

-- Histórico de alteração de plano por tenant
CREATE TABLE IF NOT EXISTS public.tenant_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_plan_tenant_id ON public.tenant_plan(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_plan_plan_id ON public.tenant_plan(plan_id);
CREATE INDEX IF NOT EXISTS idx_tenant_plan_starts_at ON public.tenant_plan(starts_at);

COMMENT ON TABLE public.tenant_plan IS 'Histórico de plano por tenant (cada alteração de plano gera uma linha)';

-- Log de ações do Super Admin (auditoria)
CREATE TABLE IF NOT EXISTS public.super_admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_super_admin_audit_log_user_id ON public.super_admin_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_super_admin_audit_log_entity ON public.super_admin_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_super_admin_audit_log_created_at ON public.super_admin_audit_log(created_at DESC);

COMMENT ON TABLE public.super_admin_audit_log IS 'Auditoria de ações realizadas por usuários Super Admin';
