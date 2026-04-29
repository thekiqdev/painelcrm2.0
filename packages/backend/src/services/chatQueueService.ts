import { pool } from '../utils/db.js';

export type ChatQueueRow = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  color: string | null;
  is_active: boolean;
  sla_first_response_minutes: number | null;
  sla_next_response_minutes: number | null;
  created_at: Date;
  updated_at: Date;
};

export async function listQueuesForTenant(tenantId: string): Promise<ChatQueueRow[]> {
  const r = await pool.query<ChatQueueRow>(
    `SELECT id, tenant_id, name, description, color, is_active,
            sla_first_response_minutes, sla_next_response_minutes,
            created_at, updated_at
     FROM chat_queues
     WHERE tenant_id = $1
     ORDER BY name`,
    [tenantId]
  );
  return r.rows;
}

export async function createQueue(
  tenantId: string,
  input: { name: string; description?: string | null; color?: string | null }
): Promise<ChatQueueRow> {
  const r = await pool.query<ChatQueueRow>(
    `INSERT INTO chat_queues (tenant_id, name, description, color)
     VALUES ($1, $2, $3, $4)
     RETURNING id, tenant_id, name, description, color, is_active,
       sla_first_response_minutes, sla_next_response_minutes, created_at, updated_at`,
    [tenantId, input.name.trim(), input.description ?? null, input.color ?? null]
  );
  return r.rows[0]!;
}

export async function patchQueue(
  tenantId: string,
  queueId: string,
  patch: Partial<{
    name: string;
    description: string | null;
    color: string | null;
    is_active: boolean;
    sla_first_response_minutes: number | null;
    sla_next_response_minutes: number | null;
  }>
): Promise<ChatQueueRow | null> {
  const updates: string[] = [];
  const vals: unknown[] = [];
  let n = 1;
  if (patch.name != null) {
    updates.push(`name = $${n++}`);
    vals.push(patch.name.trim());
  }
  if (patch.description !== undefined) {
    updates.push(`description = $${n++}`);
    vals.push(patch.description);
  }
  if (patch.color !== undefined) {
    updates.push(`color = $${n++}`);
    vals.push(patch.color);
  }
  if (patch.is_active !== undefined) {
    updates.push(`is_active = $${n++}`);
    vals.push(patch.is_active);
  }
  if (patch.sla_first_response_minutes !== undefined) {
    updates.push(`sla_first_response_minutes = $${n++}`);
    vals.push(patch.sla_first_response_minutes);
  }
  if (patch.sla_next_response_minutes !== undefined) {
    updates.push(`sla_next_response_minutes = $${n++}`);
    vals.push(patch.sla_next_response_minutes);
  }
  if (updates.length === 0) {
    const cur = await pool.query<ChatQueueRow>(
      `SELECT id, tenant_id, name, description, color, is_active,
              sla_first_response_minutes, sla_next_response_minutes, created_at, updated_at
       FROM chat_queues WHERE id = $1 AND tenant_id = $2`,
      [queueId, tenantId]
    );
    return cur.rows[0] ?? null;
  }
  vals.push(queueId, tenantId);
  const r = await pool.query<ChatQueueRow>(
    `UPDATE chat_queues SET ${updates.join(', ')}, updated_at = now()
     WHERE id = $${n} AND tenant_id = $${n + 1}
     RETURNING id, tenant_id, name, description, color, is_active,
       sla_first_response_minutes, sla_next_response_minutes, created_at, updated_at`,
    vals
  );
  return r.rows[0] ?? null;
}

export async function assertQueueInTenant(tenantId: string, queueId: string): Promise<boolean> {
  const r = await pool.query(`SELECT 1 FROM chat_queues WHERE id = $1 AND tenant_id = $2`, [
    queueId,
    tenantId,
  ]);
  return (r.rowCount ?? 0) > 0;
}
