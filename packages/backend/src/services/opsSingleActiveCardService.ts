/**
 * Sprint K8.2 — um único card ativo por acquisition_lead (proteção + auto-correção).
 */
import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import { SUPERADMIN_OPS_KANBAN_TENANT_ID } from '../config/superadminOpsKanban.js';
import { cancelPendingScheduledMovesForEntireCard } from './kanbanScheduledMoveService.js';

export type OpsSingleCardLogAction =
  | 'winner_selected'
  | 'duplicate_detected'
  | 'duplicate_archived'
  | 'race_prevented'
  | 'global_card_reused'
  | 'lock_acquired'
  | 'lock_released'
  | 'lock_wait_timeout';

/** Tempo máximo aguardando lock de sessão por lead (evita hang indefinido). */
export const OPS_LEAD_CARD_LOCK_WAIT_MS = 30_000;
const OPS_LEAD_CARD_LOCK_POLL_MS = 50;

export function logOpsSingleCard(payload: {
  action: OpsSingleCardLogAction;
  acquisitionLeadId: string;
  winnerCardId?: string | null;
  archivedCardIds?: string[];
  correlationId?: string | null;
  detail?: string;
}): void {
  console.info('[ops_single_card]', {
    ...payload,
    ts: new Date().toISOString(),
  });
}

export type ActiveOpsCardRow = {
  cardId: string;
  boardId: string;
  columnId: string;
  columnName: string;
  updatedAt: Date;
  createdAt: Date;
  scheduledMoveCount: number;
};

function advisoryLockKey(acquisitionLeadId: string): string {
  return `ops-lead-card:${acquisitionLeadId.trim()}`;
}

export type OpsLeadCardSessionLockOptions = {
  correlationId?: string | null;
  lockWaitMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lock de sessão por lead — serializa heal + lookup + INSERT/move entre conexões.
 * K8.3: usa pg_try_advisory_lock com timeout; não combinar com xact lock na mesma chave.
 */
export async function withOpsLeadCardSessionLock<T>(
  acquisitionLeadId: string,
  fn: () => Promise<T>,
  options?: OpsLeadCardSessionLockOptions,
): Promise<T> {
  const client = await pool.connect();
  const key = advisoryLockKey(acquisitionLeadId);
  const lockWaitMs = options?.lockWaitMs ?? OPS_LEAD_CARD_LOCK_WAIT_MS;
  const startedAt = Date.now();
  let acquired = false;
  try {
    while (Date.now() - startedAt < lockWaitMs) {
      const r = await client.query<{ ok: boolean }>(
        `SELECT pg_try_advisory_lock(hashtextextended($1::text, 0)) AS ok`,
        [key],
      );
      if (r.rows[0]?.ok) {
        acquired = true;
        logOpsSingleCard({
          action: 'lock_acquired',
          acquisitionLeadId,
          correlationId: options?.correlationId,
          detail: `wait_ms=${Date.now() - startedAt}`,
        });
        break;
      }
      await sleep(OPS_LEAD_CARD_LOCK_POLL_MS);
    }
    if (!acquired) {
      logOpsSingleCard({
        action: 'lock_wait_timeout',
        acquisitionLeadId,
        correlationId: options?.correlationId,
        detail: `timeout_ms=${lockWaitMs}`,
      });
      throw new Error(`ops_lead_card_lock_timeout:${acquisitionLeadId}`);
    }
    return await fn();
  } finally {
    if (acquired) {
      try {
        await client.query(`SELECT pg_advisory_unlock(hashtextextended($1::text, 0))`, [key]);
        logOpsSingleCard({
          action: 'lock_released',
          acquisitionLeadId,
          correlationId: options?.correlationId,
        });
      } catch {
        /* ignore */
      }
    }
    client.release();
  }
}

export async function listActiveOpsCardsForLead(
  acquisitionLeadId: string,
  client?: PoolClient,
): Promise<ActiveOpsCardRow[]> {
  const q = client ?? pool;
  const r = await q.query<{
    card_id: string;
    board_id: string;
    column_id: string;
    column_name: string;
    updated_at: Date;
    created_at: Date;
    scheduled_move_count: string;
  }>(
    `SELECT kc.id::text AS card_id,
            kc.board_id::text AS board_id,
            kc.column_id::text AS column_id,
            col.name AS column_name,
            kc.updated_at,
            kc.created_at,
            (
              SELECT COUNT(*)::text
              FROM chat_kanban_scheduled_moves sm
              WHERE sm.card_id = kc.id AND sm.status = 'scheduled'
            ) AS scheduled_move_count
     FROM chat_kanban_cards kc
     INNER JOIN chat_kanban_columns col ON col.id = kc.column_id
     WHERE kc.tenant_id = $1::uuid
       AND kc.acquisition_lead_id = $2::uuid
       AND kc.archived_at IS NULL
     ORDER BY kc.updated_at DESC`,
    [SUPERADMIN_OPS_KANBAN_TENANT_ID, acquisitionLeadId],
  );
  return r.rows.map((row) => ({
    cardId: row.card_id,
    boardId: row.board_id,
    columnId: row.column_id,
    columnName: row.column_name,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    scheduledMoveCount: Number(row.scheduled_move_count ?? 0),
  }));
}

/** Escolhe card vencedor: scheduled moves > updated_at > created_at. */
export function pickWinnerOpsCard(cards: ActiveOpsCardRow[]): ActiveOpsCardRow | null {
  if (cards.length === 0) return null;
  const sorted = [...cards].sort((a, b) => {
    if (b.scheduledMoveCount !== a.scheduledMoveCount) {
      return b.scheduledMoveCount - a.scheduledMoveCount;
    }
    const bu = b.updatedAt.getTime();
    const au = a.updatedAt.getTime();
    if (bu !== au) return bu - au;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  return sorted[0] ?? null;
}

export async function archiveDuplicateActiveOpsCards(
  input: {
    acquisitionLeadId: string;
    keepCardId: string;
    actorUserId: string;
    correlationId?: string | null;
    reason?: string;
  },
  client?: PoolClient,
): Promise<string[]> {
  const executor = client ?? pool;
  const active = await listActiveOpsCardsForLead(input.acquisitionLeadId, client);
  const losers = active.filter((c) => c.cardId !== input.keepCardId);
  if (losers.length === 0) return [];

  logOpsSingleCard({
    action: 'duplicate_detected',
    acquisitionLeadId: input.acquisitionLeadId,
    winnerCardId: input.keepCardId,
    archivedCardIds: losers.map((l) => l.cardId),
    correlationId: input.correlationId,
    detail: input.reason ?? 'duplicate_active_cards',
  });

  const archivedIds: string[] = [];
  for (const loser of losers) {
    if (client) {
      await cancelPendingScheduledMovesForEntireCard(
        client,
        SUPERADMIN_OPS_KANBAN_TENANT_ID,
        loser.cardId,
        'duplicate_card_archived',
      );
    } else {
      const cx = await pool.connect();
      try {
        await cx.query('BEGIN');
        await cancelPendingScheduledMovesForEntireCard(
          cx,
          SUPERADMIN_OPS_KANBAN_TENANT_ID,
          loser.cardId,
          'duplicate_card_archived',
        );
        await cx.query('COMMIT');
      } catch {
        try {
          await cx.query('ROLLBACK');
        } catch {
          /* ignore */
        }
      } finally {
        cx.release();
      }
    }

    await executor.query(
      `UPDATE chat_kanban_cards
       SET archived_at = now(),
           updated_at = now(),
           updated_by_user_id = $1::uuid
       WHERE id = $2::uuid
         AND tenant_id = $3::uuid
         AND archived_at IS NULL
         AND id <> $4::uuid`,
      [input.actorUserId, loser.cardId, SUPERADMIN_OPS_KANBAN_TENANT_ID, input.keepCardId],
    );
    archivedIds.push(loser.cardId);
  }

  if (archivedIds.length > 0) {
    logOpsSingleCard({
      action: 'duplicate_archived',
      acquisitionLeadId: input.acquisitionLeadId,
      winnerCardId: input.keepCardId,
      archivedCardIds: archivedIds,
      correlationId: input.correlationId,
      detail: input.reason ?? 'duplicate_active_cards',
    });
  }

  return archivedIds;
}

/**
 * Auto-correção: garante um único card ativo; retorna card vencedor (se houver).
 */
export async function healDuplicateActiveOpsCardsForLead(input: {
  acquisitionLeadId: string;
  actorUserId: string;
  correlationId?: string | null;
  preferCardId?: string | null;
}): Promise<ActiveOpsCardRow | null> {
  const active = await listActiveOpsCardsForLead(input.acquisitionLeadId);
  if (active.length === 0) return null;
  if (active.length === 1) return active[0]!;

  const preferred =
    input.preferCardId != null
      ? active.find((c) => c.cardId === input.preferCardId) ?? null
      : null;
  const winner = preferred ?? pickWinnerOpsCard(active);
  if (!winner) return null;

  logOpsSingleCard({
    action: 'winner_selected',
    acquisitionLeadId: input.acquisitionLeadId,
    winnerCardId: winner.cardId,
    correlationId: input.correlationId,
    detail: `candidates=${active.length}`,
  });

  await archiveDuplicateActiveOpsCards({
    acquisitionLeadId: input.acquisitionLeadId,
    keepCardId: winner.cardId,
    actorUserId: input.actorUserId,
    correlationId: input.correlationId,
    reason: 'self_heal_duplicate_active',
  });

  return winner;
}

/** Arquiva outros cards ativos do mesmo lead em qualquer board (move engine). */
export async function archiveConflictingLeadCardsGlobally(
  client: PoolClient,
  tenantId: string,
  acquisitionLeadId: string,
  keepCardId: string,
  actorUserId: string,
  correlationId?: string | null,
): Promise<number> {
  const archivedIds = await archiveDuplicateActiveOpsCards(
    {
      acquisitionLeadId,
      keepCardId,
      actorUserId,
      correlationId,
      reason: 'move_engine_global_dedupe',
    },
    client,
  );
  void tenantId;
  return archivedIds.length;
}
