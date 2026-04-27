/**
 * Permissões por módulo (Etapa 2 do plano de permissões por módulo).
 * Schema dos módulos, CRUD em role_module_permissions e permissões efetivas por usuário.
 */
import { pool } from '../utils/db.js';
import { ModulePermissionError } from '../permissions/errors.js';
import { incrementPermissionVersion } from './permissionVersionService.js';
import type { AppRole } from './rolePermissionsService.js';
import { isValidAppRole } from './rolePermissionsService.js';
import type { ModulePermissionRow, ModulePermissionsMap } from '../permissions/permissionTypes.js';

export type { ModulePermissionRow, ModulePermissionsMap };

export const MODULE_IDS = [
  'dashboard',
  'clients',
  'leads',
  'funnels',
  'products',
  'projects',
  'tasks',
  'project_templates',
  'chat',
  'tickets',
  'proposals',
  'contracts',
  'billing',
  'finance',
  'settings',
  'meu_plano',
  'agenda',
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export interface ModuleSchemaItem {
  id: ModuleId;
  label: string;
  supportsEditOwn: boolean;
  supportsDeleteOwn: boolean;
}

const MODULE_LABELS: Record<ModuleId, string> = {
  dashboard: 'Dashboard',
  clients: 'Clientes',
  leads: 'Leads',
  funnels: 'Funil de Vendas',
  products: 'Produtos',
  projects: 'Projetos',
  tasks: 'Tarefas',
  project_templates: 'Templates de projeto',
  chat: 'Chat',
  tickets: 'Tickets',
  proposals: 'Propostas',
  contracts: 'Contratos',
  billing: 'Faturamento',
  finance: 'Financeiro (Despesas)',
  settings: 'Configurações',
  meu_plano: 'Meu Plano',
  agenda: 'Agenda',
};

const MODULES_SUPPORT_OWN: Partial<Record<ModuleId, { editOwn: boolean; deleteOwn: boolean }>> = {
  clients: { editOwn: true, deleteOwn: true },
  leads: { editOwn: true, deleteOwn: true },
  products: { editOwn: true, deleteOwn: true },
  projects: { editOwn: true, deleteOwn: true },
  tasks: { editOwn: true, deleteOwn: true },
  project_templates: { editOwn: true, deleteOwn: true },
  tickets: { editOwn: true, deleteOwn: true },
  proposals: { editOwn: true, deleteOwn: true },
  contracts: { editOwn: true, deleteOwn: true },
  agenda: { editOwn: true, deleteOwn: true },
};

/** Retorna o schema de módulos para a UI (lista de módulos com labels e se suportam edit_own/delete_own). */
export function getModulePermissionsSchema(): ModuleSchemaItem[] {
  return MODULE_IDS.map((id) => ({
    id,
    label: MODULE_LABELS[id],
    supportsEditOwn: MODULES_SUPPORT_OWN[id]?.editOwn ?? false,
    supportsDeleteOwn: MODULES_SUPPORT_OWN[id]?.deleteOwn ?? false,
  }));
}

/** Retorna as permissões por módulo para um role (admin ou member). */
export async function getRoleModulePermissions(role: AppRole): Promise<ModulePermissionsMap> {
  const allowedRoles: AppRole[] = ['admin', 'manager', 'member', 'viewer'];
  if (!allowedRoles.includes(role)) {
    return {};
  }
  try {
    const result = await pool.query(
      `SELECT module, can_view, can_create, can_edit, can_delete, edit_own_only, delete_own_only,
              COALESCE(module_extras, '{}'::jsonb) AS module_extras
       FROM role_module_permissions WHERE role = $1`,
      [role]
    );
    const map: ModulePermissionsMap = {};
    for (const row of result.rows) {
      const ex = row.module_extras;
      map[row.module] = {
        module: row.module,
        can_view: row.can_view === true,
        can_create: row.can_create === true,
        can_edit: row.can_edit === true,
        can_delete: row.can_delete === true,
        edit_own_only: row.edit_own_only === true,
        delete_own_only: row.delete_own_only === true,
        module_extras:
          typeof ex === 'object' && ex !== null && !Array.isArray(ex) ? (ex as Record<string, unknown>) : {},
      };
    }
    return map;
  } catch (e: any) {
    if (e?.code === '42P01') return {};
    if (e?.code === '42703') {
      const result = await pool.query(
        `SELECT module, can_view, can_create, can_edit, can_delete, edit_own_only, delete_own_only
         FROM role_module_permissions WHERE role = $1`,
        [role]
      );
      const map: ModulePermissionsMap = {};
      const proposalsExtras =
        role === 'admin' || role === 'manager'
          ? { proposals_send: true, proposals_convert_invoice: true, proposals_manage_integrations: true }
          : role === 'member'
            ? { proposals_send: true, proposals_convert_invoice: true, proposals_manage_integrations: false }
            : { proposals_send: false, proposals_convert_invoice: false, proposals_manage_integrations: false };
      for (const row of result.rows) {
        map[row.module] = {
          module: row.module,
          can_view: row.can_view === true,
          can_create: row.can_create === true,
          can_edit: row.can_edit === true,
          can_delete: row.can_delete === true,
          edit_own_only: row.edit_own_only === true,
          delete_own_only: row.delete_own_only === true,
          module_extras: row.module === 'proposals' ? proposalsExtras : {},
        };
      }
      return map;
    }
    throw e;
  }
}

/** Atualiza as permissões por módulo de um role. Replace completo: módulos não enviados ficam com tudo false. */
export async function setRoleModulePermissions(
  role: AppRole,
  permissions: ModulePermissionsMap
): Promise<void> {
  if (!isValidAppRole(role)) {
    throw new Error('Role não editável');
  }
  if (role === 'admin') {
    throw new Error('Permissões do Administrador não podem ser alteradas');
  }
  const client = await pool.connect();
  try {
    for (const moduleId of MODULE_IDS) {
      const p = permissions[moduleId];
      await client.query(
        `INSERT INTO role_module_permissions (role, module, can_view, can_create, can_edit, can_delete, edit_own_only, delete_own_only, module_extras)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '{}'::jsonb)
         ON CONFLICT (role, module) DO UPDATE SET
           can_view = EXCLUDED.can_view,
           can_create = EXCLUDED.can_create,
           can_edit = EXCLUDED.can_edit,
           can_delete = EXCLUDED.can_delete,
           edit_own_only = EXCLUDED.edit_own_only,
           delete_own_only = EXCLUDED.delete_own_only,
           module_extras = role_module_permissions.module_extras,
           updated_at = now()`,
        [
          role,
          moduleId,
          p?.can_view ?? false,
          p?.can_create ?? false,
          p?.can_edit ?? false,
          p?.can_delete ?? false,
          p?.edit_own_only ?? false,
          p?.delete_own_only ?? false,
        ]
      );
    }
  } finally {
    client.release();
  }

  const usersWithRole = await pool.query<{ user_id: string }>(
    'SELECT user_id FROM user_roles WHERE role = $1',
    [role]
  );
  for (const row of usersWithRole.rows) {
    await incrementPermissionVersion(row.user_id);
  }
}

/** Retorna o role do usuário no tenant (primeiro user_profile do tenant). */
export async function getUserRoleInTenant(userId: string): Promise<AppRole | null> {
  const r = await pool.query(
    `SELECT ur.role::text AS role
     FROM user_roles ur
     JOIN user_profiles up ON up.id = ur.profile_id
     JOIN users u ON u.id = ur.user_id
     JOIN users owner ON owner.id = up.owner_id AND owner.tenant_id = u.tenant_id
     WHERE ur.user_id = $1
     LIMIT 1`,
    [userId]
  );
  const role = r.rows[0]?.role;
  if (role === 'admin' || role === 'manager' || role === 'member' || role === 'viewer') {
    return role;
  }
  return null;
}

/** Permissões efetivas por módulo para o usuário (considera perfil customizado primeiro). */
export async function getEffectiveModulePermissions(userId: string): Promise<ModulePermissionsMap> {
  const { getCustomRoleModulePermissions, getUserCustomRoleInProfile } = await import(
    './customRolesService.js'
  );
  const profileRow = await pool.query<{ profile_id: string }>(
    `SELECT up.id AS profile_id
     FROM user_profiles up
     JOIN users o ON o.id = up.owner_id
     JOIN users u ON u.tenant_id = o.tenant_id AND u.id = $1
     LIMIT 1`,
    [userId]
  );
  const profileId = profileRow.rows[0]?.profile_id;
  if (!profileId) return {};
  const customRoleId = await getUserCustomRoleInProfile(userId, profileId);
  if (customRoleId) {
    return getCustomRoleModulePermissions(customRoleId, profileId);
  }
  const role = await getUserRoleInTenant(userId);
  if (role) return getRoleModulePermissions(role);
  return {};
}

/** Reexport para compatibilidade: controllers podem continuar importando do service. */
export { ModulePermissionError };

export interface AssertModulePermissionOptions {
  /** UUID do dono/criador do recurso (ex.: client.user_id). */
  ownerId?: string | null;
  /** UUID do responsável atribuído (ex.: task.assignee_id). */
  assigneeId?: string | null;
}

/**
 * Garante que o usuário tem permissão para a ação no módulo.
 * Para create: exige can_create.
 * Para edit/delete: exige can_edit/can_delete; se edit_own_only/delete_own_only, exige ownerId === userId ou assigneeId === userId.
 * Lança ModulePermissionError(403) quando não permitido.
 */
export async function assertModulePermission(
  userId: string,
  moduleId: string,
  action: 'create' | 'edit' | 'delete',
  options?: AssertModulePermissionOptions
): Promise<void> {
  const perms = await getEffectiveModulePermissions(userId);
  const p = perms[moduleId];
  if (!p) return;

  if (action === 'create') {
    if (!p.can_create) {
      throw new ModulePermissionError(403, 'Sem permissão para criar neste módulo.');
    }
    return;
  }

  if (action === 'edit') {
    if (!p.can_edit) {
      throw new ModulePermissionError(403, 'Sem permissão para editar neste módulo.');
    }
    if (p.edit_own_only) {
      const isOwner = options?.ownerId != null && options.ownerId === userId;
      const isAssignee = options?.assigneeId != null && options.assigneeId === userId;
      if (!isOwner && !isAssignee) {
        throw new ModulePermissionError(403, 'Sem permissão para editar este registro.');
      }
    }
    return;
  }

  if (action === 'delete') {
    if (!p.can_delete) {
      throw new ModulePermissionError(403, 'Sem permissão para excluir neste módulo.');
    }
    if (p.delete_own_only) {
      const isOwner = options?.ownerId != null && options.ownerId === userId;
      const isAssignee = options?.assigneeId != null && options.assigneeId === userId;
      if (!isOwner && !isAssignee) {
        throw new ModulePermissionError(403, 'Sem permissão para excluir este registro.');
      }
    }
    return;
  }
}
