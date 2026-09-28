-- Perfis de acesso habilitados por tenant (profile). Permite ao admin adicionar Gestor e Visualizador.
-- Por padrão cada tenant tem apenas Administrador e Operacional; pode adicionar manager e viewer.

CREATE TABLE IF NOT EXISTS public.tenant_enabled_roles (
  profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, role)
);

COMMENT ON TABLE public.tenant_enabled_roles IS 'Perfis de acesso habilitados por tenant (profile). Lista quais roles aparecem em Perfis de acesso.';

CREATE INDEX IF NOT EXISTS idx_tenant_enabled_roles_profile_id ON public.tenant_enabled_roles(profile_id);

-- Seed: para cada user_profile existente, habilita admin e member
INSERT INTO public.tenant_enabled_roles (profile_id, role)
SELECT up.id, r.role
FROM public.user_profiles up
CROSS JOIN (VALUES ('admin'::public.app_role), ('member'::public.app_role)) AS r(role)
ON CONFLICT (profile_id, role) DO NOTHING;

-- Trigger: novos perfis (novos tenants) recebem admin e member por padrão
CREATE OR REPLACE FUNCTION public.tenant_enabled_roles_seed_new_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tenant_enabled_roles (profile_id, role)
  VALUES (NEW.id, 'admin'::public.app_role), (NEW.id, 'member'::public.app_role)
  ON CONFLICT (profile_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_enabled_roles_after_insert_profile ON public.user_profiles;
CREATE TRIGGER tenant_enabled_roles_after_insert_profile
  AFTER INSERT ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.tenant_enabled_roles_seed_new_profile();

-- Seed: manager e viewer em role_module_permissions (mesmo conjunto que member, para poder editar depois)
INSERT INTO public.role_module_permissions (role, module, can_view, can_create, can_edit, can_delete, edit_own_only, delete_own_only)
VALUES
  ('manager', 'dashboard', true, false, false, false, false, false),
  ('manager', 'clients', true, true, true, true, true, true),
  ('manager', 'leads', true, true, true, true, true, true),
  ('manager', 'funnels', true, true, true, true, false, false),
  ('manager', 'products', true, true, true, true, true, true),
  ('manager', 'projects', true, true, true, true, true, true),
  ('manager', 'tasks', true, true, true, true, true, true),
  ('manager', 'project_templates', true, true, true, true, true, true),
  ('manager', 'chat', true, true, false, false, false, false),
  ('manager', 'tickets', true, true, true, true, true, true),
  ('manager', 'proposals', true, true, true, true, true, true),
  ('manager', 'contracts', true, true, true, true, true, true),
  ('manager', 'billing', true, true, true, true, false, false),
  ('manager', 'finance', true, true, true, true, false, false),
  ('manager', 'settings', true, true, true, true, false, false),
  ('manager', 'meu_plano', true, false, false, false, false, false),
  ('viewer', 'dashboard', true, false, false, false, false, false),
  ('viewer', 'clients', true, false, false, false, false, false),
  ('viewer', 'leads', true, false, false, false, false, false),
  ('viewer', 'funnels', true, false, false, false, false, false),
  ('viewer', 'products', true, false, false, false, false, false),
  ('viewer', 'projects', true, false, false, false, false, false),
  ('viewer', 'tasks', true, false, false, false, false, false),
  ('viewer', 'project_templates', true, false, false, false, false, false),
  ('viewer', 'chat', true, false, false, false, false, false),
  ('viewer', 'tickets', true, false, false, false, false, false),
  ('viewer', 'proposals', true, false, false, false, false, false),
  ('viewer', 'contracts', true, false, false, false, false, false),
  ('viewer', 'billing', true, false, false, false, false, false),
  ('viewer', 'finance', true, false, false, false, false, false),
  ('viewer', 'settings', true, false, false, false, false, false),
  ('viewer', 'meu_plano', false, false, false, false, false, false)
ON CONFLICT (role, module) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete,
  edit_own_only = EXCLUDED.edit_own_only,
  delete_own_only = EXCLUDED.delete_own_only,
  updated_at = now();
