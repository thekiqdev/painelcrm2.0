/**
 * Etapa 2 — ao aceitar proposta (status `accepted`), move cartões do Kanban conforme metadata
 * da coluna de origem (`kanban_proposals.move_on_proposal_accept` + `target_column_id`).
 */
import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import { beginKanbanTxWithRls } from '../utils/kanbanRlsTx.js';
import { parseKanbanProposalsMetadata } from '../utils/kanbanProposalsMetadata.js';
import {
  applyKanbanDestColumnEnterSideEffectsBeforeCardUpdate,
  runKanbanDestColumnPostUpdateAutomations,
  type KanbanDestColumnPipelineRow,
} from './kanbanInternalCardColumnPipeline.js';
import { emitKanbanAttendanceIfNeeded } from '../utils/kanbanColumnRules.js';
import { runKanbanPhase2Automations, type KanbanPhase2AutomationContext } from './kanbanColumnAutomationService.js';
import {
  cancelPendingScheduledMovesForCardColumn,
  enrichPhase2AfterCommit,
  insertScheduledMoveIfColumnConfigured,
} from './kanbanScheduledMoveService.js';
import { insertProposalTimelineEvent } from './proposalTimelineService.js';
import { emitConversationUpdatedToTenant } from './websocketService.js';

const MOVE_REASON = 'Proposta aceita (automação Kanban)';
const TIMELINE_EVENT = 'proposal_kanban_moved_on_accept';

export type ProposalKanbanAcceptAutomationInput = {
  tenantId: string;
  proposalId: string;
  clientId: string | null;
  leadId: string | null;
  /** `proposals.user_id` — ator RLS e side-effects do Kanban. */
  actorUserId: string;
  acceptanceSource: 'public_link' | 'panel';
};

async function timelineAlreadyHasCardMove(proposalId: string, cardId: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM proposal_timeline_events
     WHERE proposal_id = $1 AND event_type = $2 AND (payload->>'card_id') = $3
     LIMIT 1`,
    [proposalId, TIMELINE_EVENT, cardId],
  );
  return (r.rowCount ?? 0) > 0;
}

async function listCandidateCardIds(
  tenantId: string,
  clientId: string | null,
  leadId: string | null,
): Promise<string[]> {
  if (clientId) {
    const r = await pool.query<{ id: string }>(
      `SELECT kc.id::text AS id
       FROM chat_kanban_cards kc
       INNER JOIN chat_conversations cc ON cc.id = kc.conversation_id
       WHERE kc.tenant_id = $1
         AND kc.archived_at IS NULL
         AND cc.client_id = $2::uuid`,
      [tenantId, clientId],
    );
    return r.rows.map((x) => x.id);
  }
  if (leadId) {
    const r = await pool.query<{ id: string }>(
      `SELECT kc.id::text AS id
       FROM chat_kanban_cards kc
       INNER JOIN chat_conversations cc ON cc.id = kc.conversation_id
       WHERE kc.tenant_id = $1
         AND kc.archived_at IS NULL
         AND cc.lead_id = $2::uuid`,
      [tenantId, leadId],
    );
    return r.rows.map((x) => x.id);
  }
  return [];
}

async function tryMoveOneCard(
  client: PoolClient,
  input: ProposalKanbanAcceptAutomationInput & { cardId: string },
): Promise<boolean> {
  const { tenantId, proposalId, actorUserId, cardId } = input;

  if (await timelineAlreadyHasCardMove(proposalId, cardId)) {
    return false;
  }

  await beginKanbanTxWithRls(client, tenantId, actorUserId);

  const cardRes = await client.query<{
    id: string;
    board_id: string;
    column_id: string;
    conversation_id: string;
  }>(
    `SELECT id, board_id::text, column_id::text, conversation_id::text
     FROM chat_kanban_cards
     WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL
     FOR UPDATE`,
    [cardId, tenantId],
  );
  if (cardRes.rows.length === 0) {
    await client.query('ROLLBACK');
    return false;
  }
  const card = cardRes.rows[0]!;

  const srcColRes = await client.query<{ metadata: unknown }>(
    `SELECT metadata FROM chat_kanban_columns WHERE id = $1 AND tenant_id = $2`,
    [card.column_id, tenantId],
  );
  if (srcColRes.rows.length === 0) {
    await client.query('ROLLBACK');
    return false;
  }
  const kp = parseKanbanProposalsMetadata(srcColRes.rows[0].metadata);
  if (!kp.move_on_proposal_accept || !kp.target_column_id) {
    await client.query('ROLLBACK');
    return false;
  }
  if (kp.target_column_id === card.column_id) {
    await client.query('ROLLBACK');
    return false;
  }

  const destColRes = await client.query<{
    id: string;
    board_id: string;
    name: string;
    metadata: unknown;
    funnel_stage_id: string | null;
  }>(
    `SELECT id, board_id::text, name, metadata, funnel_stage_id::text
     FROM chat_kanban_columns
     WHERE id = $1 AND tenant_id = $2`,
    [kp.target_column_id, tenantId],
  );
  if (destColRes.rows.length === 0) {
    await client.query('ROLLBACK');
    return false;
  }
  const destRow = destColRes.rows[0]!;
  if (String(destRow.board_id) !== String(card.board_id)) {
    await client.query('ROLLBACK');
    return false;
  }

  const boardRes = await client.query<{ linked_sales_funnel_id: string | null }>(
    `SELECT linked_sales_funnel_id::text FROM chat_kanban_boards WHERE id = $1 AND tenant_id = $2`,
    [card.board_id, tenantId],
  );
  if (boardRes.rows.length === 0) {
    await client.query('ROLLBACK');
    return false;
  }
  const boardLinkedFunnelId = (boardRes.rows[0].linked_sales_funnel_id as string | null) ?? null;

  const dest: KanbanDestColumnPipelineRow = {
    id: String(destRow.id),
    name: String(destRow.name),
    metadata: destRow.metadata,
    funnel_stage_id: destRow.funnel_stage_id ?? null,
  };

  const sourceColumnIdBefore = String(card.column_id);

  let side: Awaited<ReturnType<typeof applyKanbanDestColumnEnterSideEffectsBeforeCardUpdate>>;
  try {
    side = await applyKanbanDestColumnEnterSideEffectsBeforeCardUpdate(client, {
      tenantId,
      actorUserId,
      boardId: String(card.board_id),
      boardLinkedFunnelId,
      destColumn: dest,
      destColumnId: String(dest.id),
      cardId,
      conversationId: String(card.conversation_id),
      moveReason: MOVE_REASON,
    });
  } catch (e: unknown) {
    await client.query('ROLLBACK');
    console.warn('[proposalKanbanAcceptAutomation] column enter failed', { cardId, error: e });
    return false;
  }

  const posRes = await client.query<{ n: number }>(
    `SELECT COALESCE(MAX(position), 0)::float8 + 1 AS n FROM chat_kanban_cards
     WHERE column_id = $1 AND tenant_id = $2 AND archived_at IS NULL`,
    [dest.id, tenantId],
  );
  const nextPos = Number(posRes.rows[0]?.n ?? 1);

  await client.query(
    `UPDATE chat_kanban_cards
     SET column_id = $1, position = $2, updated_by_user_id = $3, updated_at = now()
     WHERE id = $4 AND tenant_id = $5`,
    [dest.id, nextPos, actorUserId, cardId, tenantId],
  );

  let postUpdateResult: Awaited<ReturnType<typeof runKanbanDestColumnPostUpdateAutomations>> | null = null;
  try {
    postUpdateResult = await runKanbanDestColumnPostUpdateAutomations(client, {
      tenantId,
      actorUserId,
      boardId: String(card.board_id),
      boardLinkedFunnelId,
      destColumn: dest,
      cardId,
      conversationId: String(card.conversation_id),
    });
  } catch (e: unknown) {
    await client.query('ROLLBACK');
    console.warn('[proposalKanbanAcceptAutomation] post-update automations failed', { cardId, error: e });
    return false;
  }

  await cancelPendingScheduledMovesForCardColumn(
    client,
    tenantId,
    cardId,
    sourceColumnIdBefore,
    'card_left_source_column_proposal_accept',
    actorUserId,
  );

  await insertScheduledMoveIfColumnConfigured(client, {
    tenantId,
    boardId: String(card.board_id),
    cardId,
    conversationId: String(card.conversation_id),
    columnId: String(dest.id),
    columnMetadata: dest.metadata,
    actorUserId,
  });

  await client.query('COMMIT');

  if (postUpdateResult?.deferredEntryAutomations?.length) {
    void import('./chatKanbanAutomationService.js')
      .then(({ runDeferredKanbanEntryAutomationsAfterCommit }) =>
        runDeferredKanbanEntryAutomationsAfterCommit({
          tenantId,
          actorUserId,
          conversationId: String(card.conversation_id),
          reasons: postUpdateResult.deferredEntryAutomations!,
        }),
      )
      .catch((err) => console.error('[kanban-entry-automation] deferred (proposal accept)', err));
  }

  if (side.emitCtx && side.attendancePatch) {
    emitKanbanAttendanceIfNeeded(side.emitCtx.tenantId, side.emitCtx.ownerUserId, side.attendancePatch);
  }
  if (side.orgRulesApplied && !side.attendancePatch) {
    const cr = await pool.query<{ owner_tenant_id: string | null; owner_user_id: string }>(
      `SELECT owner.tenant_id AS owner_tenant_id, c.user_id AS owner_user_id
       FROM chat_conversations c
       INNER JOIN users owner ON owner.id = c.user_id
       WHERE c.id = $1 LIMIT 1`,
      [card.conversation_id],
    );
    const rr = cr.rows[0];
    if (rr) {
      emitKanbanAttendanceIfNeeded(rr.owner_tenant_id, rr.owner_user_id, { id: card.conversation_id });
    }
  }

  let phase2Ctx: KanbanPhase2AutomationContext = side.phase2Ctx;
  phase2Ctx = await enrichPhase2AfterCommit(tenantId, cardId, card.conversation_id, phase2Ctx);
  runKanbanPhase2Automations(phase2Ctx).catch((automationErr) => {
    console.error('[proposalKanbanAcceptAutomation] phase2 automations failed', {
      cardId,
      error: automationErr,
    });
  });

  try {
    await insertProposalTimelineEvent({
      proposalId,
      eventType: TIMELINE_EVENT,
      payload: {
        card_id: cardId,
        conversation_id: card.conversation_id,
        board_id: card.board_id,
        from_column_id: sourceColumnIdBefore,
        to_column_id: String(dest.id),
        acceptance_source: input.acceptanceSource,
        automation: 'move_on_proposal_accept',
      },
      actorUserId,
    });
  } catch (e) {
    console.error('[proposalKanbanAcceptAutomation] timeline insert failed', e);
  }

  try {
    emitConversationUpdatedToTenant(tenantId, { id: card.conversation_id });
  } catch (e) {
    console.warn('[proposalKanbanAcceptAutomation] websocket emit failed', e);
  }

  return true;
}

/**
 * Idempotência por (proposta, cartão): evento de timeline `proposal_kanban_moved_on_accept` com `card_id`.
 * Só corre em transição real para `accepted` (chamadores devem garantir).
 */
export async function runProposalKanbanAcceptAutomation(input: ProposalKanbanAcceptAutomationInput): Promise<void> {
  const { tenantId, proposalId, clientId, leadId } = input;
  if (!clientId && !leadId) return;

  const cardIds = await listCandidateCardIds(tenantId, clientId, leadId);
  if (cardIds.length === 0) return;

  for (const cardId of cardIds) {
    const client = await pool.connect();
    try {
      await tryMoveOneCard(client, { ...input, cardId });
    } catch (e) {
      console.error('[proposalKanbanAcceptAutomation] fatal', { proposalId, cardId, error: e });
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
    } finally {
      client.release();
    }
  }
}
