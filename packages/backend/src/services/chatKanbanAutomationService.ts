/**
 * Automação Kanban: entrada na coluna por tag, conversa nova, vínculo lead ou cliente.
 * Não move cartão existente; não duplica (UNIQUE board_id + conversation_id).
 */
import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import { beginKanbanTxWithRls } from '../utils/kanbanRlsTx.js';
import { runKanbanAutoCreateProposalInTransaction } from './kanbanColumnAutoProposalService.js';
import { insertScheduledMoveIfColumnConfigured } from './kanbanScheduledMoveService.js';
import { userCanViewKanbanBoard, type KanbanBoardAccessRow } from './kanbanBoardAccessService.js';
import { nextKanbanCardPosition } from './chatKanbanTagStore.js';

const TAG_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function loadBoardAccessRow(client: PoolClient, tenantId: string, boardId: string): Promise<KanbanBoardAccessRow | null> {
  const r = await client.query<KanbanBoardAccessRow>(
    `SELECT id::text, tenant_id::text, created_by_user_id::text,
            COALESCE(is_active, true) AS is_active,
            COALESCE(visibility_mode::text, 'tenant_all') AS visibility_mode
     FROM chat_kanban_boards
     WHERE id = $1 AND tenant_id = $2
     LIMIT 1`,
    [boardId, tenantId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    created_by_user_id: String(row.created_by_user_id),
    is_active: row.is_active !== false,
    visibility_mode: String(row.visibility_mode || 'tenant_all'),
  };
}

async function createKanbanCardIfAbsentInColumn(
  client: PoolClient,
  params: {
    tenantId: string;
    actorUserId: string;
    boardId: string;
    columnId: string;
    conversationId: string;
    columnMetadata: unknown;
  },
): Promise<'created' | 'skipped_existing' | 'skipped_error'> {
  const ex = await client.query(
    `SELECT id FROM chat_kanban_cards
     WHERE tenant_id = $1 AND board_id = $2 AND conversation_id = $3 AND archived_at IS NULL
     LIMIT 1`,
    [params.tenantId, params.boardId, params.conversationId],
  );
  if (ex.rows.length > 0) return 'skipped_existing';

  const position = await nextKanbanCardPosition(client, params.columnId);
  let createdId: string;
  try {
    const ins = await client.query<{ id: string }>(
      `INSERT INTO chat_kanban_cards (
        board_id, column_id, tenant_id, conversation_id, position, metadata, created_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, $6)
      RETURNING id::text`,
      [params.boardId, params.columnId, params.tenantId, params.conversationId, position, params.actorUserId],
    );
    createdId = ins.rows[0]!.id;
  } catch (e: unknown) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
    if (code === '23505') return 'skipped_existing';
    console.error('[kanban-entry-automation] insert card failed', {
      boardId: params.boardId,
      columnId: params.columnId,
      conversationId: params.conversationId,
      error: e,
    });
    return 'skipped_error';
  }

  await runKanbanAutoCreateProposalInTransaction(client, {
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    cardId: createdId,
    conversationId: params.conversationId,
    destColumnId: params.columnId,
    destColumnMetadata: params.columnMetadata,
    boardId: params.boardId,
  });

  await insertScheduledMoveIfColumnConfigured(client, {
    tenantId: params.tenantId,
    boardId: params.boardId,
    cardId: createdId,
    conversationId: params.conversationId,
    columnId: params.columnId,
    columnMetadata: params.columnMetadata,
    actorUserId: params.actorUserId,
  });

  return 'created';
}

export type KanbanColumnEntryAutomationReason =
  | 'new_conversation'
  | 'lead_linked'
  | 'client_linked'
  | 'tag_added';

export type ApplyKanbanAutomationInput = {
  tenantId: string;
  actorUserId: string;
  conversationId: string;
  reason: KanbanColumnEntryAutomationReason;
  /** Obrigatório quando `reason === 'tag_added'`. */
  tagId?: string;
};

function buildMatchingColumnsQuery(
  tenantId: string,
  reason: KanbanColumnEntryAutomationReason,
  tagId: string | undefined,
): { text: string; values: unknown[] } {
  const enabled = `(metadata->'automation_config'->>'enabled') = 'true'`;
  const base = `SELECT id::text AS column_id, board_id::text AS board_id, metadata, name
     FROM chat_kanban_columns
     WHERE tenant_id = $1 AND ${enabled}`;
  if (reason === 'tag_added') {
    if (!tagId || !TAG_UUID_RE.test(tagId)) {
      return {
        text: `${base} AND false`,
        values: [tenantId],
      };
    }
    return {
      text: `${base}
       AND jsonb_typeof(COALESCE(metadata->'automation_config'->'sources'->'tags', '[]'::jsonb)) = 'array'
       AND COALESCE(metadata->'automation_config'->'sources'->'tags', '[]'::jsonb) @> to_jsonb($2::text)`,
      values: [tenantId, tagId],
    };
  }
  if (reason === 'new_conversation') {
    return {
      text: `${base} AND (metadata->'automation_config'->'sources'->>'new_conversations') = 'true'`,
      values: [tenantId],
    };
  }
  if (reason === 'lead_linked') {
    return {
      text: `${base} AND (metadata->'automation_config'->'sources'->>'leads') = 'true'`,
      values: [tenantId],
    };
  }
  return {
    text: `${base} AND (metadata->'automation_config'->'sources'->>'clients') = 'true'`,
    values: [tenantId],
  };
}

/**
 * Para cada coluna do tenant com automação ativa que corresponde a `reason`, cria cartão se a conversa
 * ainda não estiver no quadro. Não move cartões existentes.
 */
export async function applyKanbanAutomationForConversation(input: ApplyKanbanAutomationInput): Promise<{
  columnsMatched: number;
  cardsCreated: number;
}> {
  const { text, values } = buildMatchingColumnsQuery(input.tenantId, input.reason, input.tagId);
  const cols = await pool.query<{ column_id: string; board_id: string; metadata: unknown; name: string }>(text, values);

  let cardsCreated = 0;
  for (const col of cols.rows) {
    const client = await pool.connect();
    try {
      const board = await loadBoardAccessRow(client, input.tenantId, col.board_id);
      if (!board) continue;
      const canView = await userCanViewKanbanBoard(input.tenantId, input.actorUserId, board);
      if (!canView) continue;

      await beginKanbanTxWithRls(client, input.tenantId, input.actorUserId);
      const outcome = await createKanbanCardIfAbsentInColumn(client, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        boardId: col.board_id,
        columnId: col.column_id,
        conversationId: input.conversationId,
        columnMetadata: col.metadata ?? {},
      });
      await client.query('COMMIT');
      if (outcome === 'created') cardsCreated += 1;
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      console.error('[kanban-entry-automation] column batch failed', {
        columnId: col.column_id,
        boardId: col.board_id,
        conversationId: input.conversationId,
        reason: input.reason,
        tagId: input.tagId,
        error: e,
      });
    } finally {
      client.release();
    }
  }

  if (cols.rows.length > 0) {
    console.log(
      JSON.stringify({
        tag: '[kanban-entry-automation]',
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        reason: input.reason,
        tagId: input.tagId ?? null,
        columnsMatched: cols.rows.length,
        cardsCreated,
      }),
    );
  }

  return { columnsMatched: cols.rows.length, cardsCreated };
}

/** Após COMMIT de um movimento de cartão onde lead/cliente foi vinculado na mesma transação. */
export async function runDeferredKanbanEntryAutomationsAfterCommit(params: {
  tenantId: string;
  actorUserId: string;
  conversationId: string;
  reasons: Array<'lead_linked' | 'client_linked'>;
}): Promise<void> {
  const seen = new Set<string>();
  for (const reason of params.reasons) {
    if (reason !== 'lead_linked' && reason !== 'client_linked') continue;
    if (seen.has(reason)) continue;
    seen.add(reason);
    try {
      await applyKanbanAutomationForConversation({
        tenantId: params.tenantId,
        actorUserId: params.actorUserId,
        conversationId: params.conversationId,
        reason,
      });
    } catch (e) {
      console.error('[kanban-entry-automation] deferred run failed', { reason, error: e });
    }
  }
}
