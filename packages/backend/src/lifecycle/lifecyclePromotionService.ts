/**
 * Sprint I — Board Promotion Engine (Lifecycle Router → move card idempotente).
 */
import { SUPERADMIN_OPS_KANBAN_TENANT_ID } from '../config/superadminOpsKanban.js';
import { pool } from '../utils/db.js';
import { beginKanbanTxWithRls } from '../utils/kanbanRlsTx.js';
import { findCanonicalOpsBoardIdByNameFromPool } from '../services/superadminOpsKanbanFoundation.js';
import { hasKanbanAcquisitionLeadColumn } from '../services/superadminOpsKanbanLeadService.js';
import { resolveLifecycleRoute } from './lifecycleRouter.js';
import { isOpsLifecyclePromotionEnabled } from './lifecyclePromotionConfig.js';
import { insertLifecycleTransition } from './lifecyclePromotionRepository.js';
import type { BillingLifecycleContext } from './lifecycleBillingObserver.js';
import type { LifecycleEventType } from './lifecycleTypes.js';

export type LifecycleCardRef = {
  cardId: string;
  boardId: string;
  columnId: string;
  boardName: string;
  columnName: string;
  acquisitionLeadId: string;
};

export type LifecycleDestination = {
  boardId: string;
  columnId: string;
  boardName: string;
  columnName: string;
};

export type LifecyclePromotionStatus =
  | 'moved'
  | 'already_at_destination'
  | 'card_not_found'
  | 'board_not_found'
  | 'column_not_found'
  | 'promotion_disabled'
  | 'route_unmatched'
  | 'migration_required'
  | 'no_actor'
  | 'error';

export type LifecyclePromotionResult = {
  status: LifecyclePromotionStatus;
  cardId?: string;
  fromBoard?: string;
  fromColumn?: string;
  toBoard?: string;
  toColumn?: string;
  reason?: string;
  auditId?: string | null;
};

export type PromoteLifecycleCardInput = {
  eventType: LifecycleEventType | string;
  context?: BillingLifecycleContext;
  correlationId?: string | null;
  source: string;
};

async function resolveActorUserId(): Promise<string | null> {
  const envId = process.env.SUPERADMIN_OPS_KANBAN_SYSTEM_USER_ID?.trim();
  if (envId) return envId;
  const su = await pool.query<{ id: string }>(
    `SELECT id::text FROM users WHERE is_super_admin = true ORDER BY created_at ASC LIMIT 1`,
  );
  return su.rows[0]?.id ?? null;
}

async function resolveLeadIdFromTenant(tenantId: string): Promise<string | null> {
  const r = await pool.query<{ id: string }>(
    `SELECT id::text FROM acquisition_leads WHERE tenant_id = $1::uuid ORDER BY updated_at DESC LIMIT 1`,
    [tenantId],
  );
  return r.rows[0]?.id ?? null;
}

async function loadLifecycleCardByLeadId(acquisitionLeadId: string): Promise<LifecycleCardRef | null> {
  const r = await pool.query<{
    card_id: string;
    board_id: string;
    column_id: string;
    board_name: string;
    column_name: string;
  }>(
    `SELECT kc.id::text AS card_id,
            kc.board_id::text AS board_id,
            kc.column_id::text AS column_id,
            b.name AS board_name,
            col.name AS column_name
     FROM chat_kanban_cards kc
     INNER JOIN chat_kanban_boards b ON b.id = kc.board_id AND b.tenant_id = kc.tenant_id
     INNER JOIN chat_kanban_columns col ON col.id = kc.column_id
     WHERE kc.tenant_id = $1::uuid
       AND kc.acquisition_lead_id = $2::uuid
       AND kc.archived_at IS NULL
     ORDER BY kc.updated_at DESC
     LIMIT 1`,
    [SUPERADMIN_OPS_KANBAN_TENANT_ID, acquisitionLeadId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    cardId: row.card_id,
    boardId: row.board_id,
    columnId: row.column_id,
    boardName: row.board_name,
    columnName: row.column_name,
    acquisitionLeadId,
  };
}

/**
 * Localiza card ops existente — nunca cria card novo.
 */
export async function findLifecycleCardForLead(input: {
  acquisitionLeadId?: string | null;
  tenantId?: string | null;
}): Promise<LifecycleCardRef | null> {
  if (!(await hasKanbanAcquisitionLeadColumn())) {
    return null;
  }

  let leadId = input.acquisitionLeadId?.trim() || null;
  if (!leadId && input.tenantId) {
    leadId = await resolveLeadIdFromTenant(input.tenantId);
  }
  if (!leadId) return null;

  return loadLifecycleCardByLeadId(leadId);
}

async function findColumnIdOnBoard(boardId: string, columnName: string): Promise<string | null> {
  const r = await pool.query<{ id: string }>(
    `SELECT c.id::text
     FROM chat_kanban_columns c
     INNER JOIN chat_kanban_boards b ON b.id = c.board_id AND b.tenant_id = c.tenant_id
     WHERE c.tenant_id = $1::uuid
       AND c.board_id = $2::uuid
       AND b.archived_at IS NULL
       AND b.is_active = true
       AND lower(btrim(c.name)) = lower(btrim($3))
     LIMIT 1`,
    [SUPERADMIN_OPS_KANBAN_TENANT_ID, boardId, columnName],
  );
  return r.rows[0]?.id ?? null;
}

/**
 * Resolve board canônico + coluna por nome (router).
 */
export async function resolveLifecycleDestinationColumn(
  boardName: string,
  columnName: string,
): Promise<LifecycleDestination | null> {
  const boardId = await findCanonicalOpsBoardIdByNameFromPool(boardName);
  if (!boardId) return null;

  const columnId = await findColumnIdOnBoard(boardId, columnName);
  if (!columnId) return null;

  return { boardId, columnId, boardName, columnName };
}

async function moveCardToDestination(input: {
  cardId: string;
  destBoardId: string;
  destColumnId: string;
  actorUserId: string;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await beginKanbanTxWithRls(client, SUPERADMIN_OPS_KANBAN_TENANT_ID, input.actorUserId);
    const posRes = await client.query<{ n: number }>(
      `SELECT COALESCE(MAX(position), 0)::float8 + 1 AS n
       FROM chat_kanban_cards
       WHERE column_id = $1::uuid AND tenant_id = $2::uuid AND archived_at IS NULL`,
      [input.destColumnId, SUPERADMIN_OPS_KANBAN_TENANT_ID],
    );
    const nextPos = Number(posRes.rows[0]?.n ?? 1);
    await client.query(
      `UPDATE chat_kanban_cards
       SET board_id = $1::uuid, column_id = $2::uuid, position = $3, updated_at = now()
       WHERE id = $4::uuid AND tenant_id = $5::uuid AND archived_at IS NULL`,
      [input.destBoardId, input.destColumnId, nextPos, input.cardId, SUPERADMIN_OPS_KANBAN_TENANT_ID],
    );
    await client.query('COMMIT');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

function logPromotion(payload: Record<string, unknown>): void {
  console.info('[lifecycle_promotion]', payload);
}

async function auditAndReturn(
  input: PromoteLifecycleCardInput,
  result: LifecyclePromotionResult,
  extra?: {
    card?: LifecycleCardRef | null;
    dest?: LifecycleDestination | null;
    metadata?: Record<string, unknown>;
  },
): Promise<LifecyclePromotionResult> {
  const auditId = await insertLifecycleTransition({
    acquisitionLeadId: input.context?.acquisitionLeadId ?? extra?.card?.acquisitionLeadId ?? null,
    tenantId: input.context?.tenantId ?? null,
    cardId: result.cardId ?? extra?.card?.cardId ?? null,
    eventType: String(input.eventType),
    sourceBoardId: extra?.card?.boardId ?? null,
    sourceColumnId: extra?.card?.columnId ?? null,
    destinationBoardId: extra?.dest?.boardId ?? null,
    destinationColumnId: extra?.dest?.columnId ?? null,
    result: result.status,
    correlationId: input.correlationId ?? input.context?.correlationId ?? null,
    metadata: {
      source: input.source,
      reason: result.reason ?? null,
      promotion_enabled: isOpsLifecyclePromotionEnabled(),
      ...extra?.metadata,
    },
  });
  return { ...result, auditId };
}

/**
 * Promove card conforme rota do Lifecycle Router (idempotente; flag controla move real).
 */
export async function promoteLifecycleCard(input: PromoteLifecycleCardInput): Promise<LifecyclePromotionResult> {
  const ctx = input.context ?? {};

  if (!(await hasKanbanAcquisitionLeadColumn())) {
    const result: LifecyclePromotionResult = {
      status: 'migration_required',
      reason: 'migration_260_required',
    };
    logPromotion({ event: input.eventType, result: result.status, source: input.source });
    return auditAndReturn(input, result);
  }

  const route = resolveLifecycleRoute(input.eventType, {
    tenantId: ctx.tenantId ?? null,
    acquisitionLeadId: ctx.acquisitionLeadId ?? null,
    subscriptionId: ctx.subscriptionId ?? null,
    invoiceId: ctx.invoiceId ?? null,
    correlationId: input.correlationId ?? ctx.correlationId ?? null,
  });

  if (!route.matched || route.fallback) {
    const result: LifecyclePromotionResult = {
      status: 'route_unmatched',
      reason: route.reason,
      toBoard: route.boardName,
      toColumn: route.columnName,
    };
    logPromotion({ event: input.eventType, result: result.status, reason: route.reason, source: input.source });
    return auditAndReturn(input, result, { metadata: { route } });
  }

  let leadId = ctx.acquisitionLeadId ?? null;
  if (!leadId && ctx.tenantId) {
    leadId = await resolveLeadIdFromTenant(ctx.tenantId);
  }

  const card = await findLifecycleCardForLead({
    acquisitionLeadId: leadId,
    tenantId: ctx.tenantId ?? null,
  });

  if (!card) {
    const result: LifecyclePromotionResult = {
      status: 'card_not_found',
      toBoard: route.boardName,
      toColumn: route.columnName,
    };
    logPromotion({
      event: input.eventType,
      result: result.status,
      toBoard: route.boardName,
      toColumn: route.columnName,
      source: input.source,
    });
    return auditAndReturn(input, result, { metadata: { route } });
  }

  const dest = await resolveLifecycleDestinationColumn(route.boardName, route.columnName);
  if (!dest) {
    const boardId = await findCanonicalOpsBoardIdByNameFromPool(route.boardName);
    const status: LifecyclePromotionStatus = boardId ? 'column_not_found' : 'board_not_found';
    const result: LifecyclePromotionResult = {
      status,
      cardId: card.cardId,
      fromBoard: card.boardName,
      fromColumn: card.columnName,
      toBoard: route.boardName,
      toColumn: route.columnName,
      reason: `${status}:${route.boardName}/${route.columnName}`,
    };
    logPromotion({ ...result, event: input.eventType, source: input.source });
    return auditAndReturn(input, result, { card, metadata: { route } });
  }

  if (card.boardId === dest.boardId && card.columnId === dest.columnId) {
    const result: LifecyclePromotionResult = {
      status: 'already_at_destination',
      cardId: card.cardId,
      fromBoard: card.boardName,
      fromColumn: card.columnName,
      toBoard: dest.boardName,
      toColumn: dest.columnName,
    };
    logPromotion({ ...result, event: input.eventType, source: input.source });
    return auditAndReturn(input, result, { card, dest, metadata: { route } });
  }

  if (!isOpsLifecyclePromotionEnabled()) {
    const result: LifecyclePromotionResult = {
      status: 'promotion_disabled',
      cardId: card.cardId,
      fromBoard: card.boardName,
      fromColumn: card.columnName,
      toBoard: dest.boardName,
      toColumn: dest.columnName,
      reason: 'OPS_LIFECYCLE_PROMOTION_ENABLED=false',
    };
    logPromotion({ ...result, event: input.eventType, source: input.source });
    return auditAndReturn(input, result, { card, dest, metadata: { route } });
  }

  const actor = await resolveActorUserId();
  if (!actor) {
    const result: LifecyclePromotionResult = {
      status: 'no_actor',
      cardId: card.cardId,
      fromBoard: card.boardName,
      fromColumn: card.columnName,
      toBoard: dest.boardName,
      toColumn: dest.columnName,
    };
    logPromotion({ ...result, event: input.eventType, source: input.source });
    return auditAndReturn(input, result, { card, dest, metadata: { route } });
  }

  try {
    await moveCardToDestination({
      cardId: card.cardId,
      destBoardId: dest.boardId,
      destColumnId: dest.columnId,
      actorUserId: actor,
    });
    const result: LifecyclePromotionResult = {
      status: 'moved',
      cardId: card.cardId,
      fromBoard: card.boardName,
      fromColumn: card.columnName,
      toBoard: dest.boardName,
      toColumn: dest.columnName,
    };
    logPromotion({ ...result, event: input.eventType, source: input.source });
    return auditAndReturn(input, result, { card, dest, metadata: { route } });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'move_failed';
    const result: LifecyclePromotionResult = {
      status: 'error',
      cardId: card.cardId,
      fromBoard: card.boardName,
      fromColumn: card.columnName,
      toBoard: dest.boardName,
      toColumn: dest.columnName,
      reason: message,
    };
    logPromotion({ ...result, event: input.eventType, source: input.source });
    return auditAndReturn(input, result, { card, dest, metadata: { route } });
  }
}
