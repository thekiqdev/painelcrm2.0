/**
 * Perfis de acesso personalizados por tenant (nome livre).
 */
import { pool } from '../utils/db.js';
import type { AppRole } from './rolePermissionsService.js';
import { getRoleModulePermissions } from './modulePermissionsService.js';
import { MODULE_IDS } from './modulePermissionsService.js';
import type { ModulePermissionsMap } from './modulePermissionsService.js';
import { incrementPermissionVersion } from './permissionVersionService.js';

export interface TenantCustomRole {
  id: string;
  profile_id: string;
  name: string;
  slug: string;
}

/** Gera slug a partir do nome (lowercase, sem acentos, espaços -> hífen). */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'perfil';
}

/** Lista perfis customizados do profile (tenant). */
export async function getCustomRolesForProfile(profileId: string): Promise<TenantCustomRole[]> {
  const r = await pool.query<TenantCustomRole>(
    `SELECT id, profile_id, name, slug FROM tenant_custom_roles WHERE profile_id = $1 ORDER BY name`,
    [profileId]
  );
  return r.rows;
}

/** Cria perfil customizado. base_role opcional para copiar permissões (member, manager, viewer). */
export async function createCustomRole(
  profileId: string,
  name: string,
  baseRole?: AppRole
): Promise<TenantCustomRole> {
  const base = name.trim();
  if (!base) throw new Error('Nome do perfil é obrigatório');
  let slug = slugify(base);
  const existing = await pool.query(
    'SELECT slug FROM tenant_custom_roles WHERE profile_id = $1 AND slug = $2',
    [profileId, slug]
  );
  if (existing.rows.length > 0) {
    let n = 1;
    while (true) {
      const candidate = `${slug}-${n}`;
      const again = await pool.query(
        'SELECT 1 FROM tenant_custom_roles WHERE profile_id = $1 AND slug = $2',
        [profileId, candidate]
      );
      if (again.rows.length === 0) {
        slug = candidate;
        break;
      }
      n++;
    }
  }
  const insert = await pool.query<{ id: string; profile_id: string; name: string; slug: string }>(
    `INSERT INTO tenant_custom_roles (profile_id, name, slug) VALUES ($1, $2, $3)
     RETURNING id, profile_id, name, slug`,
    [profileId, base, slug]
  );
  const row = insert.rows[0];
  const template: ModulePermissionsMap = baseRole
    ? await getRoleModulePermissions(baseRole)
    : {};
  for (const moduleId of MODULE_IDS) {
    const p = template[moduleId];
    await pool.query(
      `INSERT INTO custom_role_module_permissions (custom_role_id, module, can_view, can_create, can_edit, can_delete, edit_own_only, delete_own_only)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        row.id,
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
  return { id: row.id, profile_id: row.profile_id, name: row.name, slug: row.slug };
}

/** Retorna permissões por módulo do perfil customizado. */
export async function getCustomRoleModulePermissions(
  customRoleId: string,
  profileId: string
): Promise<ModulePermissionsMap> {
  const r = await pool.query(
    `SELECT module, can_view, can_create, can_edit, can_delete, edit_own_only, delete_own_only
     FROM custom_role_module_permissions crp
     JOIN tenant_custom_roles tcr ON tcr.id = crp.custom_role_id AND tcr.profile_id = $2
     WHERE crp.custom_role_id = $1`,
    [customRoleId, profileId]
  );
  const map: ModulePermissionsMap = {};
  for (const row of r.rows) {
    map[row.module] = {
      module: row.module,
      can_view: row.can_view === true,
      can_create: row.can_create === true,
      can_edit: row.can_edit === true,
      can_delete: row.can_delete === true,
      edit_own_only: row.edit_own_only === true,
      delete_own_only: row.delete_own_only === true,
    };
  }
  return map;
}

/** Atualiza permissões por módulo do perfil customizado. */
export async function setCustomRoleModulePermissions(
  customRoleId: string,
  profileId: string,
  permissions: ModulePermissionsMap
): Promise<void> {
  const check = await pool.query(
    'SELECT 1 FROM tenant_custom_roles WHERE id = $1 AND profile_id = $2',
    [customRoleId, profileId]
  );
  if (check.rows.length === 0) throw new Error('Perfil customizado não encontrado');
  const client = await pool.connect();
  try {
    for (const moduleId of MODULE_IDS) {
      const p = permissions[moduleId];
      await client.query(
        `INSERT INTO custom_role_module_permissions (custom_role_id, module, can_view, can_create, can_edit, can_delete, edit_own_only, delete_own_only)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (custom_role_id, module) DO UPDATE SET
           can_view = EXCLUDED.can_view,
           can_create = EXCLUDED.can_create,
           can_edit = EXCLUDED.can_edit,
           can_delete = EXCLUDED.can_delete,
           edit_own_only = EXCLUDED.edit_own_only,
           delete_own_only = EXCLUDED.delete_own_only,
           updated_at = now()`,
        [
          customRoleId,
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

  const usersWithCustomRole = await pool.query<{ user_id: string }>(
    'SELECT user_id FROM user_custom_roles WHERE custom_role_id = $1 AND profile_id = $2',
    [customRoleId, profileId]
  );
  for (const row of usersWithCustomRole.rows) {
    await incrementPermissionVersion(row.user_id);
  }
}

/** Retorna custom_role_id do usuário no profile (tenant), se houver. */
export async function getUserCustomRoleInProfile(
  userId: string,
  profileId: string
): Promise<string | null> {
  const r = await pool.query<{ custom_role_id: string }>(
    'SELECT custom_role_id FROM user_custom_roles WHERE user_id = $1 AND profile_id = $2',
    [userId, profileId]
  );
  return r.rows[0]?.custom_role_id ?? null;
}
