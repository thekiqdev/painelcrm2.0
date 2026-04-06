-- Perfis de acesso personalizados por tenant (nome livre). Permite criar perfis além dos do sistema.

CREATE TABLE IF NOT EXISTS public.tenant_custom_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, slug)
);

COMMENT ON TABLE public.tenant_custom_roles IS 'Perfis de acesso personalizados por tenant (nome definido pelo admin).';

CREATE INDEX IF NOT EXISTS idx_tenant_custom_roles_profile_id ON public.tenant_custom_roles(profile_id);

CREATE TABLE IF NOT EXISTS public.custom_role_module_permissions (
  custom_role_id UUID NOT NULL REFERENCES public.tenant_custom_roles(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  edit_own_only BOOLEAN NOT NULL DEFAULT false,
  delete_own_only BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (custom_role_id, module)
);

COMMENT ON TABLE public.custom_role_module_permissions IS 'Permissões por módulo dos perfis personalizados.';

CREATE INDEX IF NOT EXISTS idx_custom_role_module_permissions_role ON public.custom_role_module_permissions(custom_role_id);

-- Usuário pode ter um perfil customizado no tenant (em vez de um role do sistema)
CREATE TABLE IF NOT EXISTS public.user_custom_roles (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  custom_role_id UUID NOT NULL REFERENCES public.tenant_custom_roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.users(id),
  PRIMARY KEY (user_id, profile_id)
);

COMMENT ON TABLE public.user_custom_roles IS 'Atribuição de perfil personalizado ao usuário no tenant. Quando preenchido, o usuário não tem role em user_roles para esse profile.';

CREATE INDEX IF NOT EXISTS idx_user_custom_roles_user_id ON public.user_custom_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_custom_roles_profile_id ON public.user_custom_roles(profile_id);

DROP TRIGGER IF EXISTS update_tenant_custom_roles_updated_at ON public.tenant_custom_roles;
CREATE TRIGGER update_tenant_custom_roles_updated_at
  BEFORE UPDATE ON public.tenant_custom_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_custom_role_module_permissions_updated_at ON public.custom_role_module_permissions;
CREATE TRIGGER update_custom_role_module_permissions_updated_at
  BEFORE UPDATE ON public.custom_role_module_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
