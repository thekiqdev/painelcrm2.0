import type { Pool } from 'pg';

/**
 * Resolve um user_id do tenant com instância WhatsApp UazAPI em estado `connected`.
 * Preferência por `preferredUserId` quando esse utilizador tem instância ativa.
 */
export async function resolveWhatsAppSenderUserIdForTenant(
  pool: Pool,
  tenantId: string,
  preferredUserId: string | null | undefined,
): Promise<string | null> {
  if (preferredUserId) {
    const pref = await pool.query<{ id: string }>(
      `SELECT u.id::text AS id
       FROM users u
       INNER JOIN chat_instances i ON i.user_id = u.id AND i.status = 'connected'
       WHERE u.id = $1 AND u.tenant_id = $2
       LIMIT 1`,
      [preferredUserId, tenantId],
    );
    if (pref.rows[0]?.id) return pref.rows[0].id;
  }

  const r = await pool.query<{ id: string }>(
    `SELECT u.id::text AS id
     FROM users u
     INNER JOIN chat_instances i ON i.user_id = u.id AND i.status = 'connected'
     WHERE u.tenant_id = $1
     ORDER BY i.updated_at DESC NULLS LAST
     LIMIT 1`,
    [tenantId],
  );
  return r.rows[0]?.id ?? null;
}
