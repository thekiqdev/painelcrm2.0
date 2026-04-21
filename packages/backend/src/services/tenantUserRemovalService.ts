/**
 * Remove um usuário do tenant reapontando registros de negócio para o usuário primário,
 * para não violar FKs nem apagar dados do CRM em cascata.
 */
import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';

async function run(
  client: PoolClient,
  sql: string,
  params: unknown[]
): Promise<void> {
  await client.query(sql, params);
}

/** Tabelas com coluna user_id → novo dono (usuário primário da conta). */
const USER_ID_TABLES: string[] = [
  'sales_funnels',
  'funnel_stages',
  'leads',
  'lead_statuses',
  'lead_tasks',
  'clients',
  'client_groups',
  'client_tasks',
  'products',
  'projects',
  'project_lists',
  'project_tasks',
  'project_templates',
  'tasks',
  'invoices',
  'expenses',
  'proposals',
  'proposal_templates',
  'contracts',
  'contract_templates',
  'tickets',
  'ticket_teams',
  'ticket_categories',
  'ticket_sla_policies',
  'ticket_messages',
  'ticket_watchers',
  'ticket_templates',
  'ticket_automations',
  'notifications',
  'message_templates',
  'message_logs',
  'chat_instances',
  'chat_conversations',
  'evolution_api_configs',
  'evolution_servers',
  'whatsapp_connections',
  'conversation_attendances',
  'whatsapp_webhook_events',
  'project_area_comments',
];

export async function reassignTenantUserDataAndDeleteUser(params: {
  tenantId: string;
  primaryUserId: string;
  targetUserId: string;
}): Promise<void> {
  const { tenantId, primaryUserId, targetUserId } = params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tenantCheck = await client.query<{ id: string }>(
      'SELECT id FROM users WHERE id = $1 AND tenant_id = $2',
      [targetUserId, tenantId]
    );
    if (tenantCheck.rows.length === 0) {
      throw new Error('USER_NOT_IN_TENANT');
    }

    /** store_profiles: user_id UNIQUE — evita conflito com o primário. */
    const spBoth = await client.query(
      `SELECT 1 FROM store_profiles WHERE user_id = $1
       INTERSECT SELECT 1 FROM store_profiles WHERE user_id = $2`,
      [primaryUserId, targetUserId]
    );
    if (spBoth.rows.length > 0) {
      await run(client, 'DELETE FROM store_profiles WHERE user_id = $1', [targetUserId]);
    } else {
      await run(client, 'UPDATE store_profiles SET user_id = $1 WHERE user_id = $2', [
        primaryUserId,
        targetUserId,
      ]);
    }

    /** message_templates: UNIQUE (user_id, name, type) */
    await run(
      client,
      `DELETE FROM message_templates t
       WHERE t.user_id = $1
         AND EXISTS (
           SELECT 1 FROM message_templates p
           WHERE p.user_id = $2 AND p.name = t.name AND p.type = t.type
         )`,
      [targetUserId, primaryUserId]
    );

    /** contracts: UNIQUE (user_id, contract_number) */
    await run(
      client,
      `DELETE FROM contracts t
       WHERE t.user_id = $1
         AND EXISTS (
           SELECT 1 FROM contracts p
           WHERE p.user_id = $2 AND p.contract_number = t.contract_number
         )`,
      [targetUserId, primaryUserId]
    );

    /** Carrinhos do usuário removido (evita UNIQUE user_id + store_user_id ao reapontar). */
    await run(client, 'DELETE FROM shopping_carts WHERE user_id = $1 OR store_user_id = $1', [
      targetUserId,
    ]);

    await run(client, 'DELETE FROM super_admin_audit_log WHERE user_id = $1', [targetUserId]);

    for (const table of USER_ID_TABLES) {
      await run(client, `UPDATE ${table} SET user_id = $1 WHERE user_id = $2`, [
        primaryUserId,
        targetUserId,
      ]);
    }

    await run(client, 'UPDATE orders SET store_user_id = $1 WHERE store_user_id = $2', [
      primaryUserId,
      targetUserId,
    ]);
    await run(client, 'UPDATE orders SET customer_user_id = $1 WHERE customer_user_id = $2', [
      primaryUserId,
      targetUserId,
    ]);

    await run(client, 'UPDATE tasks SET assignee_id = NULL WHERE assignee_id = $1', [targetUserId]);
    await run(client, 'UPDATE tickets SET assignee_id = NULL WHERE assignee_id = $1', [targetUserId]);
    await run(client, 'UPDATE project_tasks SET assignee_id = NULL WHERE assignee_id = $1', [
      targetUserId,
    ]);
    await run(client, 'UPDATE products SET responsible_id = NULL WHERE responsible_id = $1', [
      targetUserId,
    ]);
    await run(client, 'UPDATE contracts SET responsible_id = NULL WHERE responsible_id = $1', [
      targetUserId,
    ]);
    await run(client, 'UPDATE conversation_attendances SET attendant_id = NULL WHERE attendant_id = $1', [
      targetUserId,
    ]);
    await run(client, 'UPDATE ticket_activities SET user_id = NULL WHERE user_id = $1', [targetUserId]);

    await run(client, 'UPDATE user_roles SET created_by = $1 WHERE created_by = $2', [
      primaryUserId,
      targetUserId,
    ]);
    await run(client, 'UPDATE user_permissions SET created_by = $1 WHERE created_by = $2', [
      primaryUserId,
      targetUserId,
    ]);
    await run(client, 'UPDATE profile_members SET created_by = $1 WHERE created_by = $2', [
      primaryUserId,
      targetUserId,
    ]);
    await run(client, 'UPDATE user_custom_roles SET created_by = $1 WHERE created_by = $2', [
      primaryUserId,
      targetUserId,
    ]);
    await run(
      client,
      'UPDATE tenant_chat_templates SET created_by_user_id = $1 WHERE created_by_user_id = $2',
      [primaryUserId, targetUserId],
    );
    await run(
      client,
      'UPDATE whatsapp_message_templates SET created_by_user_id = $1 WHERE created_by_user_id = $2',
      [primaryUserId, targetUserId],
    );
    await run(client, 'UPDATE contract_events SET created_by = $1 WHERE created_by = $2', [
      primaryUserId,
      targetUserId,
    ]);

    await run(client, 'DELETE FROM sessions WHERE user_id = $1', [targetUserId]);
    await run(client, 'DELETE FROM team_members WHERE user_id = $1', [targetUserId]);

    await run(client, 'DELETE FROM users WHERE id = $1 AND tenant_id = $2', [targetUserId, tenantId]);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
