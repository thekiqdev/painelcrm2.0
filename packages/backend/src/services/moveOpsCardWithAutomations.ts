/**
 * Sprint N5 — Motor unificado de movimentação Ops (acquisition_lead).
 * Substitui UPDATEs diretos; executa Phase2 via runKanbanPhase2Automations (N4).
 */
import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import { beginKanbanTxWithRls } from '../utils/kanbanRlsTx.js';
import { SUPERADMIN_OPS_KANBAN_TENANT_ID } from '../config/superadminOpsKanban.js';
import { nextKanbanCardPosition } from './chatKanbanTagStore.js';
import {
  appendOperationalTimelineByCardId,
  TIMELINE_LABELS,
} from './superadminOpsLeadTimelineService.js';
import {
  resolveKanbanAutomationContext,
  toPhase2AutomationContext,
} from './kanbanAutomationContext.js';
import { runKanbanPhase2Automations } from './kanbanColumnAutomationService.js';
import {
  cancelPendingScheduledMovesForCardColumn,
  insertScheduledMoveIfColumnConfigured,
} from './kanbanScheduledMoveService.js';
import { archiveConflictingLeadCardsGlobally } from './opsSingleActiveCardService.js';

export type MoveOpsCardInput = {
  tenantId: string;
  actorUserId: string;
  cardId: string;
  sourceBoardId: string;
  sourceColumnId: string;
  destinationBoardId: string;
  destinationColumnId: string;
  source: string;
  correlationId: string;
  moveReason?: string;
  moveConfirmed?: boolean;
  metadataPatch?: Record<string, unknown>;
  position?: number;
  /** Preserva agendamento em execução ao cancelar pendentes da coluna de origem. */
  preserveScheduledMoveId?: string;
};

export type MoveOpsCardStatus =
  | 'moved'
  | 'already_at_destination'
  | 'card_not_found'
  | 'column_not_found'
  | 'board_not_found';

export type MoveOpsCardResult = {
  status: MoveOpsCardStatus;
  phase2Executed: boolean;
  cardId?: string;
  acquisitionLeadId?: string;
};

type OpsCardRow = {
  id: string;
  board_id: string;
  column_id: string;
  acquisition_lead_id: string | null;
  metadata: unknown;
  archived_at: string | null;
};

type BoardRow = {
  id: string;
  name: string;
  linked_sales_funnel_id: string | null;
  archived_at: string | null;
  is_active: boolean;
};

type ColumnRow = {
  id: string;
  name: string;
  board_id: string;
  metadata: unknown;
};

function logOpsMoveEngine(payload: Record<string, unknown>): void {
  console.info('[ops_move_engine]', payload);
}

async function loadOpsCard(tenantId: string, cardId: string): Promise<OpsCardRow | null> {
  const r = await pool.query<OpsCardRow>(
    `SELECT id::text, board_id::text, column_id::text, acquisition_lead_id::text,
            metadata, archived_at::text
     FROM chat_kanban_cards
     WHERE id = $1::uuid AND tenant_id = $2::uuid
     LIMIT 1`,
    [cardId, tenantId],
  );
  return r.rows[0] ?? null;
}

async function loadDestBoard(tenantId: string, boardId: string): Promise<BoardRow | null> {
  const r = await pool.query<BoardRow>(
    `SELECT id::text, name, linked_sales_funnel_id::text, archived_at::text, is_active
     FROM chat_kanban_boards
     WHERE id = $1::uuid AND tenant_id = $2::uuid
     LIMIT 1`,
    [boardId, tenantId],
  );
  return r.rows[0] ?? null;
}

async function loadDestColumn(
  tenantId: string,
  boardId: string,
  columnId: string,
): Promise<ColumnRow | null> {
  const r = await pool.query<ColumnRow>(
    `SELECT id::text, name, board_id::text, metadata
     FROM chat_kanban_columns
     WHERE id = $1::uuid AND tenant_id = $2::uuid AND board_id = $3::uuid
     LIMIT 1`,
    [columnId, tenantId, boardId],
  );
  return r.rows[0] ?? null;
}

async function loadColumnName(tenantId: string, columnId: string): Promise<string | null> {
  const r = await pool.query<{ name: string }>(
    `SELECT name FROM chat_kanban_columns WHERE id = $1::uuid AND tenant_id = $2::uuid LIMIT 1`,
    [columnId, tenantId],
  );
  return r.rows[0]?.name ?? null;
}

function mergeMetadata(
  existing: unknown,
  patch?: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  if (!patch) return base;
  return { ...base, ...patch };
}

async function runPhase2ForLeadMove(input: {
  tenantId: string;
  actorUserId: string;
  card: OpsCardRow;
  destBoard: BoardRow;
  destColumn: ColumnRow;
  correlationId: string;
}): Promise<boolean> {
  if (!input.card.acquisition_lead_id) return false;

  const automationCtx = await resolveKanbanAutomationContext({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    card: {
      acquisition_lead_id: input.card.acquisition_lead_id,
      conversation_id: null,
    },
    cardId: input.card.id,
    destColumn: {
      id: input.destColumn.id,
      name: input.destColumn.name,
      metadata: input.destColumn.metadata,
    },
    boardId: input.destBoard.id,
    boardName: input.destBoard.name,
    boardLinkedFunnelId: input.destBoard.linked_sales_funnel_id,
    correlationId: input.correlationId,
  });
  if (!automationCtx) return false;

  const phase2Ctx = toPhase2AutomationContext(automationCtx, {
    boardLinkedFunnelId: input.destBoard.linked_sales_funnel_id,
  });
  const result = await runKanbanPhase2Automations(phase2Ctx);
  return result.attempted;
}

/**
 * Move cartão acquisition_lead no Ops Kanban e dispara automações Phase2.
 */
export async function moveOpsCardWithAutomations(
  input: MoveOpsCardInput,
): Promise<MoveOpsCardResult> {
  const tenantId = input.tenantId?.trim();
  if (!tenantId || tenantId !== SUPERADMIN_OPS_KANBAN_TENANT_ID) {
    return { status: 'card_not_found', phase2Executed: false };
  }

  const card = await loadOpsCard(tenantId, input.cardId);
  if (!card || card.archived_at) {
    return { status: 'card_not_found', phase2Executed: false };
  }
  if (!card.acquisition_lead_id) {
    return { status: 'card_not_found', phase2Executed: false };
  }

  const destBoard = await loadDestBoard(tenantId, input.destinationBoardId);
  if (!destBoard || destBoard.archived_at || destBoard.is_active === false) {
    return {
      status: 'board_not_found',
      phase2Executed: false,
      cardId: card.id,
      acquisitionLeadId: card.acquisition_lead_id,
    };
  }

  const destColumn = await loadDestColumn(tenantId, input.destinationBoardId, input.destinationColumnId);
  if (!destColumn) {
    return {
      status: 'column_not_found',
      phase2Executed: false,
      cardId: card.id,
      acquisitionLeadId: card.acquisition_lead_id,
    };
  }

  const fromColumnName =
    (await loadColumnName(tenantId, input.sourceColumnId)) ??
    (await loadColumnName(tenantId, card.column_id)) ??
    input.sourceColumnId;

  if (
    card.board_id === input.destinationBoardId &&
    card.column_id === input.destinationColumnId
  ) {
    logOpsMoveEngine({
      cardId: card.id,
      source: input.source,
      from: fromColumnName,
      to: destColumn.name,
      phase2Executed: false,
      status: 'already_at_destination',
    });
    return {
      status: 'already_at_destination',
      phase2Executed: false,
      cardId: card.id,
      acquisitionLeadId: card.acquisition_lead_id,
    };
  }

  const client = await pool.connect();
  let moved = false;
  try {
    await beginKanbanTxWithRls(client, tenantId, input.actorUserId);

    await archiveConflictingLeadCardsGlobally(
      client,
      tenantId,
      card.acquisition_lead_id,
      card.id,
      input.actorUserId,
      input.correlationId,
    );

    const position =
      typeof input.position === 'number' && Number.isFinite(input.position)
        ? input.position
        : await nextKanbanCardPosition(client, input.destinationColumnId);

    const mergedMeta = mergeMetadata(card.metadata, input.metadataPatch);

    const upd = await client.query(
      `UPDATE chat_kanban_cards
       SET board_id = $1::uuid,
           column_id = $2::uuid,
           position = $3,
           metadata = $4::jsonb,
           updated_at = now(),
           updated_by_user_id = $5::uuid
       WHERE id = $6::uuid
         AND tenant_id = $7::uuid
         AND archived_at IS NULL`,
      [
        input.destinationBoardId,
        input.destinationColumnId,
        position,
        JSON.stringify(mergedMeta),
        input.actorUserId,
        card.id,
        tenantId,
      ],
    );

    if ((upd.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return {
        status: 'card_not_found',
        phase2Executed: false,
        cardId: card.id,
        acquisitionLeadId: card.acquisition_lead_id,
      };
    }

    await appendOperationalTimelineByCardId(client, card.id, {
      type: 'kanban_moved',
      label: TIMELINE_LABELS.kanban_moved,
      correlation_id: input.correlationId,
      from_column: fromColumnName,
      to_column: destColumn.name,
      source: input.source,
      move_reason: input.moveReason ?? null,
      move_confirmed: input.moveConfirmed ?? null,
    });

    await client.query('COMMIT');
    moved = true;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    const pgCode =
      typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: string }).code) : '';
    if (pgCode === '23505') {
      const refreshed = await loadOpsCard(tenantId, card.id);
      if (
        refreshed &&
        refreshed.board_id === input.destinationBoardId &&
        refreshed.column_id === input.destinationColumnId
      ) {
        logOpsMoveEngine({
          cardId: card.id,
          source: input.source,
          from: fromColumnName,
          to: destColumn.name,
          phase2Executed: false,
          status: 'already_at_destination',
          reason: 'unique_constraint_race',
        });
        return {
          status: 'already_at_destination',
          phase2Executed: false,
          cardId: card.id,
          acquisitionLeadId: card.acquisition_lead_id,
        };
      }
    }
    throw e;
  } finally {
    client.release();
  }

  if (!moved) {
    return {
      status: 'card_not_found',
      phase2Executed: false,
      cardId: card.id,
      acquisitionLeadId: card.acquisition_lead_id,
    };
  }

  const phase2Executed = await runPhase2ForLeadMove({
    tenantId,
    actorUserId: input.actorUserId,
    card,
    destBoard,
    destColumn,
    correlationId: input.correlationId,
  });

  const schedClient = await pool.connect();
  try {
    await beginKanbanTxWithRls(schedClient, tenantId, input.actorUserId);
    await cancelPendingScheduledMovesForCardColumn(
      schedClient,
      tenantId,
      card.id,
      input.sourceColumnId,
      'card_left_source_column',
      input.actorUserId,
      input.preserveScheduledMoveId,
    );
    await insertScheduledMoveIfColumnConfigured(schedClient, {
      tenantId,
      boardId: input.destinationBoardId,
      cardId: card.id,
      conversationId: null,
      acquisitionLeadId: card.acquisition_lead_id,
      columnId: input.destinationColumnId,
      columnMetadata: destColumn.metadata,
      actorUserId: input.actorUserId,
    });
    await schedClient.query('COMMIT');
  } catch (schedErr: unknown) {
    try {
      await schedClient.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('[kanbanScheduledMove] ops schedule sync after move (cartão já gravado)', {
      cardId: card.id,
      acquisitionLeadId: card.acquisition_lead_id,
      sourceColumnId: input.sourceColumnId,
      destinationColumnId: input.destinationColumnId,
      error: schedErr,
    });
  } finally {
    schedClient.release();
  }

  logOpsMoveEngine({
    cardId: card.id,
    source: input.source,
    from: fromColumnName,
    to: destColumn.name,
    phase2Executed,
    status: 'moved',
  });

  return {
    status: 'moved',
    phase2Executed,
    cardId: card.id,
    acquisitionLeadId: card.acquisition_lead_id,
  };
}
