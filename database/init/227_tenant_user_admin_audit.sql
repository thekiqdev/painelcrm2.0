-- Auditoria: admin altera perfil/senha/opções de utilizadores do tenant (sem gravar segredos)
CREATE TABLE IF NOT EXISTS public.tenant_user_admin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  admin_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  target_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_user_admin_audit_tenant
  ON public.tenant_user_admin_audit (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_user_admin_audit_target
  ON public.tenant_user_admin_audit (target_user_id, created_at DESC);

COMMENT ON TABLE public.tenant_user_admin_audit IS
  'Eventos de gestão de utilizadores pelo admin (ex.: user_profile_updated, user_password_changed_by_admin).';
