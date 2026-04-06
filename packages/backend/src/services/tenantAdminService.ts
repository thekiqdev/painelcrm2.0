/**
 * Criação do usuário administrador (owner) de um tenant.
 * Usado no checkout (com senha placeholder) e no onboarding fallback (com senha real).
 */
import type { Pool, PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import { hashPassword } from '../utils/bcrypt.js';
import { normalizeEmailForUniqueness } from '../utils/userIdentity.js';
import { getPermissionsForRole } from './rolePermissionsService.js';
import type { AppRole } from './rolePermissionsService.js';

export interface CreateTenantAdminInput {
  tenantId: string;
  tenantName: string;
  email: string;
  responsibleName?: string;
  /** Se não informado, usa senha placeholder (troca no onboarding). */
  password?: string;
  /** Dígitos normalizados; mesma fonte de verdade que unicidade (users.whatsapp_number). */
  whatsappDigits?: string | null;
}

type DbQueryable = Pick<Pool | PoolClient, 'query'>;

/**
 * Cria usuário administrador do tenant: users, profiles, user_profiles, profile_members, user_roles, user_permissions.
 * E-mail único na plataforma (não pode existir em outro tenant).
 */
export async function createTenantAdminUser(
  input: CreateTenantAdminInput,
  options?: { db?: DbQueryable }
): Promise<{ userId: string; email: string }> {
  const db = options?.db ?? pool;
  const email = normalizeEmailForUniqueness(input.email);
  const passwordHash = input.password
    ? await hashPassword(input.password)
    : await hashPassword(`PENDING_${input.tenantId}_${email}_${Date.now()}`);

  const wa = input.whatsappDigits?.trim() ?? '';
  const registrationComplete = Boolean(input.password);

  const fullName = (input.responsibleName ?? email.split('@')[0]).trim();
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] ?? fullName;
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

  const globalDup = await db.query<{ id: string; tenant_id: string | null }>(
    'SELECT id, tenant_id FROM users WHERE lower(btrim(email)) = $1 LIMIT 1',
    [email]
  );
  if (globalDup.rows.length > 0) {
    const row = globalDup.rows[0];
    if (row.tenant_id === input.tenantId) {
      return { userId: row.id, email };
    }
    const err = new Error('EMAIL_ALREADY_REGISTERED_OTHER_TENANT');
    (err as Error & { code?: string }).code = 'EMAIL_GLOBAL_DUPLICATE';
    throw err;
  }

  let user: { id: string; email: string };
  try {
    const userResult = await db.query<{ id: string; email: string }>(
      `INSERT INTO users (email, password_hash, tenant_id, whatsapp_number)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email`,
      [email, passwordHash, input.tenantId, wa || null]
    );
    user = userResult.rows[0];
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === '23505') {
      const existing = await db.query<{ id: string; email: string }>(
        'SELECT id, email FROM users WHERE tenant_id = $1 AND lower(btrim(email)) = $2 LIMIT 1',
        [input.tenantId, email]
      );
      if (existing.rows.length > 0) {
        return { userId: existing.rows[0].id, email: existing.rows[0].email };
      }
    }
    throw err;
  }

  const profileExists = await db.query('SELECT 1 FROM profiles WHERE id = $1', [user.id]);
  if (profileExists.rows.length === 0) {
    await db.query(
      `INSERT INTO profiles (id, first_name, last_name, company_name, whatsapp_number, registration_complete)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, firstName, lastName, input.tenantName, wa, registrationComplete]
    );
  }

  const profileRow = await db.query<{ id: string }>(
    `SELECT up.id
     FROM user_profiles up
     WHERE up.owner_id IN (
       SELECT u.id
       FROM users u
       WHERE u.id = $1 AND u.tenant_id = $2
     )
     LIMIT 1`,
    [user.id, input.tenantId]
  );
  if (profileRow.rows.length === 0) {
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO user_profiles (owner_id, name, description, is_admin) VALUES ($1, $2, NULL, true) RETURNING id`,
      [user.id, input.tenantName]
    );
    const profileId = inserted.rows[0].id;
    await db.query(
      'INSERT INTO profile_members (profile_id, user_id, created_by) VALUES ($1, $2, $3)',
      [profileId, user.id, user.id]
    );
    await db.query(
      `INSERT INTO user_roles (user_id, role, profile_id, created_by) VALUES ($1, 'admin', $2, $3)`,
      [user.id, profileId, user.id]
    );
    const adminPerms = getPermissionsForRole('admin' as AppRole);
    for (const permission of adminPerms) {
      await db.query(
        `INSERT INTO user_permissions (user_id, profile_id, permission, created_by) VALUES ($1, $2, $3, $4)`,
        [user.id, profileId, permission, user.id]
      );
    }
  }

  return { userId: user.id, email: user.email };
}
