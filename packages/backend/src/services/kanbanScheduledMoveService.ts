/**
 * Movimento automático de cartões Kanban por tempo (agendamento + worker).
 */
import type { PoolClient } from 'pg';
import { pool, withBillingWorkerRlsBypass } from '../utils/db.js';
import { parseKanbanPhase2, computeScheduledForFromDelay, type ParsedKanbanPhase2 } from '../utils/kanbanPhase2.js';
import {
  applyKanbanDestColumnEnterSideEffectsBeforeCardUpdate,
  runKanbanDestColumnPostUpdateAutomations,
  type KanbanDestColumnPipelineRow,
} from './kanbanInternalCardColumnPipeline.js';
import { emitKanbanAttendanceIfNeeded } from '../utils/kanbanColumnRules.js';
import { runKanbanPhase2Automations, type KanbanPhase2AutomationContext } from './kanbanColumnAutomationService.js';

const AUTO_MOVE_REASON = 'Movimento automático por tempo (Kanban)';

export type ScheduledMoveStatus = 'scheduled' | 'executed' | 'cancelled' | 'skipped' | 'failed';

type ScheduledMoveRow = {
  id: string;
  tenant_id: string;
  board_id: string;
  card_id: string;
  conversation_id: string;
  from_column_id: string;
  to_column_id: string;
  delay_value: number;
  delay_unit: string;
  scheduled_for: Date;
  status: string;
  created_by_user_id: string | null;
};

export async function logKanbanAutoMoveByTimeAudit(params: {
  conversationId: string;
  tenantId: string;
  actorUserId: string | null;
  attendanceSnapshot: string | null;
  status: ScheduledMoveStatus | 'scheduled';
  boardId: string;
  fromColumnId: string;
  toColumnId: string;
  cardId: string;
  scheduledMoveId: string;
  scheduledFor: Date | null;
  extra?: string;
}): Promise<void> {
  const att = params.attendanceSnapshot || 'unassigned';
  const reason = [
    `automation_type=auto_move_by_time`,
    `status=${params.status}`,
    `board_id=${params.boardId}`,
    `from_column_id=${params.fromColumnId}`,
    `to_column_id=${params.toColumnId}`,
    `card_id=${params.cardId}`,
    `conversation_id=${params.conversationId}`,
    `scheduled_move_id=${params.scheduledMoveId}`,
    params.scheduledFor ? `scheduled_for=${params.scheduledFor.toISOString()}` : '',
    params.extra ? `detail=${params.extra}` : '',
  ]
    .filter(Boolean)
    .join(';')
    .slice(0, 2000);
  try {
    await pool.query(
      `INSERT INTO chat_conversation_assignment_history (
        conversation_id, tenant_id, from_status, to_status, from_user_id, to_user_id, queue_id, actor_user_id, operation, reason
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        params.conversationId,
        params.tenantId,
        att,
        att,
        null,
        null,
        null,
        params.actorUserId,
        'kanban_auto_move_by_time',
        reason,
      ],
    );
  } catch (e) {
    console.error('[kanbanScheduledMove] audit insert failed', { error: e, cardId: params.cardId });
  }
}

export async function cancelPendingScheduledMovesForCardColumn(
  client: PoolClient,
  tenantId: string,
  cardId: string,
  fromColumnId: string,
  reason: string,
  actorUserId: string | null,
): Promise<void> {
  const sel = await client.query<ScheduledMoveRow & { conversation_id: string }>(
    `SELECT sm.*, c.attendance_status AS conv_attendance
     FROM chat_kanban_scheduled_moves sm
     INNER JOIN chat_conversations c ON c.id = sm.conversation_id
     WHERE sm.tenant_id = $1
       AND sm.card_id = $2
       AND sm.from_column_id = $3
       AND sm.status = 'scheduled'`,
    [tenantId, cardId, fromColumnId],
  );
  if (sel.rows.length === 0) return;
  await client.query(
    `UPDATE chat_kanban_scheduled_moves
     SET status = 'cancelled', cancelled_reason = $4, updated_at = now()
     WHERE tenant_id = $1 AND card_id = $2 AND from_column_id = $3 AND status = 'scheduled'`,
    [tenantId, cardId, fromColumnId, reason.slice(0, 500)],
  );
  for (const row of sel.rows) {
    await logKanbanAutoMoveByTimeAudit({
      conversationId: row.conversation_id,
      tenantId,
      actorUserId,
      attendanceSnapshot: (row as { conv_attendance?: string | null }).conv_attendance ?? null,
      status: 'cancelled',
      boardId: row.board_id,
      fromColumnId: row.from_column_id,
      toColumnId: row.to_column_id,
      cardId: row.card_id,
      scheduledMoveId: row.id,
      scheduledFor: row.scheduled_for ? new Date(row.scheduled_for) : null,
      extra: reason.slice(0, 400),
    });
  }
}

export async function cancelAllPendingScheduledMovesFromColumn(
  client: PoolClient,
  tenantId: string,
  fromColumnId: string,
  reason: string,
): Promise<void> {
  const sel = await client.query<ScheduledMoveRow & { conversation_id: string; conv_attendance: string | null }>(
    `SELECT sm.*, c.attendance_status AS conv_attendance
     FROM chat_kanban_scheduled_moves sm
     INNER JOIN chat_conversations c ON c.id = sm.conversation_id
     WHERE sm.tenant_id = $1 AND sm.from_column_id = $2 AND sm.status = 'scheduled'`,
    [tenantId, fromColumnId],
  );
  if (sel.rows.length === 0) return;
  await client.query(
    `UPDATE chat_kanban_scheduled_moves
     SET status = 'cancelled', cancelled_reason = $3, updated_at = now()
     WHERE tenant_id = $1 AND from_column_id = $2 AND status = 'scheduled'`,
    [tenantId, fromColumnId, reason.slice(0, 500)],
  );
  for (const row of sel.rows) {
    await logKanbanAutoMoveByTimeAudit({
      conversationId: row.conversation_id,
      tenantId,
      actorUserId: null,
      attendanceSnapshot: row.conv_attendance,
      status: 'cancelled',
      boardId: row.board_id,
      fromColumnId: row.from_column_id,
      toColumnId: row.to_column_id,
      cardId: row.card_id,
      scheduledMoveId: row.id,
      scheduledFor: row.scheduled_for ? new Date(row.scheduled_for) : null,
      extra: reason.slice(0, 400),
    });
  }
}

export async function cancelPendingScheduledMovesForEntireCard(
  client: PoolClient,
  tenantId: string,
  cardId: string,
  reason: string,
): Promise<void> {
  const sel = await client.query<ScheduledMoveRow & { conversation_id: string; conv_attendance: string | null }>(
    `SELECT sm.*, c.attendance_status AS conv_attendance
     FROM chat_kanban_scheduled_moves sm
     INNER JOIN chat_conversations c ON c.id = sm.conversation_id
     WHERE sm.tenant_id = $1 AND sm.card_id = $2 AND sm.status = 'scheduled'`,
    [tenantId, cardId],
  );
  if (sel.rows.length === 0) return;
  await client.query(
    `UPDATE chat_kanban_scheduled_moves
     SET status = 'cancelled', cancelled_reason = $3, updated_at = now()
     WHERE tenant_id = $1 AND card_id = $2 AND status = 'scheduled'`,
    [tenantId, cardId, reason.slice(0, 500)],
  );
  for (const row of sel.rows) {
    await logKanbanAutoMoveByTimeAudit({
      conversationId: row.conversation_id,
      tenantId,
      actorUserId: null,
      attendanceSnapshot: row.conv_attendance,
      status: 'cancelled',
      boardId: row.board_id,
      fromColumnId: row.from_column_id,
      toColumnId: row.to_column_id,
      cardId: row.card_id,
      scheduledMoveId: row.id,
      scheduledFor: row.scheduled_for ? new Date(row.scheduled_for) : null,
      extra: reason.slice(0, 400),
    });
  }
}

function autoMoveConfigFromColumnMetadata(metadata: unknown): ParsedKanbanPhase2['automations']['auto_move_by_time'] {
  return parseKanbanPhase2(metadata).automations.auto_move_by_time;
}

export async function insertScheduledMoveIfColumnConfigured(
  client: PoolClient,
  input: {
    tenantId: string;
    boardId: string;
    cardId: string;
    conversationId: string;
    columnId: string;
    columnMetadata: unknown;
    actorUserId: string;
  },
): Promise<void> {
  const cfg = autoMoveConfigFromColumnMetadata(input.columnMetadata);
  if (!cfg.enabled || !cfg.to_column_id) return;

  await client.query(
    `DELETE FROM chat_kanban_scheduled_moves
     WHERE tenant_id = $1 AND card_id = $2 AND from_column_id = $3 AND status = 'scheduled'`,
    [input.tenantId, input.cardId, input.columnId],
  );

  const scheduledFor = computeScheduledForFromDelay(cfg.delay_value, cfg.delay_unit);
  const ins = await client.query<{ id: string }>(
    `INSERT INTO chat_kanban_scheduled_moves (
       tenant_id, board_id, card_id, conversation_id, from_column_id, to_column_id,
       trigger_type, delay_value, delay_unit, scheduled_for, status, created_by_user_id
     ) VALUES ($1,$2,$3,$4,$5,$6,'time_delay',$7,$8,$9,'scheduled',$10)
     RETURNING id`,
    [
      input.tenantId,
      input.boardId,
      input.cardId,
      input.conversationId,
      input.columnId,
      cfg.to_column_id,
      cfg.delay_value,
      cfg.delay_unit,
      scheduledFor.toISOString(),
      input.actorUserId,
    ],
  );
  const sid = ins.rows[0]?.id;
  if (!sid) throw new Error('Falha ao criar agendamento de movimento automático Kanban.');
  const attRes = await client.query<{ attendance_status: string | null }>(
    `SELECT attendance_status FROM chat_conversations WHERE id = $1 LIMIT 1`,
    [input.conversationId],
  );
  await logKanbanAutoMoveByTimeAudit({
    conversationId: input.conversationId,
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    attendanceSnapshot: attRes.rows[0]?.attendance_status ?? null,
    status: 'scheduled',
    boardId: input.boardId,
    fromColumnId: input.columnId,
    toColumnId: cfg.to_column_id,
    cardId: input.cardId,
    scheduledMoveId: sid,
    scheduledFor: scheduledFor,
  });
}

async function loadCardLocked(client: PoolClient, tenantId: string, cardId: string) {
  const r = await client.query(
    `SELECT * FROM chat_kanban_cards
     WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL
     FOR UPDATE`,
    [cardId, tenantId],
  );
  return r.rows[0] as
    | {
        id: string;
        board_id: string;
        column_id: string;
        conversation_id: string;
        tenant_id: string;
      }
    | undefined;
}

async function enrichPhase2AfterCommit(
  tenantId: string,
  cardId: string,
  conversationId: string,
  ctx: KanbanPhase2AutomationContext,
): Promise<KanbanPhase2AutomationContext> {
  let next = { ...ctx };
  try {
    const enriched = await pool.query<{
      conv_display_name: string | null;
      conv_contact_name: string | null;
      conv_client_id: string | null;
      conv_lead_id: string | null;
      conv_assigned_to_user_id: string | null;
      conv_assigned_team_id: string | null;
      conv_queue_id: string | null;
      conv_attendance_status: string | null;
    }>(
      `SELECT
        c.display_name AS conv_display_name,
        c.contact_name AS conv_contact_name,
        c.client_id AS conv_client_id,
        c.lead_id AS conv_lead_id,
        c.assigned_to_user_id AS conv_assigned_to_user_id,
        c.assigned_team_id AS conv_assigned_team_id,
        c.queue_id AS conv_queue_id,
        c.attendance_status AS conv_attendance_status
       FROM chat_kanban_cards kc
       INNER JOIN chat_conversations c ON c.id = kc.conversation_id
       WHERE kc.id = $1 AND kc.tenant_id = $2
       LIMIT 1`,
      [cardId, tenantId],
    );
    const e = enriched.rows[0];
    if (e) {
      next = {
        ...next,
        conversationDisplayName: e.conv_display_name ?? e.conv_contact_name ?? null,
        conversationClientId: e.conv_client_id,
        conversationLeadId: e.conv_lead_id,
        assignedToUserId: e.conv_assigned_to_user_id,
        assignedTeamId: e.conv_assigned_team_id,
        queueId: e.conv_queue_id,
        attendanceStatus: e.conv_attendance_status,
      };
    }
  } catch {
    /* ignore */
  }
  try {
    const boardRes = await pool.query<{ name: string }>(
      `SELECT name FROM chat_kanban_boards WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [next.boardId, tenantId],
    );
    if (boardRes.rows[0]) {
      next = { ...next, boardName: boardRes.rows[0].name };
    }
  } catch {
    /* ignore */
  }
  return next;
}

async function processOneScheduledMoveRow(sm: ScheduledMoveRow): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.bypass_rls = '1'`);

    const lock = await client.query<ScheduledMoveRow>(
      `SELECT * FROM chat_kanban_scheduled_moves
       WHERE id = $1 AND status = 'scheduled'
       FOR UPDATE`,
      [sm.id],
    );
    if (lock.rows.length === 0) {
      await client.query('ROLLBACK');
      return;
    }
    const row = lock.rows[0];

    const card = await loadCardLocked(client, row.tenant_id, row.card_id);
    if (!card) {
      await client.query(
        `UPDATE chat_kanban_scheduled_moves SET status = 'skipped', cancelled_reason = $2, updated_at = now() WHERE id = $1`,
        [row.id, 'card_missing_or_archived'],
      );
      await client.query('COMMIT');
      await logKanbanAutoMoveByTimeAudit({
        conversationId: row.conversation_id,
        tenantId: row.tenant_id,
        actorUserId: row.created_by_user_id,
        attendanceSnapshot: null,
        status: 'skipped',
        boardId: row.board_id,
        fromColumnId: row.from_column_id,
        toColumnId: row.to_column_id,
        cardId: row.card_id,
        scheduledMoveId: row.id,
        scheduledFor: new Date(row.scheduled_for),
        extra: 'card_missing_or_archived',
      });
      return;
    }

    if (String(card.column_id) !== String(row.from_column_id)) {
      await client.query(
        `UPDATE chat_kanban_scheduled_moves SET status = 'skipped', cancelled_reason = $2, updated_at = now() WHERE id = $1`,
        [row.id, 'card_not_in_source_column'],
      );
      await client.query('COMMIT');
      const att = await pool.query(`SELECT attendance_status FROM chat_conversations WHERE id = $1`, [
        row.conversation_id,
      ]);
      await logKanbanAutoMoveByTimeAudit({
        conversationId: row.conversation_id,
        tenantId: row.tenant_id,
        actorUserId: row.created_by_user_id,
        attendanceSnapshot: att.rows[0]?.attendance_status ?? null,
        status: 'skipped',
        boardId: row.board_id,
        fromColumnId: row.from_column_id,
        toColumnId: row.to_column_id,
        cardId: row.card_id,
        scheduledMoveId: row.id,
        scheduledFor: new Date(row.scheduled_for),
        extra: 'card_not_in_source_column',
      });
      return;
    }

    const fromCol = await client.query(`SELECT * FROM chat_kanban_columns WHERE id = $1 AND tenant_id = $2`, [
      row.from_column_id,
      row.tenant_id,
    ]);
    const toCol = await client.query(`SELECT * FROM chat_kanban_columns WHERE id = $1 AND tenant_id = $2`, [
      row.to_column_id,
      row.tenant_id,
    ]);
    if (fromCol.rows.length === 0 || toCol.rows.length === 0) {
      await client.query(
        `UPDATE chat_kanban_scheduled_moves SET status = 'skipped', cancelled_reason = $2, updated_at = now() WHERE id = $1`,
        [row.id, 'column_missing'],
      );
      await client.query('COMMIT');
      return;
    }
    const fromMeta = fromCol.rows[0].metadata;
    const liveCfg = autoMoveConfigFromColumnMetadata(fromMeta);
    if (
      !liveCfg.enabled ||
      !liveCfg.to_column_id ||
      String(liveCfg.to_column_id) !== String(row.to_column_id) ||
      liveCfg.delay_value !== row.delay_value ||
      String(liveCfg.delay_unit) !== String(row.delay_unit)
    ) {
      await client.query(
        `UPDATE chat_kanban_scheduled_moves SET status = 'skipped', cancelled_reason = $2, updated_at = now() WHERE id = $1`,
        [row.id, 'automation_config_changed_or_disabled'],
      );
      await client.query('COMMIT');
      const att = await pool.query(`SELECT attendance_status FROM chat_conversations WHERE id = $1`, [
        row.conversation_id,
      ]);
      await logKanbanAutoMoveByTimeAudit({
        conversationId: row.conversation_id,
        tenantId: row.tenant_id,
        actorUserId: row.created_by_user_id,
        attendanceSnapshot: att.rows[0]?.attendance_status ?? null,
        status: 'skipped',
        boardId: row.board_id,
        fromColumnId: row.from_column_id,
        toColumnId: row.to_column_id,
        cardId: row.card_id,
        scheduledMoveId: row.id,
        scheduledFor: new Date(row.scheduled_for),
        extra: 'automation_config_changed_or_disabled',
      });
      return;
    }

    if (String(toCol.rows[0].board_id) !== String(card.board_id)) {
      await client.query(
        `UPDATE chat_kanban_scheduled_moves SET status = 'skipped', cancelled_reason = $2, updated_at = now() WHERE id = $1`,
        [row.id, 'destination_wrong_board'],
      );
      await client.query('COMMIT');
      return;
    }

    const boardRes = await client.query(`SELECT * FROM chat_kanban_boards WHERE id = $1 AND tenant_id = $2`, [
      card.board_id,
      row.tenant_id,
    ]);
    if (boardRes.rows.length === 0) {
      await client.query(
        `UPDATE chat_kanban_scheduled_moves SET status = 'skipped', cancelled_reason = $2, updated_at = now() WHERE id = $1`,
        [row.id, 'board_missing'],
      );
      await client.query('COMMIT');
      return;
    }
    const board = boardRes.rows[0];
    const actorUserId = row.created_by_user_id || (await resolveTenantAnyUserId(client, row.tenant_id));
    if (!actorUserId) {
      await client.query(
        `UPDATE chat_kanban_scheduled_moves SET status = 'failed', error_message = $2, updated_at = now() WHERE id = $1`,
        [row.id, 'no_actor_user_for_automation'],
      );
      await client.query('COMMIT');
      return;
    }

    const destRow = toCol.rows[0] as KanbanDestColumnPipelineRow;
    const dest: KanbanDestColumnPipelineRow = {
      id: String(destRow.id),
      name: String(destRow.name),
      metadata: destRow.metadata,
      funnel_stage_id: (destRow.funnel_stage_id as string | null) ?? null,
    };

    const moveReason = AUTO_MOVE_REASON;
    let side: Awaited<ReturnType<typeof applyKanbanDestColumnEnterSideEffectsBeforeCardUpdate>>;
    try {
      side = await applyKanbanDestColumnEnterSideEffectsBeforeCardUpdate(client, {
        tenantId: row.tenant_id,
        actorUserId,
        boardId: String(card.board_id),
        boardLinkedFunnelId: (board.linked_sales_funnel_id as string | null) ?? null,
        destColumn: dest,
        destColumnId: String(dest.id),
        cardId: row.card_id,
        conversationId: row.conversation_id,
        moveReason,
      });
    } catch (e: any) {
      await client.query(
        `UPDATE chat_kanban_scheduled_moves SET status = 'failed', error_message = $2, updated_at = now() WHERE id = $1`,
        [row.id, String(e?.message || e || 'column_enter_rules_failed').slice(0, 500)],
      );
      await client.query('COMMIT');
      console.error('[kanbanScheduledMove] column enter side effects failed', {
        scheduledMoveId: row.id,
        error: e,
      });
      return;
    }

    const posRes = await client.query(`SELECT COALESCE(MAX(position), 0)::float8 + 1 AS n FROM chat_kanban_cards
      WHERE column_id = $1 AND tenant_id = $2 AND archived_at IS NULL`, [dest.id, row.tenant_id]);
    const nextPos = Number(posRes.rows[0]?.n ?? 1);

    await client.query(
      `UPDATE chat_kanban_cards
       SET column_id = $1, position = $2, updated_by_user_id = $3, updated_at = now()
       WHERE id = $4 AND tenant_id = $5`,
      [dest.id, nextPos, actorUserId, row.card_id, row.tenant_id],
    );

    try {
      await runKanbanDestColumnPostUpdateAutomations(client, {
        tenantId: row.tenant_id,
        actorUserId,
        boardId: String(card.board_id),
        boardLinkedFunnelId: (board.linked_sales_funnel_id as string | null) ?? null,
        destColumn: dest,
        cardId: row.card_id,
        conversationId: row.conversation_id,
      });
    } catch (e: any) {
      await client.query('ROLLBACK');
      const msg = String(e?.message || e || 'post_update_automation_failed').slice(0, 500);
      await pool.query(
        `UPDATE chat_kanban_scheduled_moves SET status = 'failed', error_message = $2, updated_at = now() WHERE id = $1`,
        [row.id, msg],
      );
      console.error('[kanbanScheduledMove] post-update automations failed', { scheduledMoveId: row.id, error: e });
      return;
    }

    await cancelPendingScheduledMovesForCardColumn(
      client,
      row.tenant_id,
      row.card_id,
      String(dest.id),
      'superseded_after_auto_move_into_column',
      actorUserId,
    );

    await insertScheduledMoveIfColumnConfigured(client, {
      tenantId: row.tenant_id,
      boardId: row.board_id,
      cardId: row.card_id,
      conversationId: row.conversation_id,
      columnId: String(dest.id),
      columnMetadata: dest.metadata,
      actorUserId,
    });

    await client.query(
      `UPDATE chat_kanban_scheduled_moves SET status = 'executed', executed_at = now(), updated_at = now() WHERE id = $1`,
      [row.id],
    );
    await client.query('COMMIT');

    if (side.emitCtx && side.attendancePatch) {
      emitKanbanAttendanceIfNeeded(side.emitCtx.tenantId, side.emitCtx.ownerUserId, side.attendancePatch);
    }
    if (side.orgRulesApplied && !side.attendancePatch) {
      const cr = await pool.query<{ owner_tenant_id: string | null; owner_user_id: string }>(
        `SELECT owner.tenant_id AS owner_tenant_id, c.user_id AS owner_user_id
         FROM chat_conversations c
         INNER JOIN users owner ON owner.id = c.user_id
         WHERE c.id = $1 LIMIT 1`,
        [row.conversation_id],
      );
      const rr = cr.rows[0];
      if (rr) {
        emitKanbanAttendanceIfNeeded(rr.owner_tenant_id, rr.owner_user_id, { id: row.conversation_id });
      }
    }

    let phase2Ctx: KanbanPhase2AutomationContext = side.phase2Ctx;
    phase2Ctx = await enrichPhase2AfterCommit(row.tenant_id, row.card_id, row.conversation_id, phase2Ctx);
    runKanbanPhase2Automations(phase2Ctx).catch((automationErr) => {
      console.error('[kanbanScheduledMove] phase2 automations failed', {
        cardId: row.card_id,
        conversationId: row.conversation_id,
        error: automationErr,
      });
    });

    const att = await pool.query(`SELECT attendance_status FROM chat_conversations WHERE id = $1`, [
      row.conversation_id,
    ]);
    await logKanbanAutoMoveByTimeAudit({
      conversationId: row.conversation_id,
      tenantId: row.tenant_id,
      actorUserId,
      attendanceSnapshot: att.rows[0]?.attendance_status ?? null,
      status: 'executed',
      boardId: row.board_id,
      fromColumnId: row.from_column_id,
      toColumnId: row.to_column_id,
      cardId: row.card_id,
      scheduledMoveId: row.id,
      scheduledFor: new Date(row.scheduled_for),
    });

    console.info(
      JSON.stringify({
        msg: 'kanban_scheduled_move_executed',
        scheduled_move_id: row.id,
        tenant_id: row.tenant_id,
        card_id: row.card_id,
        from_column_id: row.from_column_id,
        to_column_id: row.to_column_id,
      }),
    );
  } catch (e: any) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('[kanbanScheduledMove] process row fatal', { error: e });
    try {
      await pool.query(
        `UPDATE chat_kanban_scheduled_moves SET status = 'failed', error_message = $2, updated_at = now()
         WHERE id = $1 AND status = 'scheduled'`,
        [sm.id, String(e?.message || e).slice(0, 500)],
      );
    } catch {
      /* ignore */
    }
  } finally {
    client.release();
  }
}

async function resolveTenantAnyUserId(client: PoolClient, tenantId: string): Promise<string | null> {
  const r = await client.query(
    `SELECT u.id FROM users u WHERE u.tenant_id = $1 ORDER BY u.created_at ASC NULLS LAST LIMIT 1`,
    [tenantId],
  );
  return (r.rows[0]?.id as string) ?? null;
}

/** Worker: processa até `max` agendamentos vencidos (cada um na sua transação + bypass RLS). */
export async function processDueKanbanScheduledMovesBatch(max: number = 20): Promise<void> {
  await withBillingWorkerRlsBypass(async () => {
    const sel = await pool.query<ScheduledMoveRow>(
      `SELECT sm.*
       FROM chat_kanban_scheduled_moves sm
       WHERE sm.status = 'scheduled'
         AND sm.scheduled_for <= NOW()
         AND sm.tenant_id = sm.tenant_id
       ORDER BY sm.scheduled_for ASC
       LIMIT $1`,
      [max],
    );
    for (const row of sel.rows) {
      await processOneScheduledMoveRow(row);
    }
  });
}
