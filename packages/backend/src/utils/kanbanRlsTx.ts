import type { PoolClient } from 'pg';
import { escapeSetLocalAppValue } from './db.js';

/** Transação Kanban: RLS exige `app.current_tenant_id` na mesma sessão que o UPDATE. */
export async function beginKanbanTxWithRls(
  client: PoolClient,
  tenantId: string,
  actorUserId: string,
): Promise<void> {
  await client.query('BEGIN');
  const st = escapeSetLocalAppValue(tenantId);
  const su = escapeSetLocalAppValue(actorUserId);
  await client.query(`SET LOCAL app.current_tenant_id = '${st}'`);
  await client.query(`SET LOCAL app.actor_user_id = '${su}'`);
}
