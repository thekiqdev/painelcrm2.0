-- Etapa 3.1: Tabela de clientes (tenants) e vínculo usuário -> tenant
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  domain TEXT,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial')),
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_plan_id ON public.tenants(plan_id);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);

CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.tenants IS 'Clientes/contas B2B gerenciados pelo Super Admin; cada tenant tem um plano';

-- Vínculo usuário -> tenant (qual conta o usuário pertence)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON public.users(tenant_id);

COMMENT ON COLUMN public.users.tenant_id IS 'Conta (tenant) à qual o usuário pertence; usado para feature flags e limites por plano';
