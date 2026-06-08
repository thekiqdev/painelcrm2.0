/**
 * Sprint K — Trial Recovery Lifecycle (movimentação temporal no board Reativação).
 * Fonte de verdade: ops_lifecycle_transitions (data de entrada na coluna atual).
 */
import { SUPERADMIN_OPS_KANBAN_TENANT_ID } from '../config/superadminOpsKanban.js';
import { pool } from '../utils/db.js';
import { findCanonicalOpsBoardIdByNameFromPool } from '../services/superadminOpsKanbanFoundation.js';
import { hasKanbanAcquisitionLeadColumn } from '../services/superadminOpsKanbanLeadService.js';
import { promoteLifecycleCard } from './lifecyclePromotionService.js';
import type { LifecyclePromotionResult } from './lifecyclePromotionService.js';
import type { TrialRecoveryLifecycleEventType } from './lifecycleTypes.js';

export const TRIAL_RECOVERY_BOARD_NAME = 'Reativação';

export type TrialRecoveryStage = {
  columnName: string;
  waitDays: number;
  eventType: TrialRecoveryLifecycleEventType;
};

export const TRIAL_RECOVERY_STAGES: readonly TrialRecoveryStage[] = [
  { columnName: 'Trial expirado', waitDays: 1, eventType: 'trial.recovery.day1' },
  { columnName: 'Dia 1', waitDays: 2, eventType: 'trial.recovery.day3' },
  { columnName: 'Dia 3', waitDays: 4, eventType: 'trial.recovery.day7' },
  { columnName: 'Dia 7', waitDays: 7, eventType: 'trial.recovery.last_attempt' },
] as const;

export const TRIAL_RECOVERY_COLUMN_NAMES = TRIAL_RECOVERY_STAGES.map((s) => s.columnName);

const MS_PER_DAY = 86_400_000;

function normalizeColumnName(name: string): string {
  return name.trim().toLowerCase();
}

export function daysSinceTimestamp(enteredAt: Date, now: Date = new Date()): number {
  const diffMs = now.getTime() - enteredAt.getTime();
  return Math.max(0, Math.floor(diffMs / MS_PER_DAY));
}

export function resolveTrialRecoveryEventType(
  columnName: string,
  daysSinceEntry: number,
): TrialRecoveryLifecycleEventType | null {
  const normalized = normalizeColumnName(columnName);
  const stage = TRIAL_RECOVERY_STAGES.find((s) => normalizeColumnName(s.columnName) === normalized);
  if (!stage || daysSinceEntry < stage.waitDays) return null;
  return stage.eventType;
}

type RecoveryCardRow = {
  card_id: string;
  column_id: string;
  column_name: string;
  acquisition_lead_id: string | null;
  tenant_id: string | null;
};

export type TrialRecoveryPromotionAttempt = {
  cardId: string;
  columnName: string;
  eventType: TrialRecoveryLifecycleEventType;
  daysSinceEntry: number;
  result: LifecyclePromotionResult;
};

export type TrialRecoveryBatchResult = {
  status: 'ok' | 'board_not_found' | 'migration_required';
  scanned: number;
  eligible: number;
  promoted: number;
  skipped: number;
  attempts: TrialRecoveryPromotionAttempt[];
};

async function loadRecoveryCardsOnBoard(boardId: string): Promise<RecoveryCardRow[]> {
  const r = await pool.query<RecoveryCardRow>(
    `SELECT kc.id::text AS card_id,
            col.id::text AS column_id,
            col.name AS column_name,
            kc.acquisition_lead_id::text AS acquisition_lead_id,
            al.tenant_id::text AS tenant_id
     FROM chat_kanban_cards kc
     INNER JOIN chat_kanban_columns col ON col.id = kc.column_id
     INNER JOIN chat_kanban_boards b ON b.id = kc.board_id AND b.tenant_id = kc.tenant_id
     LEFT JOIN acquisition_leads al ON al.id = kc.acquisition_lead_id
     WHERE kc.tenant_id = $1::uuid
       AND kc.board_id = $2::uuid
       AND kc.archived_at IS NULL
       AND b.archived_at IS NULL
       AND lower(btrim(col.name)) = ANY($3::text[])
     ORDER BY kc.updated_at ASC`,
    [
      SUPERADMIN_OPS_KANBAN_TENANT_ID,
      boardId,
      TRIAL_RECOVERY_COLUMN_NAMES.map((n) => normalizeColumnName(n)),
    ],
  );
  return r.rows;
}

async function resolveColumnEntryAt(cardId: string, columnId: string, columnName: string): Promise<Date | null> {
  const moved = await pool.query<{ created_at: Date }>(
    `SELECT created_at
     FROM ops_lifecycle_transitions
     WHERE card_id = $1::uuid
       AND destination_column_id = $2::uuid
       AND result = 'moved'
     ORDER BY created_at DESC
     LIMIT 1`,
    [cardId, columnId],
  );
  if (moved.rows[0]?.created_at) {
    return new Date(moved.rows[0].created_at);
  }

  if (normalizeColumnName(columnName) !== normalizeColumnName('Trial expirado')) {
    return null;
  }

  const expired = await pool.query<{ created_at: Date }>(
    `SELECT created_at
     FROM ops_lifecycle_transitions
     WHERE card_id = $1::uuid
       AND event_type = 'trial.expired'
       AND result = 'moved'
     ORDER BY created_at DESC
     LIMIT 1`,
    [cardId],
  );
  return expired.rows[0]?.created_at ? new Date(expired.rows[0].created_at) : null;
}

/**
 * Avalia e promove cards elegíveis no funil de recuperação (sem automações Kanban).
 */
export async function processTrialRecoveryLifecycleBatch(
  now: Date = new Date(),
): Promise<TrialRecoveryBatchResult> {
  const empty: TrialRecoveryBatchResult = {
    status: 'ok',
    scanned: 0,
    eligible: 0,
    promoted: 0,
    skipped: 0,
    attempts: [],
  };

  if (!(await hasKanbanAcquisitionLeadColumn())) {
    return { ...empty, status: 'migration_required' };
  }

  const boardId = await findCanonicalOpsBoardIdByNameFromPool(TRIAL_RECOVERY_BOARD_NAME);
  if (!boardId) {
    return { ...empty, status: 'board_not_found' };
  }

  const cards = await loadRecoveryCardsOnBoard(boardId);
  const attempts: TrialRecoveryPromotionAttempt[] = [];
  let eligible = 0;
  let promoted = 0;
  let skipped = 0;

  for (const card of cards) {
    const enteredAt = await resolveColumnEntryAt(card.card_id, card.column_id, card.column_name);
    if (!enteredAt) {
      skipped += 1;
      continue;
    }

    const daysSinceEntry = daysSinceTimestamp(enteredAt, now);
    const eventType = resolveTrialRecoveryEventType(card.column_name, daysSinceEntry);
    if (!eventType) {
      skipped += 1;
      continue;
    }

    eligible += 1;
    const result = await promoteLifecycleCard({
      eventType,
      source: 'trial_recovery_lifecycle',
      correlationId: `trial-recovery:${card.card_id}:${eventType}`,
      context: {
        acquisitionLeadId: card.acquisition_lead_id ?? undefined,
        tenantId: card.tenant_id ?? undefined,
      },
    });

    attempts.push({
      cardId: card.card_id,
      columnName: card.column_name,
      eventType,
      daysSinceEntry,
      result,
    });

    if (result.status === 'moved') {
      promoted += 1;
    }
  }

  return {
    status: 'ok',
    scanned: cards.length,
    eligible,
    promoted,
    skipped,
    attempts,
  };
}
