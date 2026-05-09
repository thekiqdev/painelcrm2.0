/**
 * Efeitos ao mover cartão Kanban para outra coluna (reutilizado por PATCH / worker).
 * Não faz COMMIT/ROLLBACK — o caller controla a transação.
 */
import type { PoolClient } from 'pg';
import {
  applyKanbanColumnEnterRules,
  applyKanbanColumnOrganizationRules,
  kanbanRulesRequireAttendanceMutation,
  kanbanRulesRequireOrganizationMutation,
  parseKanbanColumnRules,
} from '../utils/kanbanColumnRules.js';
import {
  runKanbanCrmStageSyncInTransaction,
  runKanbanEnsureClientAutomationInTransaction,
  runKanbanLeadAutomationInTransaction,
  runKanbanTaskAutomationInTransaction,
  type KanbanPhase2AutomationContext,
} from './kanbanColumnAutomationService.js';
import {
  runKanbanAutoCreateProposalInTransaction,
  type KanbanAutoCreatedProposalPayload,
} from './kanbanColumnAutoProposalService.js';
import type { KanbanColumnEntryAutomationReason } from './chatKanbanAutomationService.js';

export type KanbanDestColumnPipelineRow = {
  id: string;
  name: string;
  metadata: unknown;
  funnel_stage_id: string | null;
};

export type KanbanColumnEnterSideEffectsResult = {
  attendancePatch: Record<string, unknown> | null;
  emitCtx: { tenantId: string | null; ownerUserId: string } | null;
  orgRulesApplied: boolean;
  phase2Ctx: KanbanPhase2AutomationContext;
};

export async function applyKanbanDestColumnEnterSideEffectsBeforeCardUpdate(
  client: PoolClient,
  input: {
    tenantId: string;
    actorUserId: string;
    boardId: string;
    boardLinkedFunnelId: string | null;
    destColumn: KanbanDestColumnPipelineRow;
    destColumnId: string;
    cardId: string;
    conversationId: string;
    moveReason: string | null;
  },
): Promise<KanbanColumnEnterSideEffectsResult> {
  const rules = parseKanbanColumnRules(input.destColumn.metadata);
  let attendancePatch: Record<string, unknown> | null = null;
  let emitCtx: { tenantId: string | null; ownerUserId: string } | null = null;
  let orgRulesApplied = false;
  if (kanbanRulesRequireAttendanceMutation(rules)) {
    const applied = await applyKanbanColumnEnterRules(client, {
      conversationId: input.conversationId,
      actorUserId: input.actorUserId,
      rules,
      columnName: String(input.destColumn.name),
      columnId: input.destColumnId,
      moveReason: input.moveReason,
    });
    attendancePatch = applied.attendancePatch;
    emitCtx = applied.emit ?? null;
  }
  if (kanbanRulesRequireOrganizationMutation(rules)) {
    await applyKanbanColumnOrganizationRules(client, {
      conversationId: input.conversationId,
      actorUserId: input.actorUserId,
      rules,
      columnId: input.destColumnId,
      columnName: String(input.destColumn.name),
      moveReason: input.moveReason,
    });
    orgRulesApplied = true;
  }
  const phase2Ctx: KanbanPhase2AutomationContext = {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    boardId: input.boardId,
    boardLinkedFunnelId: input.boardLinkedFunnelId,
    boardName: null,
    columnId: String(input.destColumn.id),
    columnName: String(input.destColumn.name),
    cardId: input.cardId,
    conversationId: input.conversationId,
    conversationDisplayName: null,
    conversationClientId: null,
    conversationLeadId: null,
    assignedToUserId: (attendancePatch?.assigned_to_user_id as string | null | undefined) ?? null,
    assignedTeamId: (attendancePatch?.assigned_team_id as string | null | undefined) ?? null,
    queueId: (attendancePatch?.queue_id as string | null | undefined) ?? null,
    attendanceStatus: (attendancePatch?.attendance_status as string | null | undefined) ?? null,
    columnMetadata: input.destColumn.metadata,
  };
  return { attendancePatch, emitCtx, orgRulesApplied, phase2Ctx };
}

export type KanbanDestColumnPostUpdateResult = {
  kanban_auto_created_proposal?: KanbanAutoCreatedProposalPayload;
  /** Executar após COMMIT — vínculos CRM gravados na mesma TX do cartão. */
  deferredEntryAutomations?: Extract<KanbanColumnEntryAutomationReason, 'lead_linked' | 'client_linked'>[];
};

export async function runKanbanDestColumnPostUpdateAutomations(
  client: PoolClient,
  input: {
    tenantId: string;
    actorUserId: string;
    boardId: string;
    boardLinkedFunnelId: string | null;
    destColumn: KanbanDestColumnPipelineRow;
    cardId: string;
    conversationId: string;
  },
): Promise<KanbanDestColumnPostUpdateResult> {
  const deferred: Extract<KanbanColumnEntryAutomationReason, 'lead_linked' | 'client_linked'>[] = [];

  const ensureRes = await runKanbanEnsureClientAutomationInTransaction(client, {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    boardId: input.boardId,
    columnId: String(input.destColumn.id),
    columnName: String(input.destColumn.name),
    cardId: input.cardId,
    conversationId: input.conversationId,
    columnMetadata: input.destColumn.metadata,
  });
  if (ensureRes.status === 'success' && ensureRes.clientLinked) {
    deferred.push('client_linked');
  }

  const leadRes = await runKanbanLeadAutomationInTransaction(client, {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    boardId: input.boardId,
    columnId: String(input.destColumn.id),
    columnName: String(input.destColumn.name),
    cardId: input.cardId,
    conversationId: input.conversationId,
    columnMetadata: input.destColumn.metadata,
  });
  if (leadRes.status === 'success' && leadRes.leadLinked) {
    deferred.push('lead_linked');
  }
  await runKanbanCrmStageSyncInTransaction(client, {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    boardId: input.boardId,
    boardLinkedFunnelId: input.boardLinkedFunnelId,
    columnId: String(input.destColumn.id),
    columnName: String(input.destColumn.name),
    columnFunnelStageId: input.destColumn.funnel_stage_id,
    cardId: input.cardId,
    conversationId: input.conversationId,
  });
  await runKanbanTaskAutomationInTransaction(client, {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    boardId: input.boardId,
    columnId: String(input.destColumn.id),
    columnName: String(input.destColumn.name),
    cardId: input.cardId,
    conversationId: input.conversationId,
    columnMetadata: input.destColumn.metadata,
  });

  const auto = await runKanbanAutoCreateProposalInTransaction(client, {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    cardId: input.cardId,
    conversationId: input.conversationId,
    destColumnId: String(input.destColumn.id),
    destColumnMetadata: input.destColumn.metadata,
    boardId: input.boardId,
  });
  const out: KanbanDestColumnPostUpdateResult = {};
  if (auto) out.kanban_auto_created_proposal = auto;
  if (deferred.length > 0) out.deferredEntryAutomations = deferred;
  return out;
}
