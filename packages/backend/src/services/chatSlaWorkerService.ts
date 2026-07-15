import { pool } from '../utils/db.js';
import {
  hasAttendanceColumns,
  hasChatAutomationTables,
  hasChatPhase5SlaColumns,
} from '../utils/chatAttendanceSchema.js';
import * as notifications from './notifications.js';
import {
  chatInboxHref,
  loadChatNotificationDisplayContext,
  mergeConversationFieldsIntoNotificationData,
} from './chatNotificationContext.js';
import { conversationRowForClientApi } from '../utils/uazapiIdentityResolve.js';
import { emitConversationAttendanceUpdated } from './websocketService.js';
import { appLogger } from '../observability/appLogger.js';

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

type AlertRow = { alert_type: string; created_at: Date };

/** Cache por tick — evita N+1 de settings/teams/supervisors. */
type TickCaches = {
  slaAlertsEnabled: Map<string, boolean>;
  queueTeam: Map<string, string | null>;
  teamMembers: Map<string, string[]>;
  supervisors: Map<string, string[]>;
};

function createTickCaches(): TickCaches {
  return {
    slaAlertsEnabled: new Map(),
    queueTeam: new Map(),
    teamMembers: new Map(),
    supervisors: new Map(),
  };
}

async function teamIdsForConversationCached(
  caches: TickCaches,
  tenantId: string,
  queueId: string | null,
  assignedTeamId: string | null,
): Promise<string[]> {
  if (assignedTeamId) return [assignedTeamId];
  if (!queueId) return [];
  const key = `${tenantId}:${queueId}`;
  if (caches.queueTeam.has(key)) {
    const tid = caches.queueTeam.get(key);
    return tid ? [tid] : [];
  }
  const r = await pool.query<{ team_id: string | null }>(
    `SELECT team_id FROM chat_queue_distribution WHERE tenant_id = $1 AND queue_id = $2`,
    [tenantId, queueId],
  );
  const tid = r.rows[0]?.team_id ?? null;
  caches.queueTeam.set(key, tid);
  return tid ? [tid] : [];
}

async function listTeamMemberUserIdsCached(caches: TickCaches, teamIds: string[]): Promise<string[]> {
  if (teamIds.length === 0) return [];
  const missing = teamIds.filter((id) => !caches.teamMembers.has(id));
  if (missing.length > 0) {
    const r = await pool.query<{ team_id: string; user_id: string }>(
      `SELECT tm.team_id, tm.user_id FROM team_members tm WHERE tm.team_id = ANY($1::uuid[])`,
      [missing],
    );
    for (const id of missing) caches.teamMembers.set(id, []);
    for (const row of r.rows) {
      const list = caches.teamMembers.get(row.team_id) ?? [];
      list.push(row.user_id);
      caches.teamMembers.set(row.team_id, list);
    }
  }
  const out = new Set<string>();
  for (const id of teamIds) {
    for (const uid of caches.teamMembers.get(id) ?? []) out.add(uid);
  }
  return [...out];
}

async function listTenantSupervisorUserIdsCached(
  caches: TickCaches,
  tenantId: string,
): Promise<string[]> {
  if (caches.supervisors.has(tenantId)) return caches.supervisors.get(tenantId)!;
  const r = await pool.query<{ id: string }>(
    `SELECT u.id FROM users u
     INNER JOIN user_profiles p ON p.owner_id = u.id
     WHERE u.tenant_id = $1 AND p.is_admin = true`,
    [tenantId],
  );
  const ids = r.rows.map((x) => x.id);
  caches.supervisors.set(tenantId, ids);
  return ids;
}

/** Uma query para últimas alerts FR/NR por conversa desde last_customer_message_at. */
async function loadLatestAlertsByConversation(
  rows: ConvSlaRow[],
  alertTypes: string[],
): Promise<Map<string, AlertRow>> {
  const map = new Map<string, AlertRow>();
  if (rows.length === 0) return map;
  const ids = rows.map((r) => r.id);
  const sinces = rows.map((r) => r.last_customer_message_at);
  const r = await pool.query<{ conversation_id: string; alert_type: string; created_at: Date }>(
    `SELECT DISTINCT ON (l.conversation_id)
       l.conversation_id, l.alert_type, l.created_at
     FROM chat_sla_alert_log l
     INNER JOIN unnest($1::uuid[], $2::timestamptz[]) AS v(conversation_id, since)
       ON v.conversation_id = l.conversation_id
     WHERE l.alert_type = ANY($3::text[])
       AND l.created_at >= v.since
     ORDER BY l.conversation_id, l.created_at DESC`,
    [ids, sinces, alertTypes],
  );
  for (const row of r.rows) {
    map.set(row.conversation_id, { alert_type: row.alert_type, created_at: row.created_at });
  }
  return map;
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
    [params.tenantId, params.conversationId, params.alertType, params.escalated],
  );
}

async function notifySlaUsers(
  caches: TickCaches,
  userIds: string[],
  conversationId: string,
  tenantId: string,
  severity: 'at_risk' | 'overdue',
): Promise<void> {
  try {
    if (!caches.slaAlertsEnabled.has(tenantId)) {
      const ar = await pool.query<{ sla_alerts_enabled: boolean | null }>(
        `SELECT sla_alerts_enabled FROM chat_automation_settings WHERE tenant_id = $1`,
        [tenantId],
      );
      caches.slaAlertsEnabled.set(tenantId, ar.rows[0]?.sla_alerts_enabled !== false);
    }
    if (caches.slaAlertsEnabled.get(tenantId) === false) return;
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

  const data = mergeConversationFieldsIntoNotificationData(
    conversationId,
    {
      contactName: contactLabel,
      contact_name: contactLabel,
      phone,
      contact_phone: phone,
      lastMessagePreview: preview,
      slaSeverity: severity,
      href: chatInboxHref(conversationId),
      entity_type: 'conversation',
      entity_id: conversationId,
    },
    ctx,
  );

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
      appLogger.warn('chatSlaWorker', 'notify failed', { uid, err: String(e) });
    }
  }
}

async function processFirstResponseSlas(caches: TickCaches): Promise<void> {
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
     LIMIT 150`,
  );

  const latest = await loadLatestAlertsByConversation(r.rows, ['sla_fr_a', 'sla_fr_b', 'sla_fr_c']);

  for (const row of r.rows) {
    const last = latest.get(row.id) ?? null;

    if (!last) {
      if (row.assigned_to_user_id) {
        await notifySlaUsers(caches, [row.assigned_to_user_id], row.id, row.tenant_id, 'at_risk');
        await insertAlertLog({
          tenantId: row.tenant_id,
          conversationId: row.id,
          alertType: 'sla_fr_a',
          escalated: false,
        });
      } else {
        const teams = await teamIdsForConversationCached(
          caches,
          row.tenant_id,
          row.queue_id,
          row.assigned_team_id,
        );
        const members = await listTeamMemberUserIdsCached(caches, teams);
        if (members.length > 0) {
          await notifySlaUsers(caches, members, row.id, row.tenant_id, 'at_risk');
          await insertAlertLog({
            tenantId: row.tenant_id,
            conversationId: row.id,
            alertType: 'sla_fr_b',
            escalated: false,
          });
        } else {
          const sups = await listTenantSupervisorUserIdsCached(caches, row.tenant_id);
          if (sups.length > 0) {
            await notifySlaUsers(caches, sups, row.id, row.tenant_id, 'overdue');
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
      const teams = await teamIdsForConversationCached(
        caches,
        row.tenant_id,
        row.queue_id,
        row.assigned_team_id,
      );
      const members = await listTeamMemberUserIdsCached(caches, teams);
      const targets = members.filter((id) => id !== row.assigned_to_user_id);
      if (targets.length > 0) {
        await notifySlaUsers(caches, targets, row.id, row.tenant_id, 'overdue');
        await insertAlertLog({
          tenantId: row.tenant_id,
          conversationId: row.id,
          alertType: 'sla_fr_b',
          escalated: true,
        });
      } else {
        const sups = await listTenantSupervisorUserIdsCached(caches, row.tenant_id);
        const t2 = sups.filter((id) => id !== row.assigned_to_user_id);
        if (t2.length > 0) {
          await notifySlaUsers(caches, t2, row.id, row.tenant_id, 'overdue');
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
      const sups = await listTenantSupervisorUserIdsCached(caches, row.tenant_id);
      const targets = sups.filter((id) => id !== row.assigned_to_user_id);
      if (targets.length > 0) {
        await notifySlaUsers(caches, targets, row.id, row.tenant_id, 'overdue');
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

async function processNextResponseSlas(caches: TickCaches): Promise<void> {
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
     LIMIT 150`,
  );

  const latest = await loadLatestAlertsByConversation(r.rows, ['sla_nr_a', 'sla_nr_b', 'sla_nr_c']);

  for (const row of r.rows) {
    const last = latest.get(row.id) ?? null;

    if (!last) {
      if (row.assigned_to_user_id) {
        await notifySlaUsers(caches, [row.assigned_to_user_id], row.id, row.tenant_id, 'at_risk');
        await insertAlertLog({
          tenantId: row.tenant_id,
          conversationId: row.id,
          alertType: 'sla_nr_a',
          escalated: false,
        });
      } else {
        const teams = await teamIdsForConversationCached(
          caches,
          row.tenant_id,
          row.queue_id,
          row.assigned_team_id,
        );
        const members = await listTeamMemberUserIdsCached(caches, teams);
        if (members.length > 0) {
          await notifySlaUsers(caches, members, row.id, row.tenant_id, 'at_risk');
          await insertAlertLog({
            tenantId: row.tenant_id,
            conversationId: row.id,
            alertType: 'sla_nr_b',
            escalated: false,
          });
        } else {
          const sups = await listTenantSupervisorUserIdsCached(caches, row.tenant_id);
          if (sups.length > 0) {
            await notifySlaUsers(caches, sups, row.id, row.tenant_id, 'overdue');
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
      const teams = await teamIdsForConversationCached(
        caches,
        row.tenant_id,
        row.queue_id,
        row.assigned_team_id,
      );
      const members = await listTeamMemberUserIdsCached(caches, teams);
      const targets = members.filter((id) => id !== row.assigned_to_user_id);
      if (targets.length > 0) {
        await notifySlaUsers(caches, targets, row.id, row.tenant_id, 'overdue');
        await insertAlertLog({
          tenantId: row.tenant_id,
          conversationId: row.id,
          alertType: 'sla_nr_b',
          escalated: true,
        });
      } else {
        const sups = await listTenantSupervisorUserIdsCached(caches, row.tenant_id);
        const t2 = sups.filter((id) => id !== row.assigned_to_user_id);
        if (t2.length > 0) {
          await notifySlaUsers(caches, t2, row.id, row.tenant_id, 'overdue');
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
      const sups = await listTenantSupervisorUserIdsCached(caches, row.tenant_id);
      const targets = sups.filter((id) => id !== row.assigned_to_user_id);
      if (targets.length > 0) {
        await notifySlaUsers(caches, targets, row.id, row.tenant_id, 'overdue');
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
  const r = await pool.query<Record<string, unknown> & { tenant_id: string; owner_user_id: string }>(
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
     RETURNING c.*, owner.tenant_id AS tenant_id, c.user_id AS owner_user_id`,
  );

  for (const row of r.rows) {
    try {
      const convPayload = conversationRowForClientApi(row as Record<string, unknown>);
      emitConversationAttendanceUpdated(String(row.tenant_id), String(row.owner_user_id), convPayload);
    } catch (e) {
      appLogger.warn('chatSlaWorker', 'emit after inactivity', {
        id: String(row.id),
        err: String(e),
      });
    }
  }
}

/**
 * Worker periódico: SLA (alertas escalonados), inatividade em waiting_customer.
 * MB-016: alertas em batch + caches por tick (sem N+1 por-row de log/teams).
 */
export async function runChatSlaAutomationTick(): Promise<void> {
  if (!(await hasChatAutomationTables())) return;
  if (!(await hasChatPhase5SlaColumns())) return;
  if (!(await hasAttendanceColumns())) return;

  const caches = createTickCaches();
  await processInactivityResets();
  await processFirstResponseSlas(caches);
  await processNextResponseSlas(caches);
}

/** Exposto para testes unitários de batching. */
export const __chatSlaTestables = {
  loadLatestAlertsByConversation,
  createTickCaches,
};
