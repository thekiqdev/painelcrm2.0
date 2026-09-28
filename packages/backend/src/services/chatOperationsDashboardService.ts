import { pool } from '../utils/db.js';
import { hasChatAutomationLogsTable } from '../utils/chatAttendanceSchema.js';
import { hasChatPhase5SlaColumns } from '../utils/chatAttendanceSchema.js';
import { getOrCreateAutomationSettings } from './chatAutomationSettingsService.js';
import { computeChatMetrics } from './chatMetricsService.js';
import { listAutomationLogsForTenant } from './chatAutomationLogService.js';

export type OperationsDashboardDto = {
  summary: {
    open: number;
    pending: number;
    in_progress: number;
    waiting_customer: number;
    closed_today: number;
    sla_at_risk: number;
    sla_breached: number;
    avg_first_response_sec: number | null;
    avg_next_reply_sec: number | null;
  };
  sla_context: {
    risk_percent: number;
    tenant_first_minutes: number | null;
    tenant_next_minutes: number | null;
  };
  by_queue: Array<{
    queue_id: string;
    name: string;
    open_count: number;
    sla_first_minutes: number | null;
    sla_next_minutes: number | null;
  }>;
  by_assignee: Array<{
    user_id: string;
    display: string;
    email: string;
    in_progress: number;
    delayed: number;
    avg_first_response_sec: number | null;
    presence: 'online' | 'offline';
  }>;
  attendees: Array<{
    user_id: string;
    display: string;
    email: string;
    presence: 'online' | 'offline';
    in_progress: number;
    delayed: number;
    avg_first_response_sec: number | null;
  }>;
  automation_logs: Array<{
    id: string;
    conversation_id: string;
    rule_id: string | null;
    event_type: string;
    action_type: string;
    result: string;
    error_message: string | null;
    created_at: string;
  }>;
};

function effMinutes(queueVal: number | null | undefined, tenantVal: number | null | undefined): number | null {
  if (queueVal != null && queueVal > 0) return queueVal;
  if (tenantVal != null && tenantVal > 0) return tenantVal;
  return null;
}

/** Pior estado SLA para contagens do painel (não encerradas). */
export function classifySlaBucket(
  params: {
    first_response_at: Date | null;
    last_customer_message_at: Date | null;
    last_agent_message_at: Date | null;
    effFirstMin: number | null;
    effNextMin: number | null;
    riskPercent: number;
  }
): 'ok' | 'at_risk' | 'breached' {
  const now = Date.now();
  const risk = Math.min(99, Math.max(50, params.riskPercent)) / 100;
  let score = 0;

  const fr = params.first_response_at;
  const lcm = params.last_customer_message_at;
  const lam = params.last_agent_message_at;

  if (params.effFirstMin != null && fr == null && lcm != null) {
    const elapsedMin = (now - new Date(lcm).getTime()) / 60_000;
    if (elapsedMin >= params.effFirstMin) score = Math.max(score, 2);
    else if (elapsedMin >= params.effFirstMin * risk) score = Math.max(score, 1);
  }

  if (params.effNextMin != null && lcm != null && lam != null && new Date(lcm) > new Date(lam)) {
    const elapsedMin = (now - new Date(lcm).getTime()) / 60_000;
    if (elapsedMin >= params.effNextMin) score = Math.max(score, 2);
    else if (elapsedMin >= params.effNextMin * risk) score = Math.max(score, 1);
  }

  if (score >= 2) return 'breached';
  if (score >= 1) return 'at_risk';
  return 'ok';
}

export async function buildChatOperationsDashboard(params: {
  tenantId: string;
  includeLogs: boolean;
  /** Limite de linhas para analisar SLA (defesa). */
  convLimit?: number;
}): Promise<OperationsDashboardDto> {
  const tenantId = params.tenantId;
  const convLimit = Math.min(8000, Math.max(500, params.convLimit ?? 4000));
  const metrics = await computeChatMetrics(tenantId);
  const settings = await getOrCreateAutomationSettings(tenantId);

  const riskRow = await pool.query<{ sla_risk_percent: number | null }>(
    `SELECT sla_risk_percent FROM chat_automation_settings WHERE tenant_id = $1`,
    [tenantId]
  );
  const riskPercent = riskRow.rows[0]?.sla_risk_percent ?? 80;

  const tenantFirst = settings.sla_first_response_minutes ?? null;
  const tenantNext = settings.sla_next_response_minutes ?? null;

  let queues: {
    rows: Array<{
      id: string;
      name: string;
      sla_first_response_minutes: number | null;
      sla_next_response_minutes: number | null;
    }>;
  };
  try {
    queues = await pool.query(
      `SELECT id, name,
              sla_first_response_minutes,
              sla_next_response_minutes
       FROM chat_queues WHERE tenant_id = $1 ORDER BY name`,
      [tenantId]
    );
  } catch {
    queues = await pool.query(
      `SELECT id, name,
              NULL::int AS sla_first_response_minutes,
              NULL::int AS sla_next_response_minutes
       FROM chat_queues WHERE tenant_id = $1 ORDER BY name`,
      [tenantId]
    );
  }
  const queueMeta = new Map(queues.rows.map((q) => [q.id, q]));

  let slaAtRisk = 0;
  let slaBreached = 0;
  let openCount = 0;
  let pendingCount = 0;
  let inProg = 0;
  let waitingCust = 0;

  const hasSla = await hasChatPhase5SlaColumns();

  if (hasSla) {
    const convs = await pool.query<{
      id: string;
      queue_id: string | null;
      attendance_status: string | null;
      first_response_at: Date | null;
      last_customer_message_at: Date | null;
      last_agent_message_at: Date | null;
    }>(
      `SELECT c.id, c.queue_id, c.attendance_status, c.first_response_at,
              c.last_customer_message_at, c.last_agent_message_at
       FROM chat_conversations c
       INNER JOIN users u ON u.id = c.user_id
       WHERE u.tenant_id = $1
         AND c.attendance_status IS NOT NULL
         AND c.attendance_status NOT IN ('closed', 'archived')
       LIMIT $2`,
      [tenantId, convLimit]
    );

    for (const c of convs.rows) {
      openCount++;
      const st = c.attendance_status ?? '';
      if (st === 'pending' || st === 'open') pendingCount++;
      if (st === 'in_progress') inProg++;
      if (st === 'waiting_customer') waitingCust++;

      const qm = c.queue_id ? queueMeta.get(c.queue_id) : undefined;
      const effFirst = effMinutes(qm?.sla_first_response_minutes ?? null, tenantFirst);
      const effNext = effMinutes(qm?.sla_next_response_minutes ?? null, tenantNext);

      const bucket = classifySlaBucket({
        first_response_at: c.first_response_at,
        last_customer_message_at: c.last_customer_message_at,
        last_agent_message_at: c.last_agent_message_at,
        effFirstMin: effFirst,
        effNextMin: effNext,
        riskPercent,
      });
      if (bucket === 'breached') slaBreached++;
      else if (bucket === 'at_risk') slaAtRisk++;
    }
  } else {
    const cnt = await pool.query<{
      open: string;
      pend: string;
      ip: string;
      wc: string;
    }>(
      `SELECT
        COUNT(*) FILTER (WHERE c.attendance_status NOT IN ('closed','archived'))::text AS open,
        COUNT(*) FILTER (WHERE c.attendance_status IN ('pending','open'))::text AS pend,
        COUNT(*) FILTER (WHERE c.attendance_status = 'in_progress')::text AS ip,
        COUNT(*) FILTER (WHERE c.attendance_status = 'waiting_customer')::text AS wc
       FROM chat_conversations c
       INNER JOIN users u ON u.id = c.user_id
       WHERE u.tenant_id = $1`,
      [tenantId]
    );
    openCount = Number(cnt.rows[0]?.open ?? 0);
    pendingCount = Number(cnt.rows[0]?.pend ?? 0);
    inProg = Number(cnt.rows[0]?.ip ?? 0);
    waitingCust = Number(cnt.rows[0]?.wc ?? 0);
  }

  const byQueueCounts = await pool.query<{ queue_id: string; n: string }>(
    `SELECT c.queue_id::text AS queue_id, COUNT(*)::text AS n
     FROM chat_conversations c
     INNER JOIN users u ON u.id = c.user_id
     INNER JOIN chat_queues q ON q.id = c.queue_id AND q.tenant_id = $1
     WHERE u.tenant_id = $1
       AND c.queue_id IS NOT NULL
       AND c.attendance_status NOT IN ('closed', 'archived')
     GROUP BY c.queue_id`,
    [tenantId]
  );
  const qcMap = new Map(byQueueCounts.rows.map((r) => [r.queue_id, Number(r.n)]));

  const by_queue = queues.rows.map((q) => ({
    queue_id: q.id,
    name: q.name,
    open_count: qcMap.get(q.id) ?? 0,
    sla_first_minutes: q.sla_first_response_minutes ?? null,
    sla_next_minutes: q.sla_next_response_minutes ?? null,
  }));

  const attendeesRaw = await pool.query<{
    user_id: string;
    email: string;
    display_name: string;
    last_out: Date | null;
    in_progress: string;
  }>(
    `SELECT u.id AS user_id, u.email,
            COALESCE(
              NULLIF(TRIM(COALESCE(pf.first_name, '') || ' ' || COALESCE(pf.last_name, '')), ''),
              u.email
            ) AS display_name,
            (
              SELECT MAX(c.last_agent_message_at)
              FROM chat_conversations c
              INNER JOIN users ux ON ux.id = c.user_id
              WHERE ux.tenant_id = $1
                AND c.assigned_to_user_id = u.id
            ) AS last_out,
            (
              SELECT COUNT(*)::text FROM chat_conversations c2
              INNER JOIN users u2 ON u2.id = c2.user_id
              WHERE u2.tenant_id = $1 AND c2.assigned_to_user_id = u.id
                AND c2.attendance_status = 'in_progress'
            ) AS in_progress
     FROM users u
     LEFT JOIN profiles pf ON pf.id = u.id
     WHERE u.tenant_id = $1
     ORDER BY display_name
     LIMIT 60`,
    [tenantId]
  );

  const RECENT_MS = 15 * 60 * 1000;
  const now = Date.now();

  let convForAssignee: Array<{
    assigned_to_user_id: string | null;
    id: string;
    queue_id: string | null;
    first_response_at: Date | null;
    last_customer_message_at: Date | null;
    last_agent_message_at: Date | null;
  }> = [];
  if (hasSla) {
    const cr = await pool.query(
      `SELECT c.id, c.assigned_to_user_id, c.queue_id, c.first_response_at,
              c.last_customer_message_at, c.last_agent_message_at
       FROM chat_conversations c
       INNER JOIN users u ON u.id = c.user_id
       WHERE u.tenant_id = $1
         AND c.assigned_to_user_id IS NOT NULL
         AND c.attendance_status NOT IN ('closed', 'archived')
       LIMIT $2`,
      [tenantId, convLimit]
    );
    convForAssignee = cr.rows as typeof convForAssignee;
  }

  const delayedByUser = new Map<string, number>();
  for (const c of convForAssignee) {
    const uid = c.assigned_to_user_id!;
    const qm = c.queue_id ? queueMeta.get(c.queue_id) : undefined;
    const effFirst = effMinutes(qm?.sla_first_response_minutes ?? null, tenantFirst);
    const effNext = effMinutes(qm?.sla_next_response_minutes ?? null, tenantNext);
    const bucket = classifySlaBucket({
      first_response_at: c.first_response_at,
      last_customer_message_at: c.last_customer_message_at,
      last_agent_message_at: c.last_agent_message_at,
      effFirstMin: effFirst,
      effNextMin: effNext,
      riskPercent,
    });
    if (bucket === 'breached') {
      delayedByUser.set(uid, (delayedByUser.get(uid) ?? 0) + 1);
    }
  }

  const avgByUser = await pool.query<{ user_id: string; sec: string | null }>(
    `SELECT c.assigned_to_user_id AS user_id,
            AVG(EXTRACT(EPOCH FROM (c.first_response_at - c.created_at)))::text AS sec
     FROM chat_conversations c
     INNER JOIN users u ON u.id = c.user_id
     WHERE u.tenant_id = $1
       AND c.assigned_to_user_id IS NOT NULL
       AND c.first_response_at IS NOT NULL
     GROUP BY c.assigned_to_user_id`,
    [tenantId]
  );
  const avgMap = new Map(avgByUser.rows.map((r) => [r.user_id, r.sec != null && r.sec !== '' ? Number(r.sec) : null]));

  const attendees = attendeesRaw.rows.map((row) => {
    const lo = row.last_out ? new Date(row.last_out).getTime() : 0;
    const presence: 'online' | 'offline' = lo && now - lo < RECENT_MS ? 'online' : 'offline';
    const uid = row.user_id;
    return {
      user_id: uid,
      display: row.display_name,
      email: row.email,
      presence,
      in_progress: Number(row.in_progress ?? 0),
      delayed: delayedByUser.get(uid) ?? 0,
      avg_first_response_sec: avgMap.get(uid) ?? null,
    };
  });

  const by_assignee = metrics.by_assignee_active.map((m) => ({
    user_id: m.user_id,
    display: m.display,
    email: m.email,
    in_progress: m.n,
    delayed: delayedByUser.get(m.user_id) ?? 0,
    avg_first_response_sec: avgMap.get(m.user_id) ?? null,
    presence:
      attendees.find((a) => a.user_id === m.user_id)?.presence ??
      ('offline' as const),
  }));

  let automation_logs: OperationsDashboardDto['automation_logs'] = [];
  if (params.includeLogs && (await hasChatAutomationLogsTable())) {
    const logs = await listAutomationLogsForTenant(tenantId, 40);
    automation_logs = logs.map((l) => ({
      id: l.id,
      conversation_id: l.conversation_id,
      rule_id: l.rule_id,
      event_type: l.event_type,
      action_type: l.action_type,
      result: l.result,
      error_message: l.error_message,
      created_at: l.created_at.toISOString(),
    }));
  }

  return {
    summary: {
      open: openCount,
      pending: pendingCount,
      in_progress: inProg,
      waiting_customer: waitingCust,
      closed_today: metrics.closed_today,
      sla_at_risk: slaAtRisk,
      sla_breached: slaBreached,
      avg_first_response_sec: metrics.avg_first_response_sec,
      avg_next_reply_sec: metrics.avg_next_reply_sec,
    },
    sla_context: {
      risk_percent: riskPercent,
      tenant_first_minutes: tenantFirst,
      tenant_next_minutes: tenantNext,
    },
    by_queue,
    by_assignee,
    attendees,
    automation_logs,
  };
}
