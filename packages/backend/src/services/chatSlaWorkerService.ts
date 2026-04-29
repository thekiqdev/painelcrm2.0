import { pool } from '../utils/db.js';
import {
  hasAttendanceColumns,
  hasChatAutomationTables,
  hasChatPhase5SlaColumns,
} from '../utils/chatAttendanceSchema.js';
import * as notifications from './notifications.js';
import { chatInboxHref, loadChatNotificationDisplayContext } from './chatNotificationContext.js';
import { conversationRowForClientApi } from '../utils/uazapiIdentityResolve.js';
import { emitConversationAttendanceUpdated } from './websocketService.js';

/** Minutos entre níveis de escalonamento (assignee → equipa → supervisor). */
const ESCALATION_GAP_MINUTES = 15;

type ConvSlaRow = {
  id: string;
  user_id: string;
  tenant_id: string;
  queue_id: string | null;
  assigned_to_user_id: string | null;
  assigned_team_id: string | null;
  last_customer_message_at: Date | null;
  first_response_at: Date | null;
  last_agent_message_at: Date | null;
};

async function teamIdsForConversation(
  tenantId: string,
  queueId: string | null,
  assignedTeamId: string | null
): Promise<string[]> {
  if (assignedTeamId) return [assignedTeamId];
  if (!queueId) return [];
  const r = await pool.query<{ team_id: string | null }>(
    `SELECT team_id FROM chat_queue_distribution WHERE tenant_id = $1 AND queue_id = $2`,
    [tenantId, queueId]
  );
  const tid = r.rows[0]?.team_id;
  return tid ? [tid] : [];
}

async function listTeamMemberUserIds(teamIds: string[]): Promise<string[]> {
  if (teamIds.length === 0) return [];
  const r = await pool.query<{ user_id: string }>(
    `SELECT DISTINCT tm.user_id FROM team_members tm WHERE tm.team_id = ANY($1::uuid[])`,
    [teamIds]
  );
  return r.rows.map((x) => x.user_id);
}

async function listTenantSupervisorUserIds(tenantId: string): Promise<string[]> {
  const r = await pool.query<{ id: string }>(
    `SELECT u.id FROM users u
     INNER JOIN user_profiles p ON p.owner_id = u.id
     WHERE u.tenant_id = $1 AND p.is_admin = true`,
    [tenantId]
  );
  return r.rows.map((x) => x.id);
}

async function lastFrAlert(
  conversationId: string,
  since: Date
): Promise<{ alert_type: string; created_at: Date } | null> {
  const r = await pool.query<{ alert_type: string; created_at: Date }>(
    `SELECT alert_type, created_at FROM chat_sla_alert_log
     WHERE conversation_id = $1
       AND alert_type IN ('sla_fr_a', 'sla_fr_b', 'sla_fr_c')
       AND created_at >= $2
     ORDER BY created_at DESC LIMIT 1`,
    [conversationId, since]
  );
  return r.rows[0] ?? null;
}

async function lastNrAlert(
  conversationId: string,
  since: Date
): Promise<{ alert_type: string; created_at: Date } | null> {
  const r = await pool.query<{ alert_type: string; created_at: Date }>(
    `SELECT alert_type, created_at FROM chat_sla_alert_log
     WHERE conversation_id = $1
       AND alert_type IN ('sla_nr_a', 'sla_nr_b', 'sla_nr_c')
       AND created_at >= $2
     ORDER BY created_at DESC LIMIT 1`,
    [conversationId, since]
  );
  return r.rows[0] ?? null;
}

async function insertAlertLog(params: {
  tenantId: string;
  conversationId: string;
  alertType: string;
  escalated: boolean;
}): Promise<void> {
  await pool.query(
    `INSERT INTO chat_sla_alert_log (tenant_id, conversation_id, alert_type, escalated)
     VALUES ($1, $2, $3, $4)`,
    [params.tenantId, params.conversationId, params.alertType, params.escalated]
  );
}

async function notifySlaUsers(
  userIds: string[],
  conversationId: string,
  tenantId: string,
  severity: 'at_risk' | 'overdue'
): Promise<void> {
  try {
    const ar = await pool.query<{ sla_alerts_enabled: boolean | null }>(
      `SELECT sla_alerts_enabled FROM chat_automation_settings WHERE tenant_id = $1`,
      [tenantId]
    );
    if (ar.rows[0]?.sla_alerts_enabled === false) return;
  } catch {
    /* coluna ausente / migração antiga */
  }
  const uniq = [...new Set(userIds)].filter(Boolean);
  let ctx: Awaited<ReturnType<typeof loadChatNotificationDisplayContext>> | null = null;
  try {
    ctx = await loadChatNotificationDisplayContext(conversationId);
  } catch {
    ctx = null;
  }
  const contactLabel = ctx?.contactLabel ?? 'Contato WhatsApp';
  const preview = ctx?.lastMessagePreview?.trim() || 'Nova interação recebida.';
  const phone = ctx?.phone ?? undefined;

  const title = severity === 'overdue' ? 'SLA vencido' : 'SLA em risco';
  const message =
    severity === 'overdue'
      ? `O atendimento de ${contactLabel} ultrapassou o tempo de resposta.`
      : `O atendimento de ${contactLabel} precisa de resposta em breve.`;

  const data = {
    conversationId,
    conversation_id: conversationId,
    contactName: contactLabel,
    phone,
    lastMessagePreview: preview,
    slaSeverity: severity,
    href: chatInboxHref(conversationId),
    entity_type: 'conversation',
    entity_id: conversationId,
    ...(ctx?.avatarUrl ? { avatarUrl: ctx.avatarUrl } : {}),
  };

  for (const uid of uniq) {
    try {
      await notifications.createNotification({
        userId: uid,
        type: 'chat_sla_breach',
        title,
        message,
        data,
      });
    } catch (e) {
      console.warn('[chatSlaWorker] notify failed', uid, e);
    }
  }
}

async function processFirstResponseSlas(): Promise<void> {
  const r = await pool.query<ConvSlaRow & { sla_first_response_minutes: number }>(
    `SELECT c.id, c.user_id, owner.tenant_id, c.queue_id, c.assigned_to_user_id, c.assigned_team_id,
            c.last_customer_message_at, c.first_response_at, c.last_agent_message_at,
            s.sla_first_response_minutes
     FROM chat_conversations c
     INNER JOIN users owner ON owner.id = c.user_id
     INNER JOIN chat_automation_settings s ON s.tenant_id = owner.tenant_id
     WHERE s.automation_enabled = true
       AND s.sla_first_response_minutes IS NOT NULL
       AND c.first_response_at IS NULL
       AND c.last_customer_message_at IS NOT NULL
       AND c.attendance_status NOT IN ('closed', 'archived')
       AND now() - c.last_customer_message_at > (s.sla_first_response_minutes::text || ' minutes')::interval
     LIMIT 150`
  );

  for (const row of r.rows) {
    const since = row.last_customer_message_at!;
    const last = await lastFrAlert(row.id, since);

    if (!last) {
      if (row.assigned_to_user_id) {
        await notifySlaUsers([row.assigned_to_user_id], row.id, row.tenant_id, 'at_risk');
        await insertAlertLog({
          tenantId: row.tenant_id,
          conversationId: row.id,
          alertType: 'sla_fr_a',
          escalated: false,
        });
      } else {
        const teams = await teamIdsForConversation(row.tenant_id, row.queue_id, row.assigned_team_id);
        const members = await listTeamMemberUserIds(teams);
        if (members.length > 0) {
          await notifySlaUsers(members, row.id, row.tenant_id, 'at_risk');
          await insertAlertLog({
            tenantId: row.tenant_id,
            conversationId: row.id,
            alertType: 'sla_fr_b',
            escalated: false,
          });
        } else {
          const sups = await listTenantSupervisorUserIds(row.tenant_id);
          if (sups.length > 0) {
            await notifySlaUsers(sups, row.id, row.tenant_id, 'overdue');
            await insertAlertLog({
              tenantId: row.tenant_id,
              conversationId: row.id,
              alertType: 'sla_fr_c',
              escalated: false,
            });
          }
        }
      }
      continue;
    }

    if (last.alert_type === 'sla_fr_c') continue;

    const gapMin = (Date.now() - new Date(last.created_at).getTime()) / 60_000;
    if (gapMin < ESCALATION_GAP_MINUTES) continue;

    if (last.alert_type === 'sla_fr_a') {
      const teams = await teamIdsForConversation(row.tenant_id, row.queue_id, row.assigned_team_id);
      const members = await listTeamMemberUserIds(teams);
      const targets = members.filter((id) => id !== row.assigned_to_user_id);
      if (targets.length > 0) {
        await notifySlaUsers(targets, row.id, row.tenant_id, 'overdue');
        await insertAlertLog({
          tenantId: row.tenant_id,
          conversationId: row.id,
          alertType: 'sla_fr_b',
          escalated: true,
        });
      } else {
        const sups = await listTenantSupervisorUserIds(row.tenant_id);
        const t2 = sups.filter((id) => id !== row.assigned_to_user_id);
        if (t2.length > 0) {
          await notifySlaUsers(t2, row.id, row.tenant_id, 'overdue');
          await insertAlertLog({
            tenantId: row.tenant_id,
            conversationId: row.id,
            alertType: 'sla_fr_c',
            escalated: true,
          });
        }
      }
      continue;
    }

    if (last.alert_type === 'sla_fr_b') {
      const sups = await listTenantSupervisorUserIds(row.tenant_id);
      const targets = sups.filter((id) => id !== row.assigned_to_user_id);
      if (targets.length > 0) {
        await notifySlaUsers(targets, row.id, row.tenant_id, 'overdue');
        await insertAlertLog({
          tenantId: row.tenant_id,
          conversationId: row.id,
          alertType: 'sla_fr_c',
          escalated: true,
        });
      }
    }
  }
}

async function processNextResponseSlas(): Promise<void> {
  const r = await pool.query<ConvSlaRow & { sla_next_response_minutes: number }>(
    `SELECT c.id, c.user_id, owner.tenant_id, c.queue_id, c.assigned_to_user_id, c.assigned_team_id,
            c.last_customer_message_at, c.first_response_at, c.last_agent_message_at,
            s.sla_next_response_minutes
     FROM chat_conversations c
     INNER JOIN users owner ON owner.id = c.user_id
     INNER JOIN chat_automation_settings s ON s.tenant_id = owner.tenant_id
     WHERE s.automation_enabled = true
       AND s.sla_next_response_minutes IS NOT NULL
       AND c.last_customer_message_at IS NOT NULL
       AND c.last_agent_message_at IS NOT NULL
       AND c.last_customer_message_at > c.last_agent_message_at
       AND c.attendance_status NOT IN ('closed', 'archived')
       AND now() - c.last_customer_message_at > (s.sla_next_response_minutes::text || ' minutes')::interval
     LIMIT 150`
  );

  for (const row of r.rows) {
    const since = row.last_customer_message_at!;
    const last = await lastNrAlert(row.id, since);

    if (!last) {
      if (row.assigned_to_user_id) {
        await notifySlaUsers([row.assigned_to_user_id], row.id, row.tenant_id, 'at_risk');
        await insertAlertLog({
          tenantId: row.tenant_id,
          conversationId: row.id,
          alertType: 'sla_nr_a',
          escalated: false,
        });
      } else {
        const teams = await teamIdsForConversation(row.tenant_id, row.queue_id, row.assigned_team_id);
        const members = await listTeamMemberUserIds(teams);
        if (members.length > 0) {
          await notifySlaUsers(members, row.id, row.tenant_id, 'at_risk');
          await insertAlertLog({
            tenantId: row.tenant_id,
            conversationId: row.id,
            alertType: 'sla_nr_b',
            escalated: false,
          });
        } else {
          const sups = await listTenantSupervisorUserIds(row.tenant_id);
          if (sups.length > 0) {
            await notifySlaUsers(sups, row.id, row.tenant_id, 'overdue');
            await insertAlertLog({
              tenantId: row.tenant_id,
              conversationId: row.id,
              alertType: 'sla_nr_c',
              escalated: false,
            });
          }
        }
      }
      continue;
    }

    if (last.alert_type === 'sla_nr_c') continue;

    const gapMin = (Date.now() - new Date(last.created_at).getTime()) / 60_000;
    if (gapMin < ESCALATION_GAP_MINUTES) continue;

    if (last.alert_type === 'sla_nr_a') {
      const teams = await teamIdsForConversation(row.tenant_id, row.queue_id, row.assigned_team_id);
      const members = await listTeamMemberUserIds(teams);
      const targets = members.filter((id) => id !== row.assigned_to_user_id);
      if (targets.length > 0) {
        await notifySlaUsers(targets, row.id, row.tenant_id, 'overdue');
        await insertAlertLog({
          tenantId: row.tenant_id,
          conversationId: row.id,
          alertType: 'sla_nr_b',
          escalated: true,
        });
      } else {
        const sups = await listTenantSupervisorUserIds(row.tenant_id);
        const t2 = sups.filter((id) => id !== row.assigned_to_user_id);
        if (t2.length > 0) {
          await notifySlaUsers(t2, row.id, row.tenant_id, 'overdue');
          await insertAlertLog({
            tenantId: row.tenant_id,
            conversationId: row.id,
            alertType: 'sla_nr_c',
            escalated: true,
          });
        }
      }
      continue;
    }

    if (last.alert_type === 'sla_nr_b') {
      const sups = await listTenantSupervisorUserIds(row.tenant_id);
      const targets = sups.filter((id) => id !== row.assigned_to_user_id);
      if (targets.length > 0) {
        await notifySlaUsers(targets, row.id, row.tenant_id, 'overdue');
        await insertAlertLog({
          tenantId: row.tenant_id,
          conversationId: row.id,
          alertType: 'sla_nr_c',
          escalated: true,
        });
      }
    }
  }
}

async function processInactivityResets(): Promise<void> {
  const r = await pool.query<{ id: string; tenant_id: string; owner_user_id: string }>(
    `UPDATE chat_conversations c
     SET attendance_status = 'pending', updated_at = now()
     FROM users owner
     INNER JOIN chat_automation_settings s ON s.tenant_id = owner.tenant_id
     WHERE c.user_id = owner.id
       AND s.automation_enabled = true
       AND s.inactivity_reset_minutes IS NOT NULL
       AND c.attendance_status = 'waiting_customer'
       AND c.last_agent_message_at IS NOT NULL
       AND now() - c.last_agent_message_at > (s.inactivity_reset_minutes::text || ' minutes')::interval
     RETURNING c.id, owner.tenant_id AS tenant_id, c.user_id AS owner_user_id`
  );

  for (const row of r.rows) {
    try {
      const fresh = await pool.query(`SELECT * FROM chat_conversations WHERE id = $1`, [row.id]);
      const convPayload = conversationRowForClientApi(fresh.rows[0] as Record<string, unknown>);
      emitConversationAttendanceUpdated(row.tenant_id, row.owner_user_id, convPayload);
    } catch (e) {
      console.warn('[chatSlaWorker] emit after inactivity', row.id, e);
    }
  }
}

/**
 * Worker periódico: SLA (alertas escalonados), inatividade em waiting_customer.
 */
export async function runChatSlaAutomationTick(): Promise<void> {
  if (!(await hasChatAutomationTables())) return;
  if (!(await hasChatPhase5SlaColumns())) return;
  if (!(await hasAttendanceColumns())) return;

  await processInactivityResets();
  await processFirstResponseSlas();
  await processNextResponseSlas();
}
