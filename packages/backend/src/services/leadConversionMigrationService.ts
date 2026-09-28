import type { PoolClient } from 'pg';

export type MigrateLeadToClientParams = {
  tenantId: string;
  leadId: string;
  clientId: string;
  actorUserId: string;
};

/**
 * Propostas do lead passam a apontar para o cliente (mesma regra já usada em updateLead).
 */
export async function migrateProposalsLeadToClientInTransaction(
  client: PoolClient,
  params: MigrateLeadToClientParams,
): Promise<number> {
  const result = await client.query(
    `UPDATE proposals p
     SET client_id = $1::uuid, lead_id = NULL, updated_at = now()
     FROM users u
     WHERE p.user_id = u.id
       AND u.tenant_id = $2::uuid
       AND p.lead_id = $3::uuid
       AND p.client_id IS NULL`,
    [params.clientId, params.tenantId, params.leadId],
  );
  return result.rowCount ?? 0;
}

/**
 * Tickets do lead passam a apontar para o cliente; registra atividade por ticket migrado.
 */
export async function migrateTicketsLeadToClientInTransaction(
  client: PoolClient,
  params: MigrateLeadToClientParams,
): Promise<number> {
  const result = await client.query<{ id: string }>(
    `WITH updated AS (
       UPDATE tickets t
       SET
         client_id = $1::uuid,
         lead_id = NULL,
         updated_at = now()
       FROM users u
       WHERE t.user_id = u.id
         AND u.tenant_id = $2::uuid
         AND t.lead_id = $3::uuid
       RETURNING t.id
     )
     INSERT INTO ticket_activities (ticket_id, user_id, activity_type, metadata)
     SELECT
       u.id,
       $4::uuid,
       'lead_converted_to_client',
       jsonb_build_object(
         'type', 'lead_converted_to_client',
         'ticket_id', u.id::text,
         'lead_id', $3::text,
         'client_id', $1::text
       )
     FROM updated u
     RETURNING ticket_id`,
    [params.clientId, params.tenantId, params.leadId, params.actorUserId],
  );
  return result.rowCount ?? 0;
}

/** Migra propostas + tickets na mesma transação (conversão lead → cliente). */
export async function migrateLeadLinkedCrmRecordsToClient(
  client: PoolClient,
  params: MigrateLeadToClientParams,
): Promise<{ proposalsUpdated: number; ticketsUpdated: number }> {
  const proposalsUpdated = await migrateProposalsLeadToClientInTransaction(client, params);
  const ticketsUpdated = await migrateTicketsLeadToClientInTransaction(client, params);
  return { proposalsUpdated, ticketsUpdated };
}
