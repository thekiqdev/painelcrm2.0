/**
 * Sprint K8.1 — logs estruturados para auto_move_by_time (somente observabilidade).
 */

export type KanbanScheduledMoveAction =
  | 'scheduled'
  | 'executed'
  | 'cancelled'
  | 'skipped'
  | 'failed'
  | 'cross_board_move';

export type KanbanScheduledMoveSkipReason =
  | 'destination_column_missing'
  | 'destination_board_missing'
  | 'source_column_changed'
  | 'conversation_already_on_destination_board'
  | 'acquisition_lead_already_on_destination_board'
  | 'configuration_disabled'
  | 'card_archived'
  | 'no_actor_user_for_automation'
  | 'destination_column_board_mismatch';

export type KanbanScheduledMoveCancelReason =
  | 'card_left_source_column'
  | 'card_archived'
  | 'card_deleted'
  | 'manual_move';

type LogBase = {
  correlationId?: string | null;
};

function emit(action: KanbanScheduledMoveAction, fields: Record<string, unknown>): void {
  console.info('[kanbanScheduledMove]', {
    action,
    ...fields,
    ts: new Date().toISOString(),
  });
}

export function scheduledMoveCorrelationId(scheduledMoveId: string): string {
  return `scheduled-move:${scheduledMoveId}`;
}

/** Mapeia razão interna (DB) para razão de log de skip — sem alterar persistência. */
export function normalizeSkipReasonForLog(
  internalReason: string,
  context?: { destinationColumnMissing?: boolean },
): KanbanScheduledMoveSkipReason | string {
  switch (internalReason) {
    case 'card_not_in_source_column':
      return 'source_column_changed';
    case 'column_missing':
      return context?.destinationColumnMissing ? 'destination_column_missing' : 'destination_column_missing';
    case 'board_missing':
    case 'destination_column_board_mismatch':
      return 'destination_board_missing';
    case 'automation_config_changed_or_disabled':
      return 'configuration_disabled';
    case 'conversation_already_on_destination_board':
      return 'conversation_already_on_destination_board';
    case 'acquisition_lead_already_on_destination_board':
      return 'acquisition_lead_already_on_destination_board';
    case 'card_missing_or_archived':
      return 'card_archived';
    case 'no_actor_user_for_automation':
      return 'no_actor_user_for_automation';
    default:
      return internalReason;
  }
}

/** Mapeia razão interna (DB) para razão de log de cancelamento — sem alterar persistência. */
export function normalizeCancelReasonForLog(internalReason: string): KanbanScheduledMoveCancelReason | string {
  const r = internalReason.trim().toLowerCase();
  if (r === 'card_left_source_column') return 'card_left_source_column';
  if (r === 'card_deleted') return 'card_deleted';
  if (r.includes('archived')) return 'card_archived';
  if (
    r === 'card_left_source_column_proposal_accept' ||
    r.startsWith('superseded_') ||
    r === 'manual_move'
  ) {
    return 'manual_move';
  }
  return internalReason;
}

export function logKanbanScheduledMoveScheduled(
  fields: LogBase & {
    scheduledMoveId: string;
    cardId: string;
    acquisitionLeadId?: string | null;
    conversationId?: string | null;
    fromBoard: string;
    fromColumn: string;
    toBoard: string;
    toColumn: string;
    delayValue: number;
    delayUnit: string;
    executeAt: Date | string;
  },
): void {
  emit('scheduled', {
    correlationId: fields.correlationId ?? scheduledMoveCorrelationId(fields.scheduledMoveId),
    scheduledMoveId: fields.scheduledMoveId,
    cardId: fields.cardId,
    acquisitionLeadId: fields.acquisitionLeadId ?? null,
    conversationId: fields.conversationId ?? null,
    fromBoard: fields.fromBoard,
    fromColumn: fields.fromColumn,
    toBoard: fields.toBoard,
    toColumn: fields.toColumn,
    delayValue: fields.delayValue,
    delayUnit: fields.delayUnit,
    executeAt:
      fields.executeAt instanceof Date ? fields.executeAt.toISOString() : fields.executeAt,
  });
}

export function logKanbanScheduledMoveExecuted(
  fields: LogBase & {
    scheduledMoveId: string;
    cardId: string;
    acquisitionLeadId?: string | null;
    conversationId?: string | null;
    fromBoard: string;
    fromColumn: string;
    toBoard: string;
    toColumn: string;
    executedAt: Date | string;
    detail?: string;
  },
): void {
  emit('executed', {
    correlationId: fields.correlationId ?? scheduledMoveCorrelationId(fields.scheduledMoveId),
    scheduledMoveId: fields.scheduledMoveId,
    cardId: fields.cardId,
    acquisitionLeadId: fields.acquisitionLeadId ?? null,
    conversationId: fields.conversationId ?? null,
    fromBoard: fields.fromBoard,
    fromColumn: fields.fromColumn,
    toBoard: fields.toBoard,
    toColumn: fields.toColumn,
    executedAt:
      fields.executedAt instanceof Date ? fields.executedAt.toISOString() : fields.executedAt,
    ...(fields.detail ? { detail: fields.detail } : {}),
  });
}

export function logKanbanScheduledMoveCancelled(
  fields: LogBase & {
    scheduledMoveId: string;
    cardId: string;
    reason: string;
    acquisitionLeadId?: string | null;
    conversationId?: string | null;
  },
): void {
  emit('cancelled', {
    correlationId: fields.correlationId ?? scheduledMoveCorrelationId(fields.scheduledMoveId),
    scheduledMoveId: fields.scheduledMoveId,
    cardId: fields.cardId,
    reason: normalizeCancelReasonForLog(fields.reason),
    acquisitionLeadId: fields.acquisitionLeadId ?? null,
    conversationId: fields.conversationId ?? null,
    internalReason: fields.reason,
  });
}

export function logKanbanScheduledMoveSkipped(
  fields: LogBase & {
    scheduledMoveId: string;
    cardId: string;
    reason: string;
    acquisitionLeadId?: string | null;
    conversationId?: string | null;
    internalReason?: string;
  },
): void {
  emit('skipped', {
    correlationId: fields.correlationId ?? scheduledMoveCorrelationId(fields.scheduledMoveId),
    scheduledMoveId: fields.scheduledMoveId,
    cardId: fields.cardId,
    acquisitionLeadId: fields.acquisitionLeadId ?? null,
    conversationId: fields.conversationId ?? null,
    reason: fields.reason,
    ...(fields.internalReason ? { internalReason: fields.internalReason } : {}),
  });
}

export function logKanbanScheduledMoveFailed(
  fields: LogBase & {
    scheduledMoveId?: string;
    cardId: string;
    acquisitionLeadId?: string | null;
    conversationId?: string | null;
    error: unknown;
  },
): void {
  const err = fields.error;
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  emit('failed', {
    correlationId:
      fields.correlationId ??
      (fields.scheduledMoveId ? scheduledMoveCorrelationId(fields.scheduledMoveId) : null),
    scheduledMoveId: fields.scheduledMoveId ?? null,
    cardId: fields.cardId,
    acquisitionLeadId: fields.acquisitionLeadId ?? null,
    conversationId: fields.conversationId ?? null,
    error: message,
    ...(stack ? { stack } : {}),
  });
}

export function logKanbanScheduledMoveCrossBoard(
  fields: LogBase & {
    cardId: string;
    acquisitionLeadId?: string | null;
    conversationId?: string | null;
    fromBoard: string;
    toBoard: string;
    fromColumn: string;
    toColumn: string;
    scheduledMoveId?: string;
  },
): void {
  emit('cross_board_move', {
    correlationId:
      fields.correlationId ??
      (fields.scheduledMoveId ? scheduledMoveCorrelationId(fields.scheduledMoveId) : null),
    cardId: fields.cardId,
    acquisitionLeadId: fields.acquisitionLeadId ?? null,
    conversationId: fields.conversationId ?? null,
    fromBoard: fields.fromBoard,
    toBoard: fields.toBoard,
    fromColumn: fields.fromColumn,
    toColumn: fields.toColumn,
    ...(fields.scheduledMoveId ? { scheduledMoveId: fields.scheduledMoveId } : {}),
  });
}

/** @deprecated Sprint K8 — use funções tipadas acima. Mantido para compatibilidade interna. */
export function logKanbanScheduledMoveEvent(payload: {
  event: 'scheduled' | 'executed' | 'cancelled' | 'skipped' | 'failed';
  scheduledMoveId?: string;
  cardId: string;
  conversationId?: string | null;
  acquisitionLeadId?: string | null;
  sourceBoardId?: string;
  destBoardId?: string | null;
  fromColumnId?: string;
  toColumnId?: string;
  delayValue?: number;
  delayUnit?: string;
  scheduledAt?: Date | string | null;
  executedAt?: Date | string | null;
  detail?: string;
}): void {
  const correlationId = payload.scheduledMoveId
    ? scheduledMoveCorrelationId(payload.scheduledMoveId)
    : undefined;
  switch (payload.event) {
    case 'scheduled':
      if (payload.scheduledMoveId && payload.fromColumnId && payload.toColumnId && payload.sourceBoardId) {
        logKanbanScheduledMoveScheduled({
          correlationId,
          scheduledMoveId: payload.scheduledMoveId,
          cardId: payload.cardId,
          acquisitionLeadId: payload.acquisitionLeadId,
          conversationId: payload.conversationId,
          fromBoard: payload.sourceBoardId,
          fromColumn: payload.fromColumnId,
          toBoard: payload.destBoardId ?? payload.sourceBoardId,
          toColumn: payload.toColumnId,
          delayValue: payload.delayValue ?? 0,
          delayUnit: payload.delayUnit ?? 'minutes',
          executeAt: payload.scheduledAt ?? new Date().toISOString(),
        });
      }
      break;
    case 'executed':
      if (payload.scheduledMoveId && payload.fromColumnId && payload.toColumnId && payload.sourceBoardId) {
        logKanbanScheduledMoveExecuted({
          correlationId,
          scheduledMoveId: payload.scheduledMoveId,
          cardId: payload.cardId,
          acquisitionLeadId: payload.acquisitionLeadId,
          conversationId: payload.conversationId,
          fromBoard: payload.sourceBoardId,
          fromColumn: payload.fromColumnId,
          toBoard: payload.destBoardId ?? payload.sourceBoardId,
          toColumn: payload.toColumnId,
          executedAt: payload.executedAt ?? new Date().toISOString(),
          detail: payload.detail,
        });
      }
      break;
    case 'cancelled':
      if (payload.scheduledMoveId) {
        logKanbanScheduledMoveCancelled({
          correlationId,
          scheduledMoveId: payload.scheduledMoveId,
          cardId: payload.cardId,
          reason: payload.detail ?? 'manual_move',
          acquisitionLeadId: payload.acquisitionLeadId,
          conversationId: payload.conversationId,
        });
      }
      break;
    case 'skipped':
      if (payload.scheduledMoveId) {
        logKanbanScheduledMoveSkipped({
          correlationId,
          scheduledMoveId: payload.scheduledMoveId,
          cardId: payload.cardId,
          reason: normalizeSkipReasonForLog(payload.detail ?? 'unknown'),
          acquisitionLeadId: payload.acquisitionLeadId,
          conversationId: payload.conversationId,
          internalReason: payload.detail,
        });
      }
      break;
    case 'failed':
      logKanbanScheduledMoveFailed({
        correlationId,
        scheduledMoveId: payload.scheduledMoveId,
        cardId: payload.cardId,
        acquisitionLeadId: payload.acquisitionLeadId,
        conversationId: payload.conversationId,
        error: payload.detail ?? 'unknown',
      });
      break;
  }
}
