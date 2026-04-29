import { pool } from '../utils/db.js';
import {
  emitChatProfessionalPayload,
  emitConversationAttendanceUpdated,
} from './websocketService.js';
import { conversationRowForClientApi } from '../utils/uazapiIdentityResolve.js';
import { insertChatTransferRow } from './chatProfessionalService.js';
import { insertChatAutomationLog } from './chatAutomationLogService.js';

export type ConversationAutomationRow = {
  id: string;
  user_id: string;
  client_id: string | null;
  queue_id: string | null;
  assigned_to_user_id: string | null;
  assigned_team_id: string | null;
  attendance_status: string;
  priority: string | null;
  owner_tenant_id: string | null;
};

export async function loadConversationForAutomation(
  conversationId: string
): Promise<ConversationAutomationRow | null> {
  const r = await pool.query<ConversationAutomationRow>(
    `SELECT c.id, c.user_id, c.client_id, c.queue_id, c.assigned_to_user_id, c.assigned_team_id,
            c.attendance_status, c.priority,
            owner.tenant_id AS owner_tenant_id
     FROM chat_conversations c
     INNER JOIN users owner ON owner.id = c.user_id
     WHERE c.id = $1`,
    [conversationId]
  );
  return r.rows[0] ?? null;
}

/** Primeira regra que casa (por priority) aplica e para. */
export async function applyAutomationRules(
  tenantId: string,
  conv: ConversationAutomationRow,
  messageBody: string | null
): Promise<ConversationAutomationRow> {
  const rules = await pool.query<{
    id: string;
    name: string | null;
    match_type: string;
    pattern: string;
    action: string;
    target_queue_id: string | null;
    target_team_id: string | null;
    target_user_id: string | null;
    priority_value: string | null;
  }>(
    `SELECT id, name, match_type, pattern, action, target_queue_id, target_team_id,
            target_user_id, priority_value
     FROM chat_automation_rules
     WHERE tenant_id = $1 AND is_active = true
     ORDER BY priority ASC, created_at ASC`,
    [tenantId]
  );

  const body = (messageBody ?? '').toLowerCase();
  const clientId = conv.client_id;

  for (const rule of rules.rows) {
    let matches = false;
    if (rule.match_type === 'keyword_body') {
      const pat = rule.pattern.trim().toLowerCase();
      if (pat.length > 0 && body.includes(pat)) matches = true;
    } else if (rule.match_type === 'client_tag' && clientId) {
      const cr = await pool.query<{ name: string; company: string | null }>(
        `SELECT name, company FROM clients WHERE id = $1 LIMIT 1`,
        [clientId]
      );
      const row = cr.rows[0];
      if (row) {
        const hay = `${row.name} ${row.company ?? ''}`.toLowerCase();
        const pat = rule.pattern.trim().toLowerCase();
        if (pat.length > 0 && hay.includes(pat)) matches = true;
      }
    } else if (rule.match_type === 'client_new') {
      matches = !clientId;
    } else if (rule.match_type === 'client_existing') {
      matches = !!clientId;
    }

    if (!matches) continue;

    try {
      if (rule.action === 'assign_user' && rule.target_user_id) {
        const ok = await pool.query(`SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2`, [
          rule.target_user_id,
          tenantId,
        ]);
        if ((ok.rowCount ?? 0) === 0) {
          await insertChatAutomationLog({
            tenantId,
            conversationId: conv.id,
            ruleId: rule.id,
            eventType: 'rule_skipped',
            actionType: rule.action,
            result: 'skipped',
            metadata: { reason: 'invalid_user' },
          });
          continue;
        }

        await pool.query(
          `UPDATE chat_conversations SET
             assigned_to_user_id = $2,
             assigned_team_id = NULL,
             attendance_status = CASE
               WHEN attendance_status IN ('closed', 'archived') THEN attendance_status
               ELSE 'in_progress' END,
             assigned_at = COALESCE(assigned_at, now()),
             last_assigned_at = now(),
             last_assignment_reason = 'rule_assign',
             updated_at = now()
           WHERE id = $1`,
          [conv.id, rule.target_user_id]
        );

        await insertChatTransferRow({
          tenantId,
          conversationId: conv.id,
          fromUserId: conv.assigned_to_user_id,
          fromTeamId: conv.assigned_team_id,
          fromQueueId: conv.queue_id,
          toUserId: rule.target_user_id,
          toTeamId: null,
          toQueueId: conv.queue_id,
          transferredBy: conv.user_id,
          reason: 'rule_assign',
        });

        await insertChatAutomationLog({
          tenantId,
          conversationId: conv.id,
          ruleId: rule.id,
          eventType: 'rule_applied',
          actionType: rule.action,
          result: 'ok',
          metadata: { rule_name: rule.name ?? '' },
        });

        const freshRow = await pool.query(`SELECT * FROM chat_conversations WHERE id = $1`, [conv.id]);
        const convPayload = conversationRowForClientApi(freshRow.rows[0] as Record<string, unknown>);
        emitConversationAttendanceUpdated(tenantId, conv.user_id, convPayload);
        emitChatProfessionalPayload(tenantId, conv.user_id, 'assignment.changed', {
          conversation_id: conv.id,
          assigned_user_id: rule.target_user_id,
          queue_id: conv.queue_id,
          status: 'in_progress',
          updated_at: new Date().toISOString(),
        });

        const fresh = await loadConversationForAutomation(conv.id);
        return fresh ?? conv;
      }

      let queueId = conv.queue_id;
      let teamId = conv.assigned_team_id;
      let priorityVal = conv.priority;

      if (rule.action === 'set_queue' && rule.target_queue_id) {
        const ok = await pool.query(
          `SELECT 1 FROM chat_queues WHERE id = $1 AND tenant_id = $2`,
          [rule.target_queue_id, tenantId]
        );
        if ((ok.rowCount ?? 0) > 0) queueId = rule.target_queue_id;
      } else if (rule.action === 'set_team' && rule.target_team_id) {
        const ok = await pool.query(`SELECT 1 FROM teams WHERE id = $1 AND tenant_id = $2`, [
          rule.target_team_id,
          tenantId,
        ]);
        if ((ok.rowCount ?? 0) > 0) teamId = rule.target_team_id;
      } else if (rule.action === 'set_priority' && rule.priority_value) {
        priorityVal = rule.priority_value;
      }

      await pool.query(
        `UPDATE chat_conversations SET
           queue_id = $2::uuid,
           assigned_team_id = $3::uuid,
           priority = $4::text,
           updated_at = now()
         WHERE id = $1`,
        [conv.id, queueId, teamId, priorityVal]
      );

      await insertChatAutomationLog({
        tenantId,
        conversationId: conv.id,
        ruleId: rule.id,
        eventType: 'rule_applied',
        actionType: rule.action,
        result: 'ok',
        metadata: { rule_name: rule.name ?? '' },
      });

      const freshRow = await pool.query(`SELECT * FROM chat_conversations WHERE id = $1`, [conv.id]);
      const convPayload = conversationRowForClientApi(freshRow.rows[0] as Record<string, unknown>);
      emitConversationAttendanceUpdated(tenantId, conv.user_id, convPayload);

      return {
        ...conv,
        queue_id: queueId,
        assigned_team_id: teamId,
        priority: priorityVal,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await insertChatAutomationLog({
        tenantId,
        conversationId: conv.id,
        ruleId: rule.id,
        eventType: 'rule_error',
        actionType: rule.action,
        result: 'error',
        errorMessage: msg,
        metadata: {},
      });
      return conv;
    }
  }

  return conv;
}

async function pickRoundRobinUser(teamId: string, tenantId: string): Promise<string | null> {
  const members = await pool.query<{ user_id: string }>(
    `SELECT tm.user_id
     FROM team_members tm
     INNER JOIN users u ON u.id = tm.user_id AND u.tenant_id = $2
     WHERE tm.team_id = $1
     ORDER BY tm.user_id`,
    [teamId, tenantId]
  );
  if (members.rows.length === 0) return null;

  const rr = await pool.query<{ last_assigned_user_id: string | null }>(
    `SELECT last_assigned_user_id FROM chat_team_round_robin_state WHERE team_id = $1`,
    [teamId]
  );
  const last = rr.rows[0]?.last_assigned_user_id ?? null;
  const ids = members.rows.map((r) => r.user_id);
  if (ids.length === 1) return ids[0]!;
  let start = 0;
  if (last) {
    const idx = ids.indexOf(last);
    start = idx >= 0 ? (idx + 1) % ids.length : 0;
  }
  return ids[start]!;
}

async function pickLeastOpenUser(teamId: string, tenantId: string): Promise<string | null> {
  const r = await pool.query<{ user_id: string }>(
    `SELECT tm.user_id
     FROM team_members tm
     INNER JOIN users u ON u.id = tm.user_id AND u.tenant_id = $2
     LEFT JOIN chat_conversations c ON c.assigned_to_user_id = tm.user_id
       AND c.attendance_status NOT IN ('closed', 'archived')
     WHERE tm.team_id = $1
     GROUP BY tm.user_id
     ORDER BY COUNT(c.id) ASC, tm.user_id
     LIMIT 1`,
    [teamId, tenantId]
  );
  return r.rows[0]?.user_id ?? null;
}

export async function tryAutoAssignFromQueue(params: {
  tenantId: string;
  conversationId: string;
  queueId: string;
  actorUserIdForAudit: string;
}): Promise<boolean> {
  const dist = await pool.query<{
    team_id: string | null;
    strategy: string;
    auto_assign: boolean;
  }>(
    `SELECT team_id, strategy, auto_assign
     FROM chat_queue_distribution
     WHERE tenant_id = $1 AND queue_id = $2`,
    [params.tenantId, params.queueId]
  );
  const row = dist.rows[0];
  if (!row?.auto_assign || !row.team_id || row.strategy === 'none') return false;

  let userId: string | null = null;
  if (row.strategy === 'round_robin') {
    userId = await pickRoundRobinUser(row.team_id, params.tenantId);
  } else if (row.strategy === 'least_open') {
    userId = await pickLeastOpenUser(row.team_id, params.tenantId);
  }
  if (!userId) return false;

  await pool.query(
    `UPDATE chat_conversations SET
       assigned_to_user_id = $2,
       assigned_team_id = NULL,
       attendance_status = 'in_progress',
       assigned_at = now(),
       last_assigned_at = now(),
       last_assignment_reason = 'auto_assign',
       updated_at = now()
     WHERE id = $1`,
    [params.conversationId, userId]
  );

  await pool.query(
    `INSERT INTO chat_team_round_robin_state (team_id, tenant_id, last_assigned_user_id, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (team_id) DO UPDATE SET
       last_assigned_user_id = EXCLUDED.last_assigned_user_id,
       updated_at = now()`,
    [row.team_id, params.tenantId, userId]
  );

  await insertChatTransferRow({
    tenantId: params.tenantId,
    conversationId: params.conversationId,
    fromUserId: null,
    fromTeamId: null,
    fromQueueId: params.queueId,
    toUserId: userId,
    toTeamId: null,
    toQueueId: params.queueId,
    transferredBy: params.actorUserIdForAudit,
    reason: 'auto_assign',
  });

  const fresh = await pool.query(`SELECT * FROM chat_conversations WHERE id = $1`, [params.conversationId]);
  const convPayload = conversationRowForClientApi(fresh.rows[0] as Record<string, unknown>);
  const ownerUserId = convPayload.user_id as string;
  emitConversationAttendanceUpdated(params.tenantId, ownerUserId, convPayload);
  emitChatProfessionalPayload(params.tenantId, ownerUserId, 'assignment.changed', {
    conversation_id: params.conversationId,
    assigned_user_id: userId,
    queue_id: params.queueId,
    status: 'in_progress',
    updated_at: new Date().toISOString(),
  });

  await insertChatAutomationLog({
    tenantId: params.tenantId,
    conversationId: params.conversationId,
    ruleId: null,
    eventType: 'auto_assign',
    actionType: 'assign_from_queue',
    result: 'ok',
    metadata: { queue_id: params.queueId, assigned_user_id: userId },
  });

  return true;
}
