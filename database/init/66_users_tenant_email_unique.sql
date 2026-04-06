-- SaaS multi-tenant: email único por tenant, não globalmente.
-- Permite o mesmo e-mail em tenants diferentes.

-- Remover UNIQUE global em email
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_email_key;

-- Único por (tenant_id, email) quando tenant_id está definido
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_key
  ON public.users (tenant_id, email)
  WHERE tenant_id IS NOT NULL;

-- Usuários sem tenant (ex.: super admin): um e-mail por conta
CREATE UNIQUE INDEX IF NOT EXISTS users_email_null_tenant_key
  ON public.users (email)
  WHERE tenant_id IS NULL;

COMMENT ON INDEX public.users_tenant_email_key IS 'Um e-mail por tenant; mesmo e-mail pode existir em outros tenants.';
COMMENT ON INDEX public.users_email_null_tenant_key IS 'Usuários sem tenant: e-mail único.';
