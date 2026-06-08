/**
 * Pré-requisitos para excluir tenant: remove vínculos que bloqueiam DELETE em users
 * (ex.: chat_kanban_boards.created_by_user_id ON DELETE RESTRICT).
 */
import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';

async function kanbanBoardsTableExists(client: PoolClient): Promise<boolean> {
  const r = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'chat_kanban_boards'`,
  );
  return (r.rows[0]?.c ?? '0') === '1';
}

/**
 * Remove quadros Kanban do tenant e quadros em outros tenants criados por usuários deste tenant.
 */
export async function purgeKanbanBoardsBlockingTenantUserDelete(
  client: PoolClient,
  tenantId: string,
): Promise<{ boardsRemoved: number }> {
  if (!(await kanbanBoardsTableExists(client))) {
    return { boardsRemoved: 0 };
  }

  const delTenant = await client.query(
    `DELETE FROM chat_kanban_boards WHERE tenant_id = $1::uuid`,
    [tenantId],
  );

  const delByCreator = await client.query(
    `DELETE FROM chat_kanban_boards
     WHERE created_by_user_id IN (SELECT id FROM users WHERE tenant_id = $1::uuid)`,
    [tenantId],
  );

  const boardsRemoved = (delTenant.rowCount ?? 0) + (delByCreator.rowCount ?? 0);
  return { boardsRemoved };
}

export async function deleteTenantWithDependencies(tenantId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await purgeKanbanBoardsBlockingTenantUserDelete(client, tenantId);
    await client.query('DELETE FROM users WHERE tenant_id = $1::uuid', [tenantId]);
    await client.query('DELETE FROM tenants WHERE id = $1::uuid', [tenantId]);
    await client.query('COMMIT');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}
