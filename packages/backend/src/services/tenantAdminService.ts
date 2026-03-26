/**
 * Criação do usuário administrador (owner) de um tenant.
 * Usado no checkout (com senha placeholder) e no onboarding fallback (com senha real).
 */
import { pool } from '../utils/db.js';
import { hashPassword } from '../utils/bcrypt.js';
import { getPermissionsForRole } from './rolePermissionsService.js';
import type { AppRole } from './rolePermissionsService.js';

export interface CreateTenantAdminInput {
  tenantId: string;
  tenantName: string;
  email: string;
  responsibleName?: string;
  /** Se não informado, usa senha placeholder (troca no onboarding). */
  password?: string;
}

/**
 * Cria usuário administrador do tenant: users, profiles, user_profiles, profile_members, user_roles, user_permissions.
 * Email é normalizado (lowercase). Mesmo email pode existir em outro tenant (UNIQUE tenant_id + email).
 */
export async function createTenantAdminUser(input: CreateTenantAdminInput): Promise<{ userId: string; email: string }> {
  const email = input.email.trim().toLowerCase();
  const passwordHash = input.password
    ? await hashPassword(input.password)
    : await hashPassword(`PENDING_${input.tenantId}_${email}_${Date.now()}`);

  const fullName = (input.responsibleName ?? email.split('@')[0]).trim();
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] ?? fullName;
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

  let user: { id: string; email: string };
  try {
    const userResult = await pool.query<{ id: string; email: string }>(
      `INSERT INTO users (email, password_hash, tenant_id)
       VALUES ($1, $2, $3)
       RETURNING id, email`,
      [email, passwordHash, input.tenantId]
    );
    user = userResult.rows[0];
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === '23505') {
      const existing = await pool.query<{ id: string; email: string }>(
        'SELECT id, email FROM users WHERE tenant_id = $1 AND email = $2 LIMIT 1',
        [input.tenantId, email]
      );
      if (existing.rows.length > 0) {
        return { userId: existing.rows[0].id, email: existing.rows[0].email };
      }
    }
    throw err;
  }

  const profileExists = await pool.query('SELECT 1 FROM profiles WHERE id = $1', [user.id]);
  if (profileExists.rows.length === 0) {
    await pool.query(
      `INSERT INTO profiles (id, first_name, last_name, company_name, whatsapp_number, registration_complete)
       VALUES ($1, $2, $3, $4, '', false)`,
      [user.id, firstName, lastName, input.tenantName]
    );
  }

  const profileRow = await pool.query<{ id: string }>(
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
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO user_profiles (owner_id, name, description, is_admin) VALUES ($1, $2, NULL, true) RETURNING id`,
      [user.id, input.tenantName]
    );
    const profileId = inserted.rows[0].id;
    await pool.query(
      'INSERT INTO profile_members (profile_id, user_id, created_by) VALUES ($1, $2, $3)',
      [profileId, user.id, user.id]
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role, profile_id, created_by) VALUES ($1, 'admin', $2, $3)`,
      [user.id, profileId, user.id]
    );
    const adminPerms = getPermissionsForRole('admin' as AppRole);
    for (const permission of adminPerms) {
      await pool.query(
        `INSERT INTO user_permissions (user_id, profile_id, permission, created_by) VALUES ($1, $2, $3, $4)`,
        [user.id, profileId, permission, user.id]
      );
    }
  }

  return { userId: user.id, email: user.email };
}
