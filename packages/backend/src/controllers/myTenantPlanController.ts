/**
 * API para o usuário logado gerenciar o plano da própria conta (tenant).
 * Apenas o primary user do tenant pode acessar.
 */
import { Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { checkTenantUsersLimit, checkTenantUsersLimitForAddOne } from '../services/tenantLimitService.js';
import { hashPassword } from '../utils/bcrypt.js';
import { ROLE_DISPLAY_NAMES, getPermissionsForRole, isValidAppRole, type AppRole } from '../services/rolePermissionsService.js';
import {
  getModulePermissionsSchema,
  getRoleModulePermissions,
  setRoleModulePermissions,
  getEffectiveModulePermissions,
  type ModulePermissionsMap,
  MODULE_IDS,
} from '../services/modulePermissionsService.js';
import {
  getCustomRolesForProfile,
  createCustomRole,
  getCustomRoleModulePermissions,
  setCustomRoleModulePermissions,
} from '../services/customRolesService.js';
import { incrementPermissionVersion } from '../services/permissionVersionService.js';
import { z } from 'zod';

async function getMyTenantAndPrimary(req: AuthRequest): Promise<{ tenantId: string; primaryUserId: string } | null> {
  const userId = req.userId;
  if (!userId) return null;
  const r = await pool.query(
    `SELECT t.id AS tenant_id,
        (SELECT u2.id FROM users u2 WHERE u2.tenant_id = t.id ORDER BY u2.created_at ASC LIMIT 1) AS primary_user_id
     FROM users u
     JOIN tenants t ON t.id = u.tenant_id
     WHERE u.id = $1`,
    [userId]
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return { tenantId: row.tenant_id, primaryUserId: row.primary_user_id };
}

async function getMyTenantId(req: AuthRequest): Promise<string | null> {
  const userId = req.userId;
  if (!userId) return null;
  const r = await pool.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
  return r.rows[0]?.tenant_id ?? null;
}

async function getMyTenantProfileId(req: AuthRequest): Promise<string | null> {
  const tenantId = await getMyTenantId(req);
  if (!tenantId) return null;
  const r = await pool.query(
    `SELECT up.id FROM user_profiles up
     JOIN users o ON o.id = up.owner_id AND o.tenant_id = $1
     ORDER BY up.created_at ASC LIMIT 1`,
    [tenantId]
  );
  return r.rows[0]?.id ?? null;
}

/** GET /api/me/tenant/users - lista usuários do tenant do usuário logado (nome, email, role, último acesso). */
export async function getMyTenantUsers(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = await getMyTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma conta' });
      return;
    }
    const result = await pool.query(
      `SELECT u.id, u.email, u.is_super_admin,
        TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS full_name,
        (SELECT MAX(s.last_used_at) FROM sessions s WHERE s.user_id = u.id) AS last_used_at,
        (SELECT ur.role::text FROM user_roles ur
         JOIN user_profiles up ON up.id = ur.profile_id
         JOIN users owner ON owner.id = up.owner_id AND owner.tenant_id = u.tenant_id
         WHERE ur.user_id = u.id LIMIT 1) AS role,
        (SELECT ucr.custom_role_id FROM user_custom_roles ucr
         JOIN user_profiles up ON up.id = ucr.profile_id
         JOIN users owner ON owner.id = up.owner_id AND owner.tenant_id = u.tenant_id
         WHERE ucr.user_id = u.id LIMIT 1) AS custom_role_id,
        (SELECT tcr.name FROM user_custom_roles ucr
         JOIN tenant_custom_roles tcr ON tcr.id = ucr.custom_role_id
         JOIN user_profiles up ON up.id = ucr.profile_id
         JOIN users owner ON owner.id = up.owner_id AND owner.tenant_id = u.tenant_id
         WHERE ucr.user_id = u.id LIMIT 1) AS custom_role_name,
        (SELECT string_agg(t.name, ' | ' ORDER BY t.name)
         FROM teams t
         INNER JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = u.id
         WHERE t.tenant_id = u.tenant_id) AS team_names
       FROM users u
       LEFT JOIN profiles p ON p.id = u.id
       WHERE u.tenant_id = $1
       ORDER BY u.created_at ASC`,
      [tenantId]
    );
    const rows = result.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      email: r.email,
      full_name: (r.full_name as string)?.trim() || null,
      last_used_at: r.last_used_at,
      role: r.role || null,
      custom_role_id: r.custom_role_id || null,
      custom_role_name: r.custom_role_name || null,
      is_super_admin: r.is_super_admin === true,
      team_names: (r.team_names as string) || null,
    }));
    res.json(rows);
  } catch (error: any) {
    console.error('getMyTenantUsers error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

const createTenantUserSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  full_name: z.string().min(1, 'Nome completo é obrigatório'),
  phone: z.string().optional(),
});

/** POST /api/me/tenant/users - cria novo usuário na conta (apenas admin/primary user). */
export async function postMyTenantUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = await getMyTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma conta' });
      return;
    }
    const requesterId = req.userId!;

    const profileRow = await pool.query(
      `SELECT up.id, up.owner_id FROM user_profiles up
       JOIN users o ON o.id = up.owner_id AND o.tenant_id = $1
       ORDER BY up.created_at ASC LIMIT 1`,
      [tenantId]
    );
    if (profileRow.rows.length === 0) {
      res.status(400).json({ error: 'Nenhum perfil encontrado no tenant' });
      return;
    }
    const profileId = profileRow.rows[0].id;
    const ownerId = profileRow.rows[0].owner_id;
    const isOwner = ownerId === requesterId;
    const adminRole = await pool.query(
      `SELECT 1 FROM user_roles WHERE user_id = $1 AND profile_id = $2 AND role = 'admin'`,
      [requesterId, profileId]
    );
    if (!isOwner && adminRole.rows.length === 0) {
      res.status(403).json({ error: 'Apenas o administrador da conta pode adicionar usuários' });
      return;
    }

    const limitCheck = await checkTenantUsersLimitForAddOne(tenantId);
    if (!limitCheck.allowed) {
      const msg = limitCheck.limit != null
        ? `Limite de usuários do plano atingido (${limitCheck.current} de ${limitCheck.limit}).`
        : 'Limite de usuários atingido.';
      res.status(403).json({ error: msg });
      return;
    }

    const body = createTenantUserSchema.parse(req.body);
    const email = body.email.trim().toLowerCase();
    const phone = body.phone?.replace(/\D/g, '').trim() || null;

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      res.status(400).json({ error: 'Já existe um usuário com este e-mail' });
      return;
    }

    const passwordHash = await hashPassword(body.password);
    const fullName = body.full_name.trim();
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] ?? fullName;
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, whatsapp_number, tenant_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email`,
      [email, passwordHash, phone, tenantId]
    );
    const newUser = userResult.rows[0];

    await pool.query(
      `INSERT INTO profiles (id, first_name, last_name, company_name, whatsapp_number, registration_complete)
       VALUES ($1, $2, $3, '', $4, true)`,
      [newUser.id, firstName, lastName, phone ?? '']
    );

    await pool.query(
      'INSERT INTO profile_members (profile_id, user_id, created_by) VALUES ($1, $2, $3)',
      [profileId, newUser.id, requesterId]
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role, profile_id, created_by) VALUES ($1, 'member', $2, $3)`,
      [newUser.id, profileId, requesterId]
    );
    const memberPerms = getPermissionsForRole('member' as AppRole);
    for (const permission of memberPerms) {
      await pool.query(
        `INSERT INTO user_permissions (user_id, profile_id, permission, created_by) VALUES ($1, $2, $3, $4)`,
        [newUser.id, profileId, permission, requesterId]
      );
    }

    res.status(201).json({
      id: newUser.id,
      email: newUser.email,
      full_name: fullName,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0]?.message ?? 'Dados inválidos', details: error.errors });
      return;
    }
    console.error('postMyTenantUser error:', error);
    const message = error instanceof Error ? error.message : 'Erro ao criar usuário';
    res.status(500).json({ error: message });
  }
}

/** GET /api/me/tenant/roles - lista perfis de acesso (sistema + customizados). */
export async function getMyTenantRoles(req: AuthRequest, res: Response): Promise<void> {
  try {
    const profileId = await getMyTenantProfileId(req);
    if (!profileId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma conta' });
      return;
    }
    const systemResult = await pool.query<{ role: AppRole }>(
      `SELECT role FROM tenant_enabled_roles WHERE profile_id = $1 ORDER BY role`,
      [profileId]
    );
    const customRoles = await getCustomRolesForProfile(profileId);
    const roles = [
      ...systemResult.rows.map((row) => ({
        role: row.role,
        name: ROLE_DISPLAY_NAMES[row.role],
        permissions: getPermissionsForRole(row.role),
      })),
      ...customRoles.map((cr) => ({
        role: 'custom' as const,
        id: cr.id,
        name: cr.name,
      })),
    ];
    res.json(roles);
  } catch (error: any) {
    console.error('getMyTenantRoles error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

const postRoleSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(120),
  base_role: z.enum(['member', 'manager', 'viewer']).optional(),
});

/** POST /api/me/tenant/roles - cria perfil de acesso personalizado (nome livre). */
export async function postMyTenantRole(req: AuthRequest, res: Response): Promise<void> {
  try {
    const profileId = await getMyTenantProfileId(req);
    if (!profileId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma conta' });
      return;
    }
    const body = postRoleSchema.parse(req.body);
    const custom = await createCustomRole(
      profileId,
      body.name.trim(),
      body.base_role as AppRole | undefined
    );
    res.status(201).json({
      role: 'custom',
      id: custom.id,
      name: custom.name,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('postMyTenantRole error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
}

const putUserRoleSchema = z.object({
  role: z.enum(['admin', 'manager', 'member', 'viewer']).optional(),
  custom_role_id: z.string().uuid().optional(),
}).refine((b) => (b.role != null) !== (b.custom_role_id != null), {
  message: 'Informe role ou custom_role_id, não ambos',
});

/** PUT /api/me/tenant/users/:userId/role - atribui perfil de acesso (sistema ou customizado) ao usuário. */
export async function putMyTenantUserRole(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = await getMyTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma conta' });
      return;
    }
    const requesterId = req.userId!;
    const { userId: targetUserId } = req.params;
    const body = putUserRoleSchema.parse(req.body);

    if (!targetUserId) {
      res.status(400).json({ error: 'userId é obrigatório' });
      return;
    }

    const targetUser = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND tenant_id = $2',
      [targetUserId, tenantId]
    );
    if (targetUser.rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado no tenant' });
      return;
    }

    const profileResult = await pool.query(
      `SELECT up.id FROM user_profiles up
       JOIN users o ON o.id = up.owner_id AND o.tenant_id = $1
       ORDER BY up.created_at ASC LIMIT 1`,
      [tenantId]
    );
    if (profileResult.rows.length === 0) {
      res.status(400).json({ error: 'Nenhum perfil encontrado no tenant' });
      return;
    }
    const profileId = profileResult.rows[0].id;

    const isMember = await pool.query(
      'SELECT 1 FROM profile_members WHERE profile_id = $1 AND user_id = $2',
      [profileId, targetUserId]
    );
    if (isMember.rows.length === 0) {
      await pool.query(
        'INSERT INTO profile_members (profile_id, user_id, created_by) VALUES ($1, $2, $3)',
        [profileId, targetUserId, requesterId]
      );
    }

    if (body.custom_role_id) {
      const customCheck = await pool.query(
        'SELECT 1 FROM tenant_custom_roles WHERE id = $1 AND profile_id = $2',
        [body.custom_role_id, profileId]
      );
      if (customCheck.rows.length === 0) {
        res.status(400).json({ error: 'Perfil personalizado não encontrado neste tenant.' });
        return;
      }
      await pool.query('DELETE FROM user_roles WHERE user_id = $1 AND profile_id = $2', [targetUserId, profileId]);
      await pool.query(
        `INSERT INTO user_custom_roles (user_id, profile_id, custom_role_id, created_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, profile_id) DO UPDATE SET custom_role_id = $3`,
        [targetUserId, profileId, body.custom_role_id, requesterId]
      );
      await incrementPermissionVersion(targetUserId);
      res.json({ custom_role_id: body.custom_role_id, profile_id: profileId });
      return;
    }

    const role = body.role as AppRole;
    const enabled = await pool.query(
      'SELECT 1 FROM tenant_enabled_roles WHERE profile_id = $1 AND role = $2',
      [profileId, role]
    );
    if (enabled.rows.length === 0) {
      res.status(400).json({ error: 'Este perfil de acesso não está habilitado no tenant. Adicione-o em Configurações → Perfis de acesso.' });
      return;
    }

    await pool.query('DELETE FROM user_custom_roles WHERE user_id = $1 AND profile_id = $2', [targetUserId, profileId]);
    await pool.query(
      'DELETE FROM user_roles WHERE user_id = $1 AND profile_id = $2',
      [targetUserId, profileId]
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role, profile_id, created_by) VALUES ($1, $2, $3, $4)`,
      [targetUserId, role, profileId, requesterId]
    );

    const permissions = getPermissionsForRole(role);
    await pool.query(
      'DELETE FROM user_permissions WHERE user_id = $1 AND profile_id = $2',
      [targetUserId, profileId]
    );
    for (const permission of permissions) {
      await pool.query(
        `INSERT INTO user_permissions (user_id, profile_id, permission, created_by) VALUES ($1, $2, $3, $4)`,
        [targetUserId, profileId, permission, requesterId]
      );
    }

    await incrementPermissionVersion(targetUserId);
    res.json({ role, profile_id: profileId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('putMyTenantUserRole error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/me/tenant/limits - limites de uso do tenant (usuários, etc.). Qualquer usuário do tenant pode acessar. */
export async function getMyTenantLimits(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = await getMyTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma conta' });
      return;
    }
    const usersLimit = await checkTenantUsersLimit(tenantId);
    res.json({
      users: {
        current: usersLimit.current,
        limit: usersLimit.limit,
        allowed: usersLimit.allowed,
      },
    });
  } catch (error: any) {
    console.error('getMyTenantLimits error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/** GET /api/me/tenant/plan - plano atual do tenant do usuário (apenas primary user). */
export async function getMyTenantPlan(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await getMyTenantAndPrimary(req);
    if (!ctx || ctx.primaryUserId !== req.userId) {
      res.status(403).json({ error: 'Apenas o administrador da conta pode acessar os planos' });
      return;
    }
    const planResult = await pool.query(
      `SELECT p.*, t.trial_ends_at, t.max_users_override, t.max_whatsapp_instances_override
       FROM tenants t
       JOIN plans p ON p.id = t.plan_id
       WHERE t.id = $1`,
      [ctx.tenantId]
    );
    if (planResult.rows.length === 0) {
      res.status(404).json({ error: 'Conta ou plano não encontrado' });
      return;
    }
    const plan = planResult.rows[0];
    if (!Array.isArray(plan.benefits)) plan.benefits = [];
    if (plan.plan_type === 'custom') {
      const pricesRows = await pool.query(
        'SELECT billing_interval, price_per_user_cents FROM plan_interval_prices WHERE plan_id = $1',
        [plan.id]
      );
      plan.interval_prices = pricesRows.rows;
    }
    res.json({
      tenant_id: ctx.tenantId,
      plan,
      trial_ends_at: plan.trial_ends_at,
      max_users_override: plan.max_users_override,
      max_whatsapp_instances_override: plan.max_whatsapp_instances_override,
    });
  } catch (error: any) {
    console.error('getMyTenantPlan error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

const putMyTenantPlanSchema = z.object({
  plan_id: z.string().uuid().optional(),
  billing_interval: z.enum(['monthly', 'quarterly', 'semi_annual', 'yearly']).optional(),
  users_count: z.number().int().min(1).optional(),
});

/** PUT /api/me/tenant/plan - alterar plano ou (custom) número de usuários (apenas primary user). */
export async function putMyTenantPlan(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await getMyTenantAndPrimary(req);
    if (!ctx || ctx.primaryUserId !== req.userId) {
      res.status(403).json({ error: 'Apenas o administrador da conta pode alterar o plano' });
      return;
    }
    const body = putMyTenantPlanSchema.parse(req.body || {});

    const tenantRow = await pool.query(
      'SELECT plan_id, max_users_override FROM tenants WHERE id = $1',
      [ctx.tenantId]
    );
    if (tenantRow.rows.length === 0) {
      res.status(404).json({ error: 'Conta não encontrada' });
      return;
    }
    const currentPlanId = tenantRow.rows[0].plan_id;
    const planId = body.plan_id ?? currentPlanId;

    const planRow = await pool.query(
      'SELECT id, plan_type, is_free, free_access_days FROM plans WHERE id = $1',
      [planId]
    );
    if (planRow.rows.length === 0) {
      res.status(400).json({ error: 'Plano não encontrado' });
      return;
    }
    const plan = planRow.rows[0];

    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (body.plan_id !== undefined) {
      updates.push(`plan_id = $${i}`);
      values.push(planId);
      i++;
      if (plan.is_free && plan.free_access_days) {
        updates.push(`trial_ends_at = now() + ($${i}::int || ' days')::interval`);
        values.push(plan.free_access_days);
        i++;
      } else {
        updates.push('trial_ends_at = NULL');
      }
    }

    if (plan.plan_type === 'custom' && body.users_count !== undefined) {
      updates.push(`max_users_override = $${i}`);
      values.push(body.users_count);
      i++;
    }

    if (updates.length > 0) {
      values.push(ctx.tenantId);
      await pool.query(
        `UPDATE tenants SET ${updates.join(', ')}, updated_at = now() WHERE id = $${i}`,
        values
      );
    }

    const updated = await pool.query(
      `SELECT t.*, p.name AS plan_name, p.slug AS plan_slug, p.plan_type, p.is_free, p.free_access_days
       FROM tenants t JOIN plans p ON p.id = t.plan_id WHERE t.id = $1`,
      [ctx.tenantId]
    );
    res.json(updated.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('putMyTenantPlan error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/me/tenant/module-permissions-schema - schema de módulos para a UI (labels e suporte a edit_own/delete_own). */
export async function getModulePermissionsSchemaHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const schema = getModulePermissionsSchema();
    res.json({ modules: schema });
  } catch (error: any) {
    console.error('getModulePermissionsSchema error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/me/tenant/custom-roles/:id/permissions - permissões por módulo do perfil customizado. */
export async function getCustomRolePermissionsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const profileId = await getMyTenantProfileId(req);
    if (!profileId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma conta' });
      return;
    }
    const { id: customRoleId } = req.params;
    if (!customRoleId) {
      res.status(400).json({ error: 'ID do perfil é obrigatório' });
      return;
    }
    const permissions = await getCustomRoleModulePermissions(customRoleId, profileId);
    res.json({ role: 'custom', id: customRoleId, permissions });
  } catch (error: any) {
    console.error('getCustomRolePermissions error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/** PUT /api/me/tenant/custom-roles/:id/permissions - atualiza permissões do perfil customizado. */
export async function putCustomRolePermissionsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const profileId = await getMyTenantProfileId(req);
    if (!profileId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma conta' });
      return;
    }
    const { id: customRoleId } = req.params;
    if (!customRoleId) {
      res.status(400).json({ error: 'ID do perfil é obrigatório' });
      return;
    }
    const body = putRolePermissionsSchema.parse(req.body);
    const permissions: ModulePermissionsMap = {};
    for (const moduleId of MODULE_IDS) {
      const p = body.permissions[moduleId];
      permissions[moduleId] = {
        module: moduleId,
        can_view: p?.can_view ?? false,
        can_create: p?.can_create ?? false,
        can_edit: p?.can_edit ?? false,
        can_delete: p?.can_delete ?? false,
        edit_own_only: p?.edit_own_only ?? false,
        delete_own_only: p?.delete_own_only ?? false,
      };
    }
    await setCustomRoleModulePermissions(customRoleId, profileId, permissions);
    const updated = await getCustomRoleModulePermissions(customRoleId, profileId);
    res.json({ role: 'custom', id: customRoleId, permissions: updated });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('putCustomRolePermissions error:', error);
    res.status(500).json({ error: error?.message || 'Internal server error' });
  }
}

/** GET /api/me/tenant/roles/:role/permissions - permissões por módulo do role (admin ou member). */
export async function getRolePermissionsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { role } = req.params;
    if (!role || !isValidAppRole(role)) {
      res.status(400).json({ error: 'Role inválido' });
      return;
    }
    const permissions = await getRoleModulePermissions(role as AppRole);
    res.json({ role, permissions });
  } catch (error: any) {
    console.error('getRolePermissions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

const putRolePermissionsSchema = z.object({
  permissions: z.record(
    z.string(),
    z.object({
      can_view: z.boolean(),
      can_create: z.boolean(),
      can_edit: z.boolean(),
      can_delete: z.boolean(),
      edit_own_only: z.boolean(),
      delete_own_only: z.boolean(),
    })
  ),
});

/** PUT /api/me/tenant/roles/:role/permissions - atualiza permissões por módulo do role. */
export async function putRolePermissionsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { role } = req.params;
    if (!role || !isValidAppRole(role)) {
      res.status(400).json({ error: 'Role inválido' });
      return;
    }
    const body = putRolePermissionsSchema.parse(req.body);
    const permissions: ModulePermissionsMap = {};
    for (const moduleId of MODULE_IDS) {
      const p = body.permissions[moduleId];
      permissions[moduleId] = {
        module: moduleId,
        can_view: p?.can_view ?? false,
        can_create: p?.can_create ?? false,
        can_edit: p?.can_edit ?? false,
        can_delete: p?.can_delete ?? false,
        edit_own_only: p?.edit_own_only ?? false,
        delete_own_only: p?.delete_own_only ?? false,
      };
    }
    await setRoleModulePermissions(role as AppRole, permissions);
    const updated = await getRoleModulePermissions(role as AppRole);
    res.json({ role, permissions: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('putRolePermissions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/me/tenant/my-permissions - permissões efetivas por módulo do usuário logado. */
export async function getMyPermissionsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    const permissions = await getEffectiveModulePermissions(userId);
    res.json({ permissions });
  } catch (error: any) {
    console.error('getMyPermissions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
