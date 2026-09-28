import type { Pool } from 'pg';
import { CHAT_INSTANCE_OPERABLE_STATUS_SQL } from '../chatInstanceOperableStatus.js';

/**
 * Resolve um user_id do tenant com instância WhatsApp UazAPI operable (`connected` | `open`).
 * Preferência por `preferredUserId` quando esse utilizador tem instância ativa.
 * Fallback: qualquer instância recente do preferred/tenant (status stale) — o dispatch faz refresh live.
 */
export async function resolveWhatsAppSenderUserIdForTenant(
  pool: Pool,
  tenantId: string,
  preferredUserId: string | null | undefined,
): Promise<string | null> {
  if (preferredUserId) {
    const prefOperable = await pool.query<{ id: string }>(
      `SELECT u.id::text AS id
       FROM users u
       INNER JOIN chat_instances i ON i.user_id = u.id AND ${CHAT_INSTANCE_OPERABLE_STATUS_SQL}
       WHERE u.id = $1 AND u.tenant_id = $2
       ORDER BY i.updated_at DESC NULLS LAST
       LIMIT 1`,
      [preferredUserId, tenantId],
    );
    if (prefOperable.rows[0]?.id) return prefOperable.rows[0].id;

    const prefAny = await pool.query<{ id: string }>(
      `SELECT u.id::text AS id
       FROM users u
       INNER JOIN chat_instances i ON i.user_id = u.id
       WHERE u.id = $1 AND u.tenant_id = $2
       ORDER BY i.updated_at DESC NULLS LAST
       LIMIT 1`,
      [preferredUserId, tenantId],
    );
    if (prefAny.rows[0]?.id) return prefAny.rows[0].id;
  }

  const operable = await pool.query<{ id: string }>(
    `SELECT u.id::text AS id
     FROM users u
     INNER JOIN chat_instances i ON i.user_id = u.id AND ${CHAT_INSTANCE_OPERABLE_STATUS_SQL}
     WHERE u.tenant_id = $1
     ORDER BY i.updated_at DESC NULLS LAST
     LIMIT 1`,
    [tenantId],
  );
  if (operable.rows[0]?.id) return operable.rows[0].id;

  const any = await pool.query<{ id: string }>(
    `SELECT u.id::text AS id
     FROM users u
     INNER JOIN chat_instances i ON i.user_id = u.id
     WHERE u.tenant_id = $1
     ORDER BY i.updated_at DESC NULLS LAST
     LIMIT 1`,
    [tenantId],
  );
  return any.rows[0]?.id ?? null;
}
