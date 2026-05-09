import { pool } from './db.js';

export async function resolveTenantIdForUser(userId: string): Promise<string | null> {
  const r = await pool.query<{ tenant_id: string }>(
    `SELECT tenant_id::text AS tenant_id FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  return r.rows[0]?.tenant_id ?? null;
}
