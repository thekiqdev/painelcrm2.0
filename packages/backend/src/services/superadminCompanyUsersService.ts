/**
 * P0-E — Gestão de usuários de empresa pelo Super Admin.
 */
import { pool } from '../utils/db.js';
import { hashPassword } from '../utils/bcrypt.js';
import { normalizeEmailForUniqueness, normalizeWhatsappDigits } from '../utils/userIdentity.js';
import { logSuperAdminAction } from './auditLogService.js';
import { z } from 'zod';

const SQL_TENANT_USER_DETAIL = `
SELECT u.id, u.email, u.tenant_id::text AS tenant_id, u.is_super_admin,
  u.whatsapp_number,
  COALESCE(u.chat_show_sender_name, false) AS chat_show_sender_name,
  p.job_title,
  p.first_name,
  p.last_name,
  TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS full_name,
  (SELECT MAX(s.last_used_at) FROM sessions s WHERE s.user_id = u.id) AS last_used_at,
  (SELECT ur.role::text FROM user_roles ur
   JOIN user_profiles up ON up.id = ur.profile_id
   JOIN users owner ON owner.id = up.owner_id AND owner.tenant_id = u.tenant_id
   WHERE ur.user_id = u.id LIMIT 1) AS role
FROM users u
LEFT JOIN profiles p ON p.id = u.id
WHERE u.id = $1 AND u.tenant_id = $2::uuid
`;

export type SuperadminTenantUserDetail = {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string | null;
  whatsapp_number: string | null;
  job_title: string | null;
  role: string | null;
  last_used_at: string | null;
  is_super_admin: boolean;
  chat_show_sender_name: boolean;
};

export async function assertTenantExists(tenantId: string): Promise<boolean> {
  const r = await pool.query('SELECT id FROM tenants WHERE id = $1::uuid', [tenantId]);
  return r.rows.length > 0;
}

export async function getSuperadminTenantUser(
  tenantId: string,
  userId: string,
): Promise<SuperadminTenantUserDetail | null> {
  const r = await pool.query(SQL_TENANT_USER_DETAIL, [userId, tenantId]);
  if (r.rows.length === 0) return null;
  const row = r.rows[0] as Record<string, unknown>;
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    email: String(row.email),
    full_name: (row.full_name as string)?.trim() || null,
    whatsapp_number: (row.whatsapp_number as string | null) ?? null,
    job_title: (row.job_title as string | null) ?? null,
    role: (row.role as string | null) ?? null,
    last_used_at: row.last_used_at ? String(row.last_used_at) : null,
    is_super_admin: row.is_super_admin === true,
    chat_show_sender_name: row.chat_show_sender_name === true,
  };
}

export const patchSuperadminTenantUserSchema = z
  .object({
    full_name: z.string().min(1).max(200).optional(),
    email: z.string().email().optional(),
    phone: z.union([z.string().max(32), z.literal(''), z.null()]).optional(),
    job_title: z.union([z.string().max(120), z.literal(''), z.null()]).optional(),
  })
  .superRefine((val, ctx) => {
    if (Object.keys(val).length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Nada para atualizar' });
    }
  });

export type PatchSuperadminTenantUserResult =
  | { ok: true; user: SuperadminTenantUserDetail; changes: Record<string, unknown> }
  | { ok: false; status: number; error: string };

export async function patchSuperadminTenantUser(input: {
  actorUserId: string;
  tenantId: string;
  targetUserId: string;
  body: z.infer<typeof patchSuperadminTenantUserSchema>;
}): Promise<PatchSuperadminTenantUserResult> {
  if (!(await assertTenantExists(input.tenantId))) {
    return { ok: false, status: 404, error: 'Empresa não encontrada' };
  }

  const before = await getSuperadminTenantUser(input.tenantId, input.targetUserId);
  if (!before) {
    return { ok: false, status: 404, error: 'Usuário não encontrado nesta empresa' };
  }
  if (before.is_super_admin) {
    return { ok: false, status: 403, error: 'Não é permitido editar um Super Admin por esta tela.' };
  }

  const changes: Record<string, unknown> = {};
  const userSets: string[] = [];
  const userVals: unknown[] = [];
  let pi = 1;

  if (input.body.email !== undefined) {
    const email = normalizeEmailForUniqueness(input.body.email);
    const dup = await pool.query('SELECT id FROM users WHERE lower(btrim(email)) = $1 AND id <> $2', [
      email,
      input.targetUserId,
    ]);
    if (dup.rows.length > 0) {
      return { ok: false, status: 400, error: 'Este e-mail já está em uso.' };
    }
    if (email !== normalizeEmailForUniqueness(before.email)) {
      changes.email = { from: before.email, to: email };
      userSets.push(`email = $${pi++}`);
      userVals.push(email);
    }
  }

  let phoneDigits: string | null | undefined;
  if (input.body.phone !== undefined) {
    phoneDigits = normalizeWhatsappDigits(input.body.phone ?? null);
    const prevDigits = normalizeWhatsappDigits(before.whatsapp_number);
    if (phoneDigits !== prevDigits) {
      if (phoneDigits) {
        const existingPhone = await pool.query(
          `SELECT id FROM users
           WHERE id <> $2
             AND length(regexp_replace(COALESCE(whatsapp_number, ''), '\\D', '', 'g')) >= 8
             AND regexp_replace(COALESCE(whatsapp_number, ''), '\\D', '', 'g') = $1`,
          [phoneDigits, input.targetUserId],
        );
        if (existingPhone.rows.length > 0) {
          return { ok: false, status: 400, error: 'Este número de WhatsApp já está cadastrado na plataforma.' };
        }
      }
      changes.whatsapp_number = { from: before.whatsapp_number, to: phoneDigits };
      userSets.push(`whatsapp_number = $${pi++}`);
      userVals.push(phoneDigits ?? null);
    }
  }

  if (input.body.full_name !== undefined) {
    const full = input.body.full_name.trim();
    if (full !== (before.full_name ?? '')) {
      changes.full_name = { from: before.full_name, to: full };
      const parts = full.split(/\s+/).filter(Boolean);
      const firstName = parts[0] ?? full;
      const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
      const prof = await pool.query('SELECT id FROM profiles WHERE id = $1', [input.targetUserId]);
      if (prof.rows.length === 0) {
        await pool.query(
          `INSERT INTO profiles (id, first_name, last_name, company_name, registration_complete)
           VALUES ($1, $2, $3, '', true)`,
          [input.targetUserId, firstName, lastName],
        );
      } else {
        await pool.query('UPDATE profiles SET first_name = $1, last_name = $2, updated_at = now() WHERE id = $3', [
          firstName,
          lastName,
          input.targetUserId,
        ]);
      }
    }
  }

  if (input.body.job_title !== undefined) {
    const jt = input.body.job_title?.trim() ?? null;
    if (jt !== (before.job_title?.trim() ?? null)) {
      changes.job_title = { from: before.job_title, to: jt };
      const prof = await pool.query('SELECT id FROM profiles WHERE id = $1', [input.targetUserId]);
      if (prof.rows.length === 0) {
        await pool.query(
          `INSERT INTO profiles (id, first_name, last_name, job_title, company_name, registration_complete)
           VALUES ($1, '', '', $2, '', true)`,
          [input.targetUserId, jt],
        );
      } else {
        await pool.query('UPDATE profiles SET job_title = $1, updated_at = now() WHERE id = $2', [
          jt,
          input.targetUserId,
        ]);
      }
    }
  }

  if (userSets.length > 0) {
    userVals.push(input.targetUserId);
    await pool.query(`UPDATE users SET ${userSets.join(', ')}, updated_at = now() WHERE id = $${pi}`, userVals);
    if (input.body.phone !== undefined) {
      await pool.query('UPDATE profiles SET whatsapp_number = $1, updated_at = now() WHERE id = $2', [
        phoneDigits ?? '',
        input.targetUserId,
      ]);
    }
  }

  if (Object.keys(changes).length === 0) {
    return { ok: true, user: before, changes: {} };
  }

  await logSuperAdminAction(input.actorUserId, 'user_updated_by_superadmin', 'user', input.targetUserId, {
    actor_user_id: input.actorUserId,
    target_user_id: input.targetUserId,
    tenant_id: input.tenantId,
    changes,
    timestamp: new Date().toISOString(),
  });

  const updated = await getSuperadminTenantUser(input.tenantId, input.targetUserId);
  return { ok: true, user: updated!, changes };
}

export const resetPasswordSchema = z
  .object({
    new_password: z.string().min(6, 'Mínimo 6 caracteres'),
    confirm_password: z.string().min(6),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'As senhas não coincidem',
    path: ['confirm_password'],
  });

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function resetSuperadminTenantUserPassword(input: {
  actorUserId: string;
  tenantId: string;
  targetUserId: string;
  newPassword: string;
}): Promise<ResetPasswordResult> {
  if (!(await assertTenantExists(input.tenantId))) {
    return { ok: false, status: 404, error: 'Empresa não encontrada' };
  }

  const user = await getSuperadminTenantUser(input.tenantId, input.targetUserId);
  if (!user) {
    return { ok: false, status: 404, error: 'Usuário não encontrado nesta empresa' };
  }
  if (user.is_super_admin) {
    return { ok: false, status: 403, error: 'Não é permitido redefinir senha de Super Admin por esta tela.' };
  }

  const passwordHash = await hashPassword(input.newPassword);
  await pool.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
    passwordHash,
    input.targetUserId,
  ]);
  await pool.query('DELETE FROM sessions WHERE user_id = $1::uuid', [input.targetUserId]);

  await logSuperAdminAction(
    input.actorUserId,
    'user_password_reset_by_superadmin',
    'user',
    input.targetUserId,
    {
      actor_user_id: input.actorUserId,
      target_user_id: input.targetUserId,
      tenant_id: input.tenantId,
      timestamp: new Date().toISOString(),
    },
  );

  return { ok: true };
}
