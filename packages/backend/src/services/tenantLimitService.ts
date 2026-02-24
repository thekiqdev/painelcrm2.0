import { pool } from '../utils/db.js';

/**
 * Retorna o limite efetivo para o tenant: override do tenant se preenchido, senão limite do plano.
 */
export async function getTenantLimit(
  tenantId: string,
  planLimitKey: 'max_users' | 'max_profiles' | 'max_whatsapp_instances',
  tenantOverrideKey: 'max_users_override' | 'max_profiles_override' | 'max_whatsapp_instances_override'
): Promise<number | null> {
  const row = await pool.query(
    `SELECT t.${tenantOverrideKey} AS override_val, p.${planLimitKey} AS plan_val
     FROM tenants t
     JOIN plans p ON p.id = t.plan_id
     WHERE t.id = $1`,
    [tenantId]
  );
  if (row.rows.length === 0) return null;
  const r = row.rows[0];
  if (r.override_val != null) return Number(r.override_val);
  return r.plan_val != null ? Number(r.plan_val) : null;
}

/**
 * Verifica se o tenant pode adicionar mais usuários (respeita override e depois max_users do plano).
 */
export async function checkTenantUsersLimit(tenantId: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number | null;
}> {
  const limit = await getTenantLimit(tenantId, 'max_users', 'max_users_override');
  const countRow = await pool.query(
    'SELECT COUNT(*)::int AS c FROM users WHERE tenant_id = $1',
    [tenantId]
  );
  const current = countRow.rows[0]?.c ?? 0;
  if (limit == null) return { allowed: true, current, limit: null };
  return { allowed: current < limit, current, limit };
}

/**
 * Verifica se o tenant pode adicionar mais perfis (respeita override e depois max_profiles do plano).
 */
export async function checkTenantProfilesLimit(tenantId: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number | null;
}> {
  const limit = await getTenantLimit(tenantId, 'max_profiles', 'max_profiles_override');
  const countRow = await pool.query(
    `SELECT COUNT(*)::int AS c FROM user_profiles up
     JOIN users u ON u.id = up.owner_id AND u.tenant_id = $1`,
    [tenantId]
  );
  const current = countRow.rows[0]?.c ?? 0;
  if (limit == null) return { allowed: true, current, limit: null };
  return { allowed: current < limit, current, limit };
}

/**
 * Conta instâncias WhatsApp (chat_instances) dos usuários do tenant.
 * Limite: override do tenant ou max_whatsapp_instances do plano.
 */
export async function checkTenantWhatsAppInstancesLimit(tenantId: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number | null;
}> {
  const limit = await getTenantLimit(tenantId, 'max_whatsapp_instances', 'max_whatsapp_instances_override');
  let current = 0;
  try {
    const countRow = await pool.query(
      `SELECT COUNT(*)::int AS c FROM chat_instances ci
       JOIN users u ON u.id = ci.user_id AND u.tenant_id = $1`,
      [tenantId]
    );
    current = countRow.rows[0]?.c ?? 0;
  } catch {
    // chat_instances pode não existir
  }
  if (limit == null) return { allowed: true, current, limit: null };
  return { allowed: current < limit, current, limit };
}
