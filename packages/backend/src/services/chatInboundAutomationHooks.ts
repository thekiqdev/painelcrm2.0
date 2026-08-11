import { pool } from '../utils/db.js';
import {
  hasAttendanceColumns,
  hasChatAutomationTables,
} from '../utils/chatAttendanceSchema.js';
import { conversationRowForClientApi } from '../utils/uazapiIdentityResolve.js';
import { emitConversationAttendanceUpdated } from './websocketService.js';
import { getOrCreateAutomationSettings } from './chatAutomationSettingsService.js';
import {
  applyAutomationRules,
  loadConversationForAutomation,
  tryAutoAssignFromQueue,
} from './chatDistributionService.js';
import { insertChatAutomationLog } from './chatAutomationLogService.js';

/**
 * Atualização rápida de estado da conversa (Fase 6) — chamado síncrono no saveMessage.
 */
export async function applyChatPhase6MessageStatus(
  conversationId: string,
  direction: 'incoming' | 'outgoing'
): Promise<void> {
  if (!(await hasChatAutomationTables())) return;
  if (!(await hasAttendanceColumns())) return;

  const conv = await loadConversationForAutomation(conversationId);
  if (!conv?.owner_tenant_id) return;

  const settings = await getOrCreateAutomationSettings(conv.owner_tenant_id);
  if (!settings.automation_enabled) return;

  if (direction === 'incoming' && settings.auto_status_from_customer) {
    await pool.query(
      `UPDATE chat_conversations SET
         attendance_status = CASE
           WHEN attendance_status = 'archived' THEN attendance_status
           WHEN assigned_to_user_id IS NOT NULL THEN 'in_progress'
           WHEN attendance_status = 'closed' THEN 'pending'
           ELSE attendance_status
         END,
         closed_at = CASE
           WHEN attendance_status = 'closed' THEN NULL
           ELSE closed_at
         END,
         closed_by = CASE
           WHEN attendance_status = 'closed' THEN NULL
           ELSE closed_by
         END,
         updated_at = now()
       WHERE id = $1`,
      [conversationId]
    );
    await emitPhase6AttendancePayload(conv.owner_tenant_id, conversationId, conv.user_id);
    return;
  }

  if (direction === 'outgoing' && settings.auto_status_from_agent) {
    /** Outgoing em closed = iniciar de novo (não manter encerrada). archived permanece. */
    await pool.query(
      `UPDATE chat_conversations SET
         attendance_status = CASE
           WHEN attendance_status = 'archived' THEN attendance_status
           WHEN attendance_status = 'closed' THEN
             CASE
               WHEN assigned_to_user_id IS NOT NULL THEN 'waiting_customer'
               ELSE 'pending'
             END
           ELSE 'waiting_customer'
         END,
         closed_at = CASE
           WHEN attendance_status = 'closed' THEN NULL
           ELSE closed_at
         END,
         closed_by = CASE
           WHEN attendance_status = 'closed' THEN NULL
           ELSE closed_by
         END,
         updated_at = now()
       WHERE id = $1`,
      [conversationId]
    );
    await emitPhase6AttendancePayload(conv.owner_tenant_id, conversationId, conv.user_id);
  }
}

async function emitPhase6AttendancePayload(
  tenantId: string,
  conversationId: string,
  ownerUserId: string
): Promise<void> {
  try {
    const fresh = await pool.query(`SELECT * FROM chat_conversations WHERE id = $1`, [conversationId]);
    const row = fresh.rows[0];
    if (!row) return;
    const convPayload = conversationRowForClientApi(row as Record<string, unknown>);
    emitConversationAttendanceUpdated(tenantId, ownerUserId, convPayload);
  } catch {
    /* não bloquear saveMessage */
  }
}

/**
 * Regras + distribuição após mensagem recebida (assíncrono).
 */
export async function runInboundChatRoutingAsync(options: {
  conversationId: string;
  messageBody: string | null;
  inserted: boolean;
}): Promise<void> {
  try {
    if (!options.inserted) return;
    if (!(await hasChatAutomationTables())) return;
    if (!(await hasAttendanceColumns())) return;

    let conv = await loadConversationForAutomation(options.conversationId);
    if (!conv?.owner_tenant_id) return;
    const tenantId = conv.owner_tenant_id;

    const settings = await getOrCreateAutomationSettings(tenantId);
    if (!settings.automation_enabled) return;

    if (conv.assigned_to_user_id) return;

    conv = await applyAutomationRules(tenantId, conv, options.messageBody);

    if (!settings.distribution_enabled) return;

    if (conv.assigned_to_user_id) return;

    if (conv.queue_id) {
      const ok = await tryAutoAssignFromQueue({
        tenantId,
        conversationId: conv.id,
        queueId: conv.queue_id,
        actorUserIdForAudit: conv.user_id,
      });
      if (ok) return;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      const conv = await loadConversationForAutomation(options.conversationId);
      if (conv?.owner_tenant_id) {
        await insertChatAutomationLog({
          tenantId: conv.owner_tenant_id,
          conversationId: options.conversationId,
          ruleId: null,
          eventType: 'inbound_routing',
          actionType: 'error',
          result: 'error',
          errorMessage: msg,
          metadata: {},
        });
      }
    } catch {
      /* ignore */
    }
    console.warn('[runInboundChatRoutingAsync]', msg);
  }
}
