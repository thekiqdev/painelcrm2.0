-- Permissões por módulo por role (Etapa 2 do plano de permissões por módulo).
-- Permite definir por perfil (admin, member) e por módulo: view, create, edit, delete, edit_own_only, delete_own_only.

CREATE TABLE IF NOT EXISTS public.role_module_permissions (
  role public.app_role NOT NULL,
  module TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  edit_own_only BOOLEAN NOT NULL DEFAULT false,
  delete_own_only BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role, module)
);

COMMENT ON TABLE public.role_module_permissions IS 'Permissões por módulo do sistema por app_role (admin, member).';

CREATE INDEX IF NOT EXISTS idx_role_module_permissions_role ON public.role_module_permissions(role);

DROP TRIGGER IF EXISTS update_role_module_permissions_updated_at ON public.role_module_permissions;
CREATE TRIGGER update_role_module_permissions_updated_at
  BEFORE UPDATE ON public.role_module_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed: admin = tudo em todos os módulos
INSERT INTO public.role_module_permissions (role, module, can_view, can_create, can_edit, can_delete, edit_own_only, delete_own_only)
VALUES
  ('admin', 'dashboard', true, false, false, false, false, false),
  ('admin', 'clients', true, true, true, true, false, false),
  ('admin', 'leads', true, true, true, true, false, false),
  ('admin', 'funnels', true, true, true, true, false, false),
  ('admin', 'products', true, true, true, true, false, false),
  ('admin', 'projects', true, true, true, true, false, false),
  ('admin', 'tasks', true, true, true, true, false, false),
  ('admin', 'project_templates', true, true, true, true, false, false),
  ('admin', 'chat', true, true, false, false, false, false),
  ('admin', 'tickets', true, true, true, true, false, false),
  ('admin', 'proposals', true, true, true, true, false, false),
  ('admin', 'contracts', true, true, true, true, false, false),
  ('admin', 'billing', true, true, true, true, false, false),
  ('admin', 'finance', true, true, true, true, false, false),
  ('admin', 'settings', true, true, true, false, false, false),
  ('admin', 'meu_plano', true, false, false, false, false, false)
ON CONFLICT (role, module) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete,
  edit_own_only = EXCLUDED.edit_own_only,
  delete_own_only = EXCLUDED.delete_own_only,
  updated_at = now();

-- Seed: member (Operacional) = conjunto padrão; sem Meu Plano; settings só view; tarefas/propostas/tickets com edit_own/delete_own onde aplicável
INSERT INTO public.role_module_permissions (role, module, can_view, can_create, can_edit, can_delete, edit_own_only, delete_own_only)
VALUES
  ('member', 'dashboard', true, false, false, false, false, false),
  ('member', 'clients', true, true, true, true, true, true),
  ('member', 'leads', true, true, true, true, true, true),
  ('member', 'funnels', true, true, true, true, false, false),
  ('member', 'products', true, true, true, true, true, true),
  ('member', 'projects', true, true, true, true, true, true),
  ('member', 'tasks', true, true, true, true, true, true),
  ('member', 'project_templates', true, true, true, true, true, true),
  ('member', 'chat', true, true, false, false, false, false),
  ('member', 'tickets', true, true, true, true, true, true),
  ('member', 'proposals', true, true, true, true, true, true),
  ('member', 'contracts', true, true, true, true, true, true),
  ('member', 'billing', true, true, true, true, false, false),
  ('member', 'finance', true, true, true, true, false, false),
  ('member', 'settings', true, false, false, false, false, false),
  ('member', 'meu_plano', false, false, false, false, false, false)
ON CONFLICT (role, module) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete,
  edit_own_only = EXCLUDED.edit_own_only,
  delete_own_only = EXCLUDED.delete_own_only,
  updated_at = now();
