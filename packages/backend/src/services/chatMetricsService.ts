import { pool } from '../utils/db.js';
import { hasChatPhase5SlaColumns, hasChatQueuesTable } from '../utils/chatAttendanceSchema.js';

export type ChatMetricsDto = {
  open_total: number;
  pending_attendance: number;
  in_progress: number;
  closed_today: number;
  avg_first_response_sec: number | null;
  /** Resposta contínua: tempo médio entre mensagem do cliente e resposta do agente (amostra recente). */
  avg_next_reply_sec: number | null;
  by_queue: Array<{ queue_id: string; name: string; n: number }>;
  /** Carga ativa (não fechada/arquivada) por fila. */
  by_queue_active: Array<{ queue_id: string; name: string; n: number }>;
  by_assignee: Array<{ user_id: string; email: string; display: string; n: number }>;
  /** Conversas ativas atribuídas por atendente. */
  by_assignee_active: Array<{ user_id: string; email: string; display: string; n: number }>;
};

export async function computeChatMetrics(tenantId: string): Promise<ChatMetricsDto> {
  const usersInTenant = `(SELECT id FROM users WHERE tenant_id = $1)`;

  const base = await pool.query<{
    open_total: string;
    pending_attendance: string;
    in_progress: string;
    closed_today: string;
  }>(
    `SELECT
      COUNT(*) FILTER (WHERE c.attendance_status IN ('open', 'pending'))::text AS open_total,
      COUNT(*) FILTER (WHERE c.attendance_status = 'pending' AND c.assigned_to_user_id IS NULL)::text AS pending_attendance,
      COUNT(*) FILTER (WHERE c.attendance_status = 'in_progress')::text AS in_progress,
      COUNT(*) FILTER (
        WHERE c.attendance_status IN ('closed', 'archived')
          AND c.closed_at IS NOT NULL
          AND (c.closed_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date
      )::text AS closed_today
     FROM chat_conversations c
     WHERE c.user_id IN ${usersInTenant}`,
    [tenantId]
  );

  const avgFr = await pool.query<{ sec: string | null }>(
    `SELECT
       AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)))::text AS sec
     FROM chat_conversations c
     WHERE c.user_id IN ${usersInTenant}
       AND c.first_response_at IS NOT NULL`,
    [tenantId]
  );

  let avgNr: { rows: Array<{ sec: string | null }> } = { rows: [{ sec: null }] };
  if (await hasChatPhase5SlaColumns()) {
    avgNr = await pool.query<{ sec: string | null }>(
      `SELECT
         AVG(EXTRACT(EPOCH FROM (last_agent_message_at - last_customer_message_at)))::text AS sec
       FROM chat_conversations c
       WHERE c.user_id IN ${usersInTenant}
         AND c.last_customer_message_at IS NOT NULL
         AND c.last_agent_message_at IS NOT NULL
         AND c.last_agent_message_at >= c.last_customer_message_at
         AND c.last_customer_message_at > now() - interval '30 days'`,
      [tenantId]
    );
  }

  let byQueue: { rows: Array<{ queue_id: string; name: string; n: string }> } = { rows: [] };
  let byQueueActive: { rows: Array<{ queue_id: string; name: string; n: string }> } = { rows: [] };
  if (await hasChatQueuesTable()) {
    byQueue = await pool.query<{ queue_id: string; name: string; n: string }>(
      `SELECT q.id AS queue_id, q.name,
              COUNT(*)::text AS n
       FROM chat_conversations c
       INNER JOIN chat_queues q ON q.id = c.queue_id AND q.tenant_id = $1
       WHERE c.user_id IN ${usersInTenant}
         AND c.attendance_status IS DISTINCT FROM 'archived'
       GROUP BY q.id, q.name
       ORDER BY n DESC`,
      [tenantId]
    );
    byQueueActive = await pool.query<{ queue_id: string; name: string; n: string }>(
      `SELECT q.id AS queue_id, q.name,
              COUNT(*)::text AS n
       FROM chat_conversations c
       INNER JOIN chat_queues q ON q.id = c.queue_id AND q.tenant_id = $1
       WHERE c.user_id IN ${usersInTenant}
         AND c.attendance_status NOT IN ('closed', 'archived')
       GROUP BY q.id, q.name
       ORDER BY n DESC`,
      [tenantId]
    );
  }

  const byAssignee = await pool.query<{ user_id: string; email: string; display: string; n: string }>(
    `SELECT u.id AS user_id, u.email,
            COALESCE(
              NULLIF(TRIM(COALESCE(pf.first_name, '') || ' ' || COALESCE(pf.last_name, '')), ''),
              u.email
            ) AS display,
            COUNT(*)::text AS n
     FROM chat_conversations c
     INNER JOIN users u ON u.id = c.assigned_to_user_id
     LEFT JOIN profiles pf ON pf.id = u.id
     WHERE c.user_id IN ${usersInTenant}
       AND c.assigned_to_user_id IS NOT NULL
       AND c.attendance_status = 'in_progress'
     GROUP BY u.id, u.email, pf.first_name, pf.last_name
     ORDER BY n DESC
     LIMIT 20`,
    [tenantId]
  );

  const byAssigneeActive = await pool.query<{ user_id: string; email: string; display: string; n: string }>(
    `SELECT u.id AS user_id, u.email,
            COALESCE(
              NULLIF(TRIM(COALESCE(pf.first_name, '') || ' ' || COALESCE(pf.last_name, '')), ''),
              u.email
            ) AS display,
            COUNT(*)::text AS n
     FROM chat_conversations c
     INNER JOIN users u ON u.id = c.assigned_to_user_id
     LEFT JOIN profiles pf ON pf.id = u.id
     WHERE c.user_id IN ${usersInTenant}
       AND c.assigned_to_user_id IS NOT NULL
       AND c.attendance_status NOT IN ('closed', 'archived')
     GROUP BY u.id, u.email, pf.first_name, pf.last_name
     ORDER BY n DESC
     LIMIT 20`,
    [tenantId]
  );

  const row = base.rows[0];
  const secRaw = avgFr.rows[0]?.sec;
  const secNr = avgNr.rows[0]?.sec;

  return {
    open_total: Number(row?.open_total ?? 0),
    pending_attendance: Number(row?.pending_attendance ?? 0),
    in_progress: Number(row?.in_progress ?? 0),
    closed_today: Number(row?.closed_today ?? 0),
    avg_first_response_sec: secRaw != null && secRaw !== '' ? Number(secRaw) : null,
    avg_next_reply_sec: secNr != null && secNr !== '' ? Number(secNr) : null,
    by_queue: byQueue.rows.map((r) => ({
      queue_id: r.queue_id,
      name: r.name,
      n: Number(r.n),
    })),
    by_queue_active: byQueueActive.rows.map((r) => ({
      queue_id: r.queue_id,
      name: r.name,
      n: Number(r.n),
    })),
    by_assignee: byAssignee.rows.map((r) => ({
      user_id: r.user_id,
      email: r.email,
      display: r.display,
      n: Number(r.n),
    })),
    by_assignee_active: byAssigneeActive.rows.map((r) => ({
      user_id: r.user_id,
      email: r.email,
      display: r.display,
      n: Number(r.n),
    })),
  };
}
