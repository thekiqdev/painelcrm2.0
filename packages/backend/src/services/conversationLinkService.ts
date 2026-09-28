import { pool } from '../utils/db.js';
import { createClientTimelineEvent } from './clientTimelineEventsService.js';
import { applyKanbanAutomationForConversation } from './chatKanbanAutomationService.js';
import { ensureConversationAvatarCachedAndReplicateToCrm } from './whatsappAvatarCacheService.js';

export interface LeadToClientMigrationContext {
  actorUserId: string;
  reason: 'lead_converted' | 'manual_relink';
}

/**
 * Migração explícita de vínculo de conversa: lead -> cliente.
 * Não deve ser chamada em fluxos de leitura (GET).
 */
export async function migrateConversationLeadToClient(params: {
  conversationId: string;
  userId: string;
  clientId: string;
  previousLeadId?: string | null;
  context: LeadToClientMigrationContext;
}): Promise<void> {
  const ownerTenant = await pool.query<{ tenant_id: string | null }>(
    `SELECT tenant_id FROM users WHERE id = $1 LIMIT 1`,
    [params.userId]
  );
  const conversationTenantId = ownerTenant.rows[0]?.tenant_id ?? null;
  if (!conversationTenantId) {
    throw new Error('migrateConversationLeadToClient: dono da conversa sem tenant_id');
  }
  const clientInTenant = await pool.query(
    `SELECT 1 FROM clients c
     INNER JOIN users uc ON uc.id = c.user_id AND uc.tenant_id = $2
     WHERE c.id = $1
     LIMIT 1`,
    [params.clientId, conversationTenantId]
  );
  if ((clientInTenant.rowCount ?? 0) === 0) {
    throw new Error(
      'migrateConversationLeadToClient: clientId não pertence à empresa do dono da conversa'
    );
  }

  const payload = {
    link_source: 'system',
    link_confidence: 'high',
    link_state: 'client_linked',
    link_migration: {
      type: 'lead_to_client',
      at: new Date().toISOString(),
      previous_lead_id: params.previousLeadId ?? null,
      new_client_id: params.clientId,
      actor_user_id: params.context.actorUserId,
      reason: params.context.reason,
    },
  };

  await pool.query(
    `
    UPDATE chat_conversations
    SET client_id = $1,
        lead_id = NULL,
        metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
        updated_at = now()
    WHERE id = $3
      AND user_id = $4
    `,
    [params.clientId, JSON.stringify(payload), params.conversationId, params.userId]
  );

  const tenantId = conversationTenantId;
  if (tenantId) {
    await createClientTimelineEvent({
      tenantId,
      clientId: params.clientId,
      eventName: 'chat_link_migrated_lead_to_client',
      source: 'chat',
      actorType: 'system',
      actorId: params.context.actorUserId,
      referenceType: 'chat_conversation',
      referenceId: params.conversationId,
      eventKey: `chat_link_migrated_lead_to_client:${params.conversationId}:${params.clientId}`,
      metadata: {
        previous_lead_id: params.previousLeadId ?? null,
        reason: params.context.reason,
      },
    });
  }

  await ensureConversationAvatarCachedAndReplicateToCrm({
    conversationId: params.conversationId,
    userId: params.userId,
    tenantId,
  });

  void applyKanbanAutomationForConversation({
    tenantId,
    actorUserId: params.context.actorUserId,
    conversationId: params.conversationId,
    reason: 'client_linked',
  }).catch((err) => console.error('[kanban-entry-automation] lead_to_client migration', err));
}
