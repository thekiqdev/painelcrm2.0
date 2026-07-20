/**
 * API para o usuário logado gerenciar o plano da própria conta (tenant).
 * Apenas o primary user do tenant pode acessar.
 */
import { Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import {
  checkTenantUsersLimit,
  checkTenantUsersLimitForAddOne,
  checkTenantWhatsAppInstancesLimit,
} from '../services/tenantLimitService.js';
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
import { getOpenTenantBillingSummary } from '../services/commercialHubContextService.js';
import { listCommercialBillingsForHub } from '../services/commercialTenantBillingsHubService.js';
import { z } from 'zod';
import { normalizeEmailForUniqueness, normalizeWhatsappDigits } from '../utils/userIdentity.js';
import {
  previewSeatAddonPurchase,
  scheduleSeatDowngradeNextCycle,
  startSeatAddonCheckout,
} from '../services/tenantSeatCommercialService.js';
import {
  previewInstanceAddonPurchase,
  scheduleInstanceDowngradeNextCycle,
  startInstanceAddonCheckout,
} from '../services/tenantInstanceCommercialService.js';
import { getInvoiceById } from '../services/invoiceService.js';
import { ensureTenantOverdueStatusesFresh } from '../services/billingOverdueStatusService.js';
import type { PaymentMethod } from '../modules/payments/paymentGatewayTypes.js';
import { reassignTenantUserDataAndDeleteUser } from '../services/tenantUserRemovalService.js';
import { hasPermissionKey } from '../permissions/permissionCatalog.js';
import { isTenantAdmin } from '../utils/tenant.js';
import { logTenantUserAdminAudit } from '../services/tenantUserAdminAuditService.js';

/** SELECT comum para listagem/detalhe de utilizadores do tenant (API). */
const SQL_TENANT_USERS_SELECT = `
SELECT u.id, u.email, u.is_super_admin,
  u.whatsapp_number,
  COALESCE(u.chat_show_sender_name, false) AS chat_show_sender_name,
  p.job_title,
  p.avatar_url,
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
`;

function mapTenantUserApiRow(r: Record<string, unknown>) {
  return {
    id: r.id,
    email: r.email,
    full_name: (r.full_name as string)?.trim() || null,
    whatsapp_number: (r.whatsapp_number as string | null) ?? null,
    job_title: (r.job_title as string | null) ?? null,
    avatar_url: (r.avatar_url as string | null) ?? null,
    chat_show_sender_name: r.chat_show_sender_name === true,
    last_used_at: r.last_used_at,
    role: r.role || null,
    custom_role_id: r.custom_role_id || null,
    custom_role_name: r.custom_role_name || null,
    is_super_admin: r.is_super_admin === true,
    team_names: (r.team_names as string) || null,
  };
}

/**
 * Dono da conta, role admin no perfil da empresa, ou permissão granular `settings.manage_users`.
 */
async function resolveTenantUserManageGate(
  tenantId: string,
  requesterId: string
): Promise<{ profileId: string; ownerId: string } | null> {
  const pr = await pool.query<{ profile_id: string; owner_id: string }>(
    `SELECT up.id AS profile_id, up.owner_id
     FROM user_profiles up
     JOIN users o ON o.id = up.owner_id AND o.tenant_id = $1
     ORDER BY up.created_at ASC LIMIT 1`,
    [tenantId]
  );
  if (pr.rows.length === 0) return null;
  const { profile_id: profileId, owner_id: ownerId } = pr.rows[0];
  if (ownerId === requesterId) return { profileId, ownerId };
  if (await isTenantAdmin(requesterId)) return { profileId, ownerId };
  const map = await getEffectiveModulePermissions(requesterId);
  if (hasPermissionKey(map, 'settings.manage_users')) {
    return { profileId, ownerId };
  }
  return null;
}

/** Primeiro usuário do tenant (`users.created_at`); usado em rotas comerciais (plano, cobrança interna). */
export async function getMyTenantAndPrimary(req: AuthRequest): Promise<{ tenantId: string; primaryUserId: string } | null> {
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
    const result = await pool.query(`${SQL_TENANT_USERS_SELECT} ORDER BY u.created_at ASC`, [tenantId]);
    const rows = result.rows.map((r: Record<string, unknown>) => mapTenantUserApiRow(r));
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

    const gate = await resolveTenantUserManageGate(tenantId, requesterId);
    if (!gate) {
      res.status(403).json({ error: 'Sem permissão para adicionar utilizadores nesta conta.' });
      return;
    }
    const profileId = gate.profileId;

    const limitCheck = await checkTenantUsersLimitForAddOne(tenantId);
    if (!limitCheck.allowed) {
      const msg = limitCheck.limit != null
        ? `Limite de usuários do plano atingido (${limitCheck.current} de ${limitCheck.limit}).`
        : 'Limite de usuários atingido.';
      res.status(403).json({ error: msg });
      return;
    }

    const body = createTenantUserSchema.parse(req.body);
    const email = normalizeEmailForUniqueness(body.email);
    const phoneDigits = normalizeWhatsappDigits(body.phone ?? null);

    const existingEmail = await pool.query<{ id: string; tenant_id: string | null }>(
      'SELECT id, tenant_id FROM users WHERE lower(btrim(email)) = $1',
      [email]
    );
    if (existingEmail.rows.length > 0) {
      const row = existingEmail.rows[0];
      if (row.tenant_id === tenantId) {
        res.status(400).json({ error: 'Já existe um usuário com este e-mail nesta conta.' });
        return;
      }
      res.status(400).json({ error: 'Este e-mail já está cadastrado na plataforma.' });
      return;
    }

    if (phoneDigits) {
      const existingPhone = await pool.query(
        `SELECT id FROM users
         WHERE length(regexp_replace(COALESCE(whatsapp_number, ''), '\\D', '', 'g')) >= 8
           AND regexp_replace(COALESCE(whatsapp_number, ''), '\\D', '', 'g') = $1`,
        [phoneDigits]
      );
      if (existingPhone.rows.length > 0) {
        res.status(400).json({ error: 'Este número de WhatsApp já está cadastrado na plataforma.' });
        return;
      }
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
      [email, passwordHash, phoneDigits, tenantId]
    );
    const newUser = userResult.rows[0];

    await pool.query(
      `INSERT INTO profiles (id, first_name, last_name, company_name, whatsapp_number, registration_complete)
       VALUES ($1, $2, $3, '', $4, true)`,
      [newUser.id, firstName, lastName, phoneDigits ?? body.phone?.trim() ?? '']
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
    if ((error as { code?: string })?.code === '23505') {
      res.status(400).json({
        error: 'E-mail ou WhatsApp já cadastrado na plataforma.',
      });
      return;
    }
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
      res.status(404).json({ error: 'Usuário não encontrado na empresa' });
      return;
    }

    const profileResult = await pool.query(
      `SELECT up.id FROM user_profiles up
       JOIN users o ON o.id = up.owner_id AND o.tenant_id = $1
       ORDER BY up.created_at ASC LIMIT 1`,
      [tenantId]
    );
    if (profileResult.rows.length === 0) {
      res.status(400).json({ error: 'Nenhum perfil encontrado na empresa' });
      return;
    }
    const profileId = profileResult.rows[0].id;

    const gate = await resolveTenantUserManageGate(tenantId, requesterId);
    if (!gate) {
      res.status(403).json({ error: 'Sem permissão para gerir perfis de acesso nesta conta.' });
      return;
    }

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
        res.status(400).json({ error: 'Perfil personalizado não encontrado nesta empresa.' });
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
      res.status(400).json({ error: 'Este perfil de acesso não está habilitado na empresa. Adicione-o em Configurações → Perfis de acesso.' });
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

/** DELETE /api/me/tenant/users/:userId — remove usuário do tenant (admin ou dono; não o primário). */
export async function deleteMyTenantUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = await getMyTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma conta' });
      return;
    }
    const requesterId = req.userId!;
    const { userId: targetUserId } = req.params;
    if (!targetUserId) {
      res.status(400).json({ error: 'userId é obrigatório' });
      return;
    }
    if (targetUserId === requesterId) {
      res.status(400).json({ error: 'Você não pode excluir a sua própria conta por aqui.' });
      return;
    }

    const gate = await resolveTenantUserManageGate(tenantId, requesterId);
    if (!gate) {
      res.status(403).json({ error: 'Sem permissão para excluir utilizadores desta conta.' });
      return;
    }

    const primaryRow = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [tenantId]
    );
    const primaryUserId = primaryRow.rows[0]?.id;
    if (!primaryUserId || primaryUserId === targetUserId) {
      res.status(400).json({ error: 'Não é possível excluir o administrador principal da conta.' });
      return;
    }

    const targetRow = await pool.query<{ is_super_admin: boolean }>(
      'SELECT is_super_admin FROM users WHERE id = $1 AND tenant_id = $2',
      [targetUserId, tenantId]
    );
    if (targetRow.rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }
    if (targetRow.rows[0].is_super_admin) {
      res.status(403).json({ error: 'Não é possível excluir este usuário.' });
      return;
    }

    await reassignTenantUserDataAndDeleteUser({
      tenantId,
      primaryUserId,
      targetUserId,
    });
    res.status(204).send();
  } catch (error: unknown) {
    console.error('deleteMyTenantUser error:', error);
    const code = (error as { code?: string })?.code;
    if (code === '23503') {
      res.status(409).json({
        error:
          'Não foi possível concluir a exclusão devido a vínculos no banco. Tente novamente ou contate o suporte.',
      });
      return;
    }
    const message = error instanceof Error ? error.message : 'Erro ao excluir usuário';
    if (message === 'USER_NOT_IN_TENANT') {
      res.status(404).json({ error: 'Usuário não encontrado na empresa' });
      return;
    }
    res.status(500).json({ error: message });
  }
}

const patchTenantUserSchema = z
  .object({
    full_name: z.string().min(1).max(200).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(40).nullable().optional(),
    job_title: z.string().max(200).nullable().optional(),
    chat_show_sender_name: z.boolean().optional(),
    password: z.preprocess((v) => {
      if (v === '' || v === null || v === undefined) return undefined;
      return v;
    }, z.string().min(6).max(200).optional()),
    confirm_password: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.password) {
      if (val.password !== val.confirm_password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Confirmação de senha não coincide',
          path: ['confirm_password'],
        });
      }
    }
  })
  .superRefine((val, ctx) => {
    const has =
      val.full_name !== undefined ||
      val.email !== undefined ||
      val.phone !== undefined ||
      val.job_title !== undefined ||
      val.chat_show_sender_name !== undefined ||
      (val.password !== undefined && String(val.password).length > 0);
    if (!has) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Nada para atualizar', path: ['_'] });
    }
  });

/** PATCH /api/me/tenant/users/:userId — atualiza perfil (e opcionalmente senha) de utilizador do tenant. */
export async function patchMyTenantUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = await getMyTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma conta' });
      return;
    }
    const requesterId = req.userId!;
    const { userId: targetUserId } = req.params;
    if (!targetUserId) {
      res.status(400).json({ error: 'userId é obrigatório' });
      return;
    }

    const gate = await resolveTenantUserManageGate(tenantId, requesterId);
    if (!gate) {
      res.status(403).json({ error: 'Sem permissão para editar utilizadores desta conta.' });
      return;
    }

    const body = patchTenantUserSchema.parse(req.body);

    const reqSuper = await pool.query<{ is_super_admin: boolean }>(
      'SELECT is_super_admin FROM users WHERE id = $1',
      [requesterId]
    );
    const requesterIsSuper = reqSuper.rows[0]?.is_super_admin === true;

    const cur = await pool.query<{
      email: string;
      whatsapp_number: string | null;
      chat_show_sender_name: boolean;
      first_name: string | null;
      last_name: string | null;
      job_title: string | null;
      is_super_admin: boolean;
    }>(
      `SELECT u.email, u.whatsapp_number,
        COALESCE(u.chat_show_sender_name, false) AS chat_show_sender_name,
        p.first_name, p.last_name, p.job_title, u.is_super_admin
       FROM users u
       LEFT JOIN profiles p ON p.id = u.id
       WHERE u.id = $1 AND u.tenant_id = $2`,
      [targetUserId, tenantId]
    );
    if (cur.rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado na empresa' });
      return;
    }
    const before = cur.rows[0];
    if (before.is_super_admin && !requesterIsSuper) {
      res.status(403).json({ error: 'Não é possível alterar este utilizador.' });
      return;
    }

    const changedProfile: string[] = [];
    let chatShowBefore = before.chat_show_sender_name;
    let chatShowAfter = chatShowBefore;

    if (body.email !== undefined) {
      const email = normalizeEmailForUniqueness(body.email);
      const dup = await pool.query<{ id: string }>(
        'SELECT id FROM users WHERE lower(btrim(email)) = $1 AND id <> $2',
        [email, targetUserId]
      );
      if (dup.rows.length > 0) {
        res.status(400).json({ error: 'Este e-mail já está em uso.' });
        return;
      }
      if (email !== normalizeEmailForUniqueness(before.email)) {
        changedProfile.push('email');
      }
    }

    let phoneDigits: string | null | undefined;
    if (body.phone !== undefined) {
      phoneDigits = normalizeWhatsappDigits(body.phone ?? null);
      const prevDigits = normalizeWhatsappDigits(before.whatsapp_number);
      if (phoneDigits !== prevDigits) {
        if (phoneDigits) {
          const existingPhone = await pool.query(
            `SELECT id FROM users
             WHERE id <> $2
               AND length(regexp_replace(COALESCE(whatsapp_number, ''), '\\D', '', 'g')) >= 8
               AND regexp_replace(COALESCE(whatsapp_number, ''), '\\D', '', 'g') = $1`,
            [phoneDigits, targetUserId]
          );
          if (existingPhone.rows.length > 0) {
            res.status(400).json({ error: 'Este número de WhatsApp já está cadastrado na plataforma.' });
            return;
          }
        }
        changedProfile.push('whatsapp_number');
      }
    }

    if (body.full_name !== undefined) {
      const full = body.full_name.trim();
      const prevFull =
        `${(before.first_name ?? '').trim()} ${(before.last_name ?? '').trim()}`.trim() || null;
      if (full !== (prevFull ?? '')) {
        changedProfile.push('full_name');
      }
    }

    if (body.job_title !== undefined) {
      const jt = body.job_title?.trim() ?? null;
      const prevJt = before.job_title?.trim() ?? null;
      if (jt !== prevJt) {
        changedProfile.push('job_title');
      }
    }

    if (body.chat_show_sender_name !== undefined) {
      chatShowAfter = body.chat_show_sender_name;
      if (chatShowAfter !== chatShowBefore) {
        changedProfile.push('chat_show_sender_name');
      }
    }

    const passwordChanging = Boolean(body.password && body.password.length > 0);

    const userSets: string[] = [];
    const userVals: unknown[] = [];
    let pi = 1;
    if (body.email !== undefined) {
      userSets.push(`email = $${pi++}`);
      userVals.push(normalizeEmailForUniqueness(body.email));
    }
    if (body.phone !== undefined) {
      userSets.push(`whatsapp_number = $${pi++}`);
      userVals.push(phoneDigits ?? null);
    }
    if (body.chat_show_sender_name !== undefined) {
      userSets.push(`chat_show_sender_name = $${pi++}`);
      userVals.push(body.chat_show_sender_name);
    }
    if (passwordChanging) {
      userSets.push(`password_hash = $${pi++}`);
      userVals.push(await hashPassword(body.password!));
    }
    if (userSets.length > 0) {
      userVals.push(targetUserId);
      await pool.query(`UPDATE users SET ${userSets.join(', ')} WHERE id = $${pi}`, userVals);
    }

    if (body.full_name !== undefined || body.job_title !== undefined || body.phone !== undefined) {
      const jobTitleUpd =
        body.job_title !== undefined ? (body.job_title?.trim() ?? null) : undefined;
      const phoneTrimmed = body.phone?.trim() ?? '';
      const phoneForProfile =
        body.phone !== undefined ? (phoneDigits ?? phoneTrimmed) : undefined;

      const pSets: string[] = [];
      const pVals: unknown[] = [];
      let qi = 1;
      if (body.full_name !== undefined) {
        const fullName = body.full_name.trim();
        const nameParts = fullName.split(/\s+/).filter(Boolean);
        const firstName = nameParts[0] ?? fullName;
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
        pSets.push(`first_name = $${qi++}`, `last_name = $${qi++}`);
        pVals.push(firstName, lastName);
      }
      if (body.job_title !== undefined) {
        pSets.push(`job_title = $${qi++}`);
        pVals.push(jobTitleUpd ?? null);
      }
      if (body.phone !== undefined) {
        pSets.push(`whatsapp_number = $${qi++}`);
        pVals.push(phoneForProfile ?? '');
      }
      if (pSets.length > 0) {
        pVals.push(targetUserId);
        await pool.query(`UPDATE profiles SET ${pSets.join(', ')} WHERE id = $${qi}`, pVals);
      }
    }

    const ts = new Date().toISOString();
    const basePayload = {
      admin_user_id: requesterId,
      target_user_id: targetUserId,
      timestamp: ts,
    };

    if (passwordChanging) {
      await logTenantUserAdminAudit({
        tenantId,
        adminUserId: requesterId,
        targetUserId,
        eventType: 'user_password_changed_by_admin',
        payload: { ...basePayload, changed_fields: ['password'] },
      });
      await pool.query(`DELETE FROM sessions WHERE user_id = $1::uuid`, [targetUserId]);
    }

    if (body.chat_show_sender_name !== undefined && chatShowAfter !== chatShowBefore) {
      await logTenantUserAdminAudit({
        tenantId,
        adminUserId: requesterId,
        targetUserId,
        eventType: 'user_chat_sender_name_setting_changed',
        payload: {
          ...basePayload,
          changed_fields: ['chat_show_sender_name'],
          from: chatShowBefore,
          to: chatShowAfter,
        },
      });
    }

    const profileAuditFields = changedProfile.filter((f) => f !== 'chat_show_sender_name');
    if (profileAuditFields.length > 0) {
      await logTenantUserAdminAudit({
        tenantId,
        adminUserId: requesterId,
        targetUserId,
        eventType: 'user_profile_updated',
        payload: { ...basePayload, changed_fields: profileAuditFields },
      });
    }

    await incrementPermissionVersion(targetUserId);

    const refreshed = await pool.query(`${SQL_TENANT_USERS_SELECT} AND u.id = $2`, [tenantId, targetUserId]);
    const row = refreshed.rows[0];
    if (!row) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }
    res.json(mapTenantUserApiRow(row as Record<string, unknown>));
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const first = error.errors[0];
      res.status(400).json({ error: first?.message ?? 'Dados inválidos', details: error.errors });
      return;
    }
    console.error('patchMyTenantUser error:', error);
    const code = (error as { code?: string })?.code;
    if (code === '23505') {
      res.status(400).json({ error: 'E-mail ou WhatsApp já cadastrado na plataforma.' });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
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
    const [usersLimit, whatsappInstancesLimit] = await Promise.all([
      checkTenantUsersLimit(tenantId),
      checkTenantWhatsAppInstancesLimit(tenantId),
    ]);
    res.json({
      users: {
        current: usersLimit.current,
        limit: usersLimit.limit,
        allowed: usersLimit.allowed,
      },
      whatsapp_instances: {
        current: whatsappInstancesLimit.current,
        limit: whatsappInstancesLimit.limit,
        allowed: whatsappInstancesLimit.allowed,
      },
    });
  } catch (error: any) {
    console.error('getMyTenantLimits error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * GET /api/me/tenant/commercial-billings — histórico comercial (cobrança pai = tenant_billing).
 * Não expõe tentativas técnicas (tenant_billing_payment_attempts).
 */
export async function getMyTenantCommercialBillings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = await getMyTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma conta' });
      return;
    }
    await ensureTenantOverdueStatusesFresh(tenantId).catch((err) =>
      console.error('getMyTenantCommercialBillings overdue sync:', err)
    );
    const billings = await listCommercialBillingsForHub(tenantId, 60);
    res.json({ billings });
  } catch (error: unknown) {
    console.error('getMyTenantCommercialBillings error:', error);
    res.status(500).json({ error: 'Internal server error' });
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
      `SELECT p.*, t.trial_ends_at, t.max_users_override, t.max_whatsapp_instances_override,
              t.status AS tenant_status, t.plan_period_start, t.plan_period_end,
              t.suspension_reason, t.activated_billing_id,
              t.max_users_scheduled_next_cycle, t.seat_addon_pending_billing_id,
              t.instance_addon_pending_billing_id,
              t.max_whatsapp_instances_scheduled_next_cycle
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
        'SELECT billing_interval, price_per_user_cents, price_per_instance_cents FROM plan_interval_prices WHERE plan_id = $1',
        [plan.id]
      );
      plan.interval_prices = pricesRows.rows;
    } else {
      const pricesRows = await pool.query(
        'SELECT billing_interval, price_per_user_cents, price_per_instance_cents FROM plan_interval_prices WHERE plan_id = $1',
        [plan.id]
      );
      if (pricesRows.rows.length > 0) plan.interval_prices = pricesRows.rows;
    }
    const activatedBid = plan.activated_billing_id ?? null;
    const pendingBilling = await getOpenTenantBillingSummary(ctx.tenantId, activatedBid);

    type PendingAddonBilling = {
      billing_id: string;
      status: string;
      amount_cents: number;
      due_date: string | null;
      payment_method: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | null;
      gateway: string | null;
      invoice_number: string | null;
      has_gateway_reference: boolean;
    };

    const buildPendingAddon = async (bid: string | null | undefined): Promise<PendingAddonBilling | null> => {
      if (!bid) return null;
      const sb = await getInvoiceById(bid);
      const open =
        sb &&
        ['pending', 'waiting_payment', 'processing', 'overdue'].includes(String(sb.status));
      if (!open || !sb) return null;
      const due = sb.due_date;
      let dueStr: string | null = null;
      if (due != null) {
        const d = typeof due === 'string' || typeof due === 'number' ? new Date(due) : new Date(String(due));
        if (!Number.isNaN(d.getTime())) dueStr = d.toISOString().slice(0, 10);
      }
      const pm = sb.payment_method;
      const methodOk = pm === 'PIX' || pm === 'BOLETO' || pm === 'CREDIT_CARD' ? pm : null;
      return {
        billing_id: sb.id,
        status: sb.status,
        amount_cents: sb.amount_cents ?? 0,
        due_date: dueStr,
        payment_method: methodOk,
        gateway: sb.gateway ?? null,
        invoice_number: sb.invoice_number ?? null,
        has_gateway_reference: !!(sb.gateway_reference_id && String(sb.gateway_reference_id).trim()),
      };
    };

    let pending_seat_addon_billing = await buildPendingAddon(
      plan.seat_addon_pending_billing_id as string | null | undefined
    );
    if (plan.seat_addon_pending_billing_id && !pending_seat_addon_billing) {
      await pool.query(
        `UPDATE tenants SET seat_addon_pending_billing_id = NULL, updated_at = now() WHERE id = $1`,
        [ctx.tenantId]
      );
    }

    let pending_instance_addon_billing = await buildPendingAddon(
      plan.instance_addon_pending_billing_id as string | null | undefined
    );
    if (plan.instance_addon_pending_billing_id && !pending_instance_addon_billing) {
      await pool.query(
        `UPDATE tenants SET instance_addon_pending_billing_id = NULL, updated_at = now() WHERE id = $1`,
        [ctx.tenantId]
      );
    }

    res.json({
      tenant_id: ctx.tenantId,
      plan,
      trial_ends_at: plan.trial_ends_at,
      max_users_override: plan.max_users_override,
      max_whatsapp_instances_override: plan.max_whatsapp_instances_override,
      tenant_status: plan.tenant_status,
      plan_period_start: plan.plan_period_start,
      plan_period_end: plan.plan_period_end,
      suspension_reason: plan.suspension_reason ?? null,
      activated_billing_id: activatedBid,
      pending_billing: pendingBilling,
      max_users_scheduled_next_cycle: plan.max_users_scheduled_next_cycle ?? null,
      max_whatsapp_instances_scheduled_next_cycle:
        plan.max_whatsapp_instances_scheduled_next_cycle ?? null,
      pending_seat_addon_billing,
      pending_instance_addon_billing,
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

/** PUT /api/me/tenant/plan - alterar plano (apenas primary user). Assentos: rotas dedicadas em /seat-addon e /seats. */
export async function putMyTenantPlan(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await getMyTenantAndPrimary(req);
    if (!ctx || ctx.primaryUserId !== req.userId) {
      res.status(403).json({ error: 'Apenas o administrador da conta pode alterar o plano' });
      return;
    }
    const body = putMyTenantPlanSchema.parse(req.body || {});
    if (body.users_count !== undefined) {
      res.status(400).json({
        error:
          'Alterar quantidade de assentos por esta rota não é permitido. Em Meu plano, use “Contratar novos usuários” (com pagamento) ou “Reduzir usuários no próximo ciclo”.',
      });
      return;
    }

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

const seatAddonPreviewSchema = z.object({
  additional_seats: z.number().int().min(1),
});

const seatAddonCheckoutSchema = z.object({
  additional_seats: z.number().int().min(1),
  payment_method: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']).optional(),
});

const scheduleSeatsNextCycleSchema = z.object({
  target_seats: z.number().int().min(1),
});

const scheduleInstancesNextCycleSchema = z.object({
  target_instances: z.number().int().min(1),
});

async function assertTenantActiveForSeatCommerce(tenantId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const r = await pool.query<{ status: string }>(`SELECT status FROM tenants WHERE id = $1`, [tenantId]);
  const st = r.rows[0]?.status;
  if (st !== 'active') {
    return {
      ok: false,
      status: 400,
      error:
        'Gestão comercial de assentos só está disponível para contas ativas. Conclua trial ou pagamento pendente antes.',
    };
  }
  return { ok: true };
}

async function assertTenantActiveForInstanceCommerce(
  tenantId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const r = await pool.query<{ status: string }>(`SELECT status FROM tenants WHERE id = $1`, [tenantId]);
  const st = r.rows[0]?.status;
  if (st !== 'active') {
    return {
      ok: false,
      status: 400,
      error:
        'Contratação de conexões WhatsApp só está disponível para contas ativas. Conclua trial ou pagamento pendente antes.',
    };
  }
  return { ok: true };
}

const instanceAddonPreviewSchema = z.object({
  additional_instances: z.number().int().min(1),
});

const instanceAddonCheckoutSchema = z.object({
  additional_instances: z.number().int().min(1),
  payment_method: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']).optional(),
});

/** POST /api/me/tenant/instance-addon/preview */
export async function postInstanceAddonPreview(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await getMyTenantAndPrimary(req);
    if (!ctx || ctx.primaryUserId !== req.userId) {
      res.status(403).json({ error: 'Apenas o administrador da conta pode contratar conexões WhatsApp' });
      return;
    }
    const gate = await assertTenantActiveForInstanceCommerce(ctx.tenantId);
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error });
      return;
    }
    const body = instanceAddonPreviewSchema.parse(req.body || {});
    const tp = await pool.query<{ plan_id: string }>(`SELECT plan_id FROM tenants WHERE id = $1`, [ctx.tenantId]);
    const planId = tp.rows[0]?.plan_id;
    if (!planId) {
      res.status(400).json({ error: 'Plano não encontrado' });
      return;
    }
    const preview = await previewInstanceAddonPurchase({
      tenantId: ctx.tenantId,
      planId,
      additionalInstances: body.additional_instances,
    });
    res.json(preview);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    const msg = error instanceof Error ? error.message : 'Internal server error';
    console.error('postInstanceAddonPreview error:', error);
    res.status(400).json({ error: msg });
  }
}

/** POST /api/me/tenant/instance-addon/checkout */
export async function postInstanceAddonCheckout(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await getMyTenantAndPrimary(req);
    if (!ctx || ctx.primaryUserId !== req.userId) {
      res.status(403).json({ error: 'Apenas o administrador da conta pode contratar conexões WhatsApp' });
      return;
    }
    const gate = await assertTenantActiveForInstanceCommerce(ctx.tenantId);
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error });
      return;
    }
    const body = instanceAddonCheckoutSchema.parse(req.body || {});
    const tp = await pool.query<{ plan_id: string }>(`SELECT plan_id FROM tenants WHERE id = $1`, [ctx.tenantId]);
    const planId = tp.rows[0]?.plan_id;
    if (!planId) {
      res.status(400).json({ error: 'Plano não encontrado' });
      return;
    }
    const result = await startInstanceAddonCheckout({
      tenantId: ctx.tenantId,
      planId,
      additionalInstances: body.additional_instances,
      paymentMethod: body.payment_method as PaymentMethod | undefined,
    });
    res.json({
      billing_id: result.billing.id,
      billing: result.billing,
      payment_urls: result.paymentUrls ?? null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    const msg = error instanceof Error ? error.message : 'Internal server error';
    console.error('postInstanceAddonCheckout error:', error);
    const status = msg.includes('em aberto') ? 409 : 400;
    res.status(status).json({ error: msg });
  }
}

/** POST /api/me/tenant/seat-addon/preview — cálculo explícito do pró-rata (sem criar cobrança). */
export async function postSeatAddonPreview(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await getMyTenantAndPrimary(req);
    if (!ctx || ctx.primaryUserId !== req.userId) {
      res.status(403).json({ error: 'Apenas o administrador da conta pode contratar assentos' });
      return;
    }
    const gate = await assertTenantActiveForSeatCommerce(ctx.tenantId);
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error });
      return;
    }
    const body = seatAddonPreviewSchema.parse(req.body || {});
    const tp = await pool.query<{ plan_id: string }>(`SELECT plan_id FROM tenants WHERE id = $1`, [ctx.tenantId]);
    const planId = tp.rows[0]?.plan_id;
    if (!planId) {
      res.status(400).json({ error: 'Plano não encontrado' });
      return;
    }
    const pt = await pool.query<{ plan_type: string }>(`SELECT plan_type FROM plans WHERE id = $1`, [planId]);
    const planType = pt.rows[0]?.plan_type ?? 'standard';
    const preview = await previewSeatAddonPurchase({
      tenantId: ctx.tenantId,
      planId,
      planType,
      additionalSeats: body.additional_seats,
    });
    res.json(preview);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    const msg = error instanceof Error ? error.message : 'Internal server error';
    console.error('postSeatAddonPreview error:', error);
    res.status(400).json({ error: msg });
  }
}

/** POST /api/me/tenant/seat-addon/checkout — cria fatura seat_addon e cobrança no gateway (checkout com focusBillingId). */
export async function postSeatAddonCheckout(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await getMyTenantAndPrimary(req);
    if (!ctx || ctx.primaryUserId !== req.userId) {
      res.status(403).json({ error: 'Apenas o administrador da conta pode contratar assentos' });
      return;
    }
    const gate = await assertTenantActiveForSeatCommerce(ctx.tenantId);
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error });
      return;
    }
    const body = seatAddonCheckoutSchema.parse(req.body || {});
    const tp = await pool.query<{ plan_id: string }>(`SELECT plan_id FROM tenants WHERE id = $1`, [ctx.tenantId]);
    const planId = tp.rows[0]?.plan_id;
    if (!planId) {
      res.status(400).json({ error: 'Plano não encontrado' });
      return;
    }
    const pt = await pool.query<{ plan_type: string }>(`SELECT plan_type FROM plans WHERE id = $1`, [planId]);
    const planType = pt.rows[0]?.plan_type ?? 'standard';
    const result = await startSeatAddonCheckout({
      tenantId: ctx.tenantId,
      planId,
      planType,
      additionalSeats: body.additional_seats,
      paymentMethod: body.payment_method as PaymentMethod | undefined,
    });
    res.json({
      billing_id: result.billing.id,
      billing: result.billing,
      payment_urls: result.paymentUrls ?? null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    const msg = error instanceof Error ? error.message : 'Internal server error';
    const code = /Já existe uma cobrança/.test(msg) ? 409 : 400;
    console.error('postSeatAddonCheckout error:', error);
    res.status(code).json({ error: msg });
  }
}

/** PUT /api/me/tenant/seats/schedule-next-cycle — agenda downgrade de assentos na próxima renovação (sem estorno). */
export async function putSeatsScheduleNextCycle(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await getMyTenantAndPrimary(req);
    if (!ctx || ctx.primaryUserId !== req.userId) {
      res.status(403).json({ error: 'Apenas o administrador da conta pode alterar assentos' });
      return;
    }
    const gate = await assertTenantActiveForSeatCommerce(ctx.tenantId);
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error });
      return;
    }
    const body = scheduleSeatsNextCycleSchema.parse(req.body || {});
    const tp = await pool.query<{ plan_id: string }>(`SELECT plan_id FROM tenants WHERE id = $1`, [ctx.tenantId]);
    const planId = tp.rows[0]?.plan_id;
    if (!planId) {
      res.status(400).json({ error: 'Plano não encontrado' });
      return;
    }
    const pt = await pool.query<{ plan_type: string }>(`SELECT plan_type FROM plans WHERE id = $1`, [planId]);
    const planType = pt.rows[0]?.plan_type ?? 'standard';
    const uc = await pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM users WHERE tenant_id = $1`,
      [ctx.tenantId]
    );
    const usersInUse = uc.rows[0]?.c ?? 0;
    const out = await scheduleSeatDowngradeNextCycle({
      tenantId: ctx.tenantId,
      planType,
      targetSeats: body.target_seats,
      usersInUse,
    });
    res.json({
      scheduled_next_cycle: out.scheduled,
      message:
        out.scheduled != null
          ? 'Redução agendada: sem estorno; a nova quantidade vale na próxima cobrança. Até lá, os assentos atuais permanecem.'
          : 'Agendamento removido: a renovação seguirá a quantidade de assentos atualmente contratada.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    const msg = error instanceof Error ? error.message : 'Internal server error';
    console.error('putSeatsScheduleNextCycle error:', error);
    res.status(400).json({ error: msg });
  }
}

/** PUT /api/me/tenant/instances/schedule-next-cycle — agenda downgrade de conexões WhatsApp na próxima renovação. */
export async function putInstancesScheduleNextCycle(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await getMyTenantAndPrimary(req);
    if (!ctx || ctx.primaryUserId !== req.userId) {
      res.status(403).json({ error: 'Apenas o administrador da conta pode alterar conexões WhatsApp' });
      return;
    }
    const gate = await assertTenantActiveForInstanceCommerce(ctx.tenantId);
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error });
      return;
    }
    const body = scheduleInstancesNextCycleSchema.parse(req.body || {});
    const usage = await checkTenantWhatsAppInstancesLimit(ctx.tenantId);
    const out = await scheduleInstanceDowngradeNextCycle({
      tenantId: ctx.tenantId,
      targetInstances: body.target_instances,
      instancesInUse: usage.current,
    });
    res.json({
      scheduled_next_cycle: out.scheduled,
      message:
        out.scheduled != null
          ? 'Redução agendada: sem estorno; a nova quantidade vale na próxima cobrança. Até lá, o limite atual permanece.'
          : 'Agendamento removido: a renovação seguirá a quantidade de conexões atualmente contratada.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    const msg = error instanceof Error ? error.message : 'Internal server error';
    console.error('putInstancesScheduleNextCycle error:', error);
    res.status(400).json({ error: msg });
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
      const rawEx = p?.module_extras;
      const module_extras =
        rawEx && typeof rawEx === 'object' && !Array.isArray(rawEx)
          ? (rawEx as Record<string, unknown>)
          : {};
      permissions[moduleId] = {
        module: moduleId,
        can_view: p?.can_view ?? false,
        can_create: p?.can_create ?? false,
        can_edit: p?.can_edit ?? false,
        can_delete: p?.can_delete ?? false,
        edit_own_only: p?.edit_own_only ?? false,
        delete_own_only: p?.delete_own_only ?? false,
        module_extras,
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

const modulePermissionPayloadSchema = z.object({
  can_view: z.boolean(),
  can_create: z.boolean(),
  can_edit: z.boolean(),
  can_delete: z.boolean(),
  edit_own_only: z.boolean(),
  delete_own_only: z.boolean(),
  module_extras: z.record(z.unknown()).optional(),
});

const putRolePermissionsSchema = z.object({
  permissions: z.record(z.string(), modulePermissionPayloadSchema),
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
      const rawEx = p?.module_extras;
      const module_extras =
        rawEx && typeof rawEx === 'object' && !Array.isArray(rawEx)
          ? (rawEx as Record<string, unknown>)
          : {};
      permissions[moduleId] = {
        module: moduleId,
        can_view: p?.can_view ?? false,
        can_create: p?.can_create ?? false,
        can_edit: p?.can_edit ?? false,
        can_delete: p?.can_delete ?? false,
        edit_own_only: p?.edit_own_only ?? false,
        delete_own_only: p?.delete_own_only ?? false,
        module_extras,
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
