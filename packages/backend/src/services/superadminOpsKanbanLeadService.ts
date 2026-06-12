/**
 * Sincroniza acquisition_leads → Kanban operacional (tenant virtual Super Admin).
 */
import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import { beginKanbanTxWithRls } from '../utils/kanbanRlsTx.js';
import { SUPERADMIN_OPS_KANBAN_TENANT_ID } from '../config/superadminOpsKanban.js';
import { findAcquisitionLeadById } from '../acquisition/acquisitionLeadRepository.js';
import type { AcquisitionLeadRow, AcquisitionLeadStage } from '../acquisition/acquisitionTypes.js';
import { nextKanbanCardPosition } from './chatKanbanTagStore.js';
import { assertSuperadminOpsTenantExists } from './superadminOpsKanbanFoundation.js';
import {
  ACQUISITION_BOARD_NAME,
  ensureSuperadminOpsKanbanSeed,
  getAcquisitionBoardId,
} from './superadminOpsKanbanSeedService.js';
import {
  appendOperationalTimelineByCardId,
  TIMELINE_LABELS,
} from './superadminOpsLeadTimelineService.js';
import { observeOpsKanbanAcquisitionSync } from '../lifecycle/lifecycleDebugService.js';
import { moveOpsCardWithAutomations } from './moveOpsCardWithAutomations.js';
import {
  acquireOpsLeadCardTransactionLock,
  healDuplicateActiveOpsCardsForLead,
  logOpsSingleCard,
  withOpsLeadCardSessionLock,
} from './opsSingleActiveCardService.js';

export { ACQUISITION_BOARD_NAME };

const STAGE_TO_COLUMN: Partial<Record<AcquisitionLeadStage, string>> = {
  pre_signup: 'Novo lead',
  contact_captured: 'Novo lead',
  plan_selected: 'Qualificado',
  checkout_started: 'Checkout',
  checkout_abandoned: 'Checkout abandonado',
  activation_prepared: 'Onboarding incompleto',
  onboarding_in_progress: 'Onboarding incompleto',
  trial_started: 'Trial iniciado',
  onboarding_kickoff: 'Onboarding incompleto',
  onboarding_active: 'Onboarding incompleto',
  converted: 'Ativado',
};

const SIGNUP_STEP_TO_COLUMN: Record<string, string> = {
  contact: 'Novo lead',
  plan: 'Qualificado',
  checkout: 'Checkout',
};

let acquisitionLeadColumnPromise: Promise<boolean> | null = null;

export async function hasKanbanAcquisitionLeadColumn(): Promise<boolean> {
  if (!acquisitionLeadColumnPromise) {
    acquisitionLeadColumnPromise = (async () => {
      const r = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'chat_kanban_cards' AND column_name = 'acquisition_lead_id'`,
      );
      return (r.rows[0]?.c ?? '0') === '1';
    })();
  }
  return acquisitionLeadColumnPromise;
}

function buildLeadCardMetadata(lead: AcquisitionLeadRow): Record<string, unknown> {
  const tags = ['acquisition'];
  if (lead.source?.trim()) tags.push(`source:${lead.source.trim()}`);
  const opTags = lead.metadata_json.operational_tags;
  if (Array.isArray(opTags)) {
    for (const t of opTags) {
      if (typeof t === 'string' && t.trim()) tags.push(t.trim());
    }
  }
  if (lead.metadata_json.resumed === true) tags.push('retomado');
  if (lead.metadata_json.extra_trial_consumed_at) tags.push('trial_2x');
  return {
    entity_type: 'acquisition_lead',
    acquisition_lead_id: lead.id,
    display: {
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
    },
    activation_score: lead.activation_score,
    activation_state: lead.current_stage,
    current_stage: lead.current_stage,
    lead_created_at: lead.created_at,
    operational_tags: opTags,
    tags,
  };
}

async function findColumnIdByName(
  client: PoolClient,
  boardId: string,
  columnName: string,
): Promise<string | null> {
  const r = await client.query<{ id: string }>(
    `SELECT id::text FROM chat_kanban_columns
     WHERE board_id = $1 AND tenant_id = $2 AND lower(trim(name)) = lower(trim($3))
     LIMIT 1`,
    [boardId, SUPERADMIN_OPS_KANBAN_TENANT_ID, columnName],
  );
  return r.rows[0]?.id ?? null;
}

async function findColumnNameById(
  client: PoolClient,
  columnId: string,
): Promise<string | null> {
  const r = await client.query<{ name: string }>(
    `SELECT name FROM chat_kanban_columns WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [columnId, SUPERADMIN_OPS_KANBAN_TENANT_ID],
  );
  return r.rows[0]?.name ?? null;
}

export function resolveOpsColumnForLead(
  lead: AcquisitionLeadRow,
  opts?: { signupStep?: string },
): string {
  if (opts?.signupStep && SIGNUP_STEP_TO_COLUMN[opts.signupStep]) {
    return SIGNUP_STEP_TO_COLUMN[opts.signupStep]!;
  }
  return STAGE_TO_COLUMN[lead.current_stage] ?? 'Novo lead';
}

export type SyncOpsLeadResult = {
  ok: boolean;
  cardId?: string;
  boardId?: string;
  columnId?: string;
  created?: boolean;
  moved?: boolean;
  reason?: string;
};

async function resolveActorUserId(actorUserId?: string): Promise<string | null> {
  const trimmed = actorUserId?.trim() || process.env.SUPERADMIN_OPS_KANBAN_SYSTEM_USER_ID || '';
  if (trimmed) return trimmed;
  const su = await pool.query<{ id: string }>(
    `SELECT id::text FROM users WHERE is_super_admin = true ORDER BY created_at ASC LIMIT 1`,
  );
  return su.rows[0]?.id ?? null;
}

/**
 * Cria ou move cartão operacional no board Aquisição.
 */
export async function syncAcquisitionLeadToOpsKanban(input: {
  acquisitionLeadId: string;
  correlationId: string;
  signupStep?: string;
  columnNameOverride?: string;
  actorUserId?: string;
  timelineType?: string;
}): Promise<SyncOpsLeadResult> {
  if (!(await hasKanbanAcquisitionLeadColumn())) {
    console.warn('[opsKanban] syncAcquisitionLead skipped', {
      acquisition_lead_id: input.acquisitionLeadId,
      reason: 'migration_260_required',
    });
    return { ok: false, reason: 'migration_260_required' };
  }

  const lead = await findAcquisitionLeadById(input.acquisitionLeadId);
  if (!lead) {
    console.warn('[opsKanban] syncAcquisitionLead skipped', {
      acquisition_lead_id: input.acquisitionLeadId,
      reason: 'lead_not_found',
    });
    return { ok: false, reason: 'lead_not_found' };
  }

  const actor = await resolveActorUserId(input.actorUserId);
  if (!actor) {
    console.warn('[opsKanban] syncAcquisitionLead skipped', {
      acquisition_lead_id: input.acquisitionLeadId,
      reason: 'no_superadmin_actor',
    });
    return { ok: false, reason: 'no_superadmin_actor' };
  }

  const tenantCheck = await assertSuperadminOpsTenantExists();
  if (!tenantCheck.ok) {
    console.error('[opsKanban] syncAcquisitionLead ops_tenant_missing', {
      acquisition_lead_id: input.acquisitionLeadId,
    });
    return { ok: false, reason: 'ops_tenant_missing' };
  }

  const seed = await ensureSuperadminOpsKanbanSeed(actor, { backfillLeads: false });
  if (!seed.ok) {
    console.error('[opsKanban] syncAcquisitionLead seed_failed', {
      acquisition_lead_id: input.acquisitionLeadId,
      reason: seed.reason,
    });
    return { ok: false, reason: seed.reason ?? 'seed_failed' };
  }

  const columnName =
    input.columnNameOverride?.trim() ||
    resolveOpsColumnForLead(lead, { signupStep: input.signupStep });

  const boardId = await getAcquisitionBoardId();
  if (!boardId) {
    console.warn('[opsKanban] syncAcquisitionLead skipped', {
      acquisition_lead_id: input.acquisitionLeadId,
      reason: 'acquisition_board_missing',
    });
    return { ok: false, reason: 'acquisition_board_missing' };
  }

  const columnLookupClient = await pool.connect();
  let columnId: string | null;
  try {
    columnId = await findColumnIdByName(columnLookupClient, boardId, columnName);
  } finally {
    columnLookupClient.release();
  }
  if (!columnId) {
    console.warn('[opsKanban] syncAcquisitionLead skipped', {
      acquisition_lead_id: input.acquisitionLeadId,
      reason: `column_not_found:${columnName}`,
      board_id: boardId,
    });
    return { ok: false, reason: `column_not_found:${columnName}` };
  }

  const meta = buildLeadCardMetadata(lead);

  return withOpsLeadCardSessionLock(lead.id, async () => {
    await healDuplicateActiveOpsCardsForLead({
      acquisitionLeadId: lead.id,
      actorUserId: actor,
      correlationId: input.correlationId,
    });

    const existingCard = await findOpsKanbanCardForLead(lead.id);
    const timelineType = input.timelineType ?? (existingCard ? 'kanban_moved' : 'kanban_card_created');

    if (existingCard) {
      logOpsSingleCard({
        action: 'global_card_reused',
        acquisitionLeadId: lead.id,
        winnerCardId: existingCard.cardId,
        correlationId: input.correlationId,
        detail: `target_board=${boardId}`,
      });

      const moveResult = await moveOpsCardWithAutomations({
        tenantId: SUPERADMIN_OPS_KANBAN_TENANT_ID,
        actorUserId: actor,
        cardId: existingCard.cardId,
        sourceBoardId: existingCard.boardId,
        sourceColumnId: existingCard.columnId,
        destinationBoardId: boardId,
        destinationColumnId: columnId,
        source: 'syncAcquisitionLeadToOpsKanban',
        correlationId: input.correlationId,
        metadataPatch: meta,
      });

      const moved =
        moveResult.status === 'moved' &&
        (existingCard.columnId !== columnId || existingCard.boardId !== boardId);

      observeOpsKanbanAcquisitionSync({
        acquisitionLeadId: lead.id,
        tenantId: lead.tenant_id,
        correlationId: input.correlationId,
        currentStage: lead.current_stage,
        signupStep: input.signupStep,
        columnName,
        cardCreated: false,
      });

      if (
        moveResult.status === 'card_not_found' ||
        moveResult.status === 'board_not_found' ||
        moveResult.status === 'column_not_found'
      ) {
        return { ok: false, reason: moveResult.status };
      }

      return {
        ok: true,
        cardId: moveResult.cardId ?? existingCard.cardId,
        boardId,
        columnId,
        created: false,
        moved: moved || moveResult.status === 'moved',
      };
    }

    const client = await pool.connect();
    try {
      await beginKanbanTxWithRls(client, SUPERADMIN_OPS_KANBAN_TENANT_ID, actor);
      await acquireOpsLeadCardTransactionLock(client, lead.id);

      const recheck = await findOpsKanbanCardForLead(lead.id);
      if (recheck) {
        await client.query('ROLLBACK');
        logOpsSingleCard({
          action: 'race_prevented',
          acquisitionLeadId: lead.id,
          winnerCardId: recheck.cardId,
          correlationId: input.correlationId,
          detail: 'insert_aborted_card_found_under_lock',
        });
        const moveResult = await moveOpsCardWithAutomations({
          tenantId: SUPERADMIN_OPS_KANBAN_TENANT_ID,
          actorUserId: actor,
          cardId: recheck.cardId,
          sourceBoardId: recheck.boardId,
          sourceColumnId: recheck.columnId,
          destinationBoardId: boardId,
          destinationColumnId: columnId,
          source: 'syncAcquisitionLeadToOpsKanban',
          correlationId: input.correlationId,
          metadataPatch: meta,
        });
        return {
          ok: moveResult.status !== 'card_not_found',
          cardId: recheck.cardId,
          boardId,
          columnId,
          created: false,
          moved: moveResult.status === 'moved',
        };
      }

      const position = await nextKanbanCardPosition(client, columnId);
      const ins = await client.query<{ id: string }>(
        `INSERT INTO chat_kanban_cards (
           board_id, column_id, tenant_id, conversation_id, acquisition_lead_id,
           position, metadata, created_by_user_id
         ) VALUES ($1, $2, $3, NULL, $4, $5, $6::jsonb, $7)
         RETURNING id::text`,
        [boardId, columnId, SUPERADMIN_OPS_KANBAN_TENANT_ID, lead.id, position, JSON.stringify(meta), actor],
      );
      const cardId = ins.rows[0]?.id;
      if (cardId) {
        await appendOperationalTimelineByCardId(client, cardId, {
          type: 'lead_created',
          label: TIMELINE_LABELS.lead_created,
          correlation_id: input.correlationId,
        });
        await appendOperationalTimelineByCardId(client, cardId, {
          type: timelineType,
          label: TIMELINE_LABELS.kanban_card_created,
          column: columnName,
          current_stage: lead.current_stage,
          correlation_id: input.correlationId,
        });
      }

      await client.query('COMMIT');
      console.info('[opsKanban] syncAcquisitionLead ok', {
        acquisition_lead_id: lead.id,
        card_id: cardId,
        board_id: boardId,
        column_id: columnId,
        column_name: columnName,
        created: true,
        correlation_id: input.correlationId,
      });
      observeOpsKanbanAcquisitionSync({
        acquisitionLeadId: lead.id,
        tenantId: lead.tenant_id,
        correlationId: input.correlationId,
        currentStage: lead.current_stage,
        signupStep: input.signupStep,
        columnName,
        cardCreated: true,
      });
      return {
        ok: true,
        cardId,
        boardId,
        columnId,
        created: true,
        moved: false,
      };
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      const pgCode =
        typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: string }).code) : '';
      if (pgCode === '23505') {
        await healDuplicateActiveOpsCardsForLead({
          acquisitionLeadId: lead.id,
          actorUserId: actor,
          correlationId: input.correlationId,
        });
        const racedCard = await findOpsKanbanCardForLead(input.acquisitionLeadId);
        if (racedCard && columnId) {
          logOpsSingleCard({
            action: 'race_prevented',
            acquisitionLeadId: lead.id,
            winnerCardId: racedCard.cardId,
            correlationId: input.correlationId,
            detail: 'unique_violation_reused_winner',
          });
          const moveResult = await moveOpsCardWithAutomations({
            tenantId: SUPERADMIN_OPS_KANBAN_TENANT_ID,
            actorUserId: actor,
            cardId: racedCard.cardId,
            sourceBoardId: racedCard.boardId,
            sourceColumnId: racedCard.columnId,
            destinationBoardId: boardId,
            destinationColumnId: columnId,
            source: 'syncAcquisitionLeadToOpsKanban',
            correlationId: input.correlationId,
            metadataPatch: meta,
          });
          console.info('[opsKanban] syncAcquisitionLead idempotent', {
            acquisition_lead_id: input.acquisitionLeadId,
            card_id: racedCard.cardId,
            reason: 'concurrent_create',
            moveStatus: moveResult.status,
          });
          return {
            ok: moveResult.status !== 'card_not_found',
            cardId: racedCard.cardId,
            boardId,
            columnId,
            created: false,
            moved: moveResult.status === 'moved',
          };
        }
      }
      console.error('[opsKanban] syncAcquisitionLead failed', e);
      return { ok: false, reason: e instanceof Error ? e.message : 'sync_failed' };
    } finally {
      client.release();
    }
  });
}

export async function findOpsKanbanCardForLeadOnBoard(
  acquisitionLeadId: string,
  boardId: string,
): Promise<{
  cardId: string;
  boardId: string;
  columnId: string;
  columnName: string;
} | null> {
  if (!(await hasKanbanAcquisitionLeadColumn())) return null;
  const r = await pool.query<{
    card_id: string;
    board_id: string;
    column_id: string;
    column_name: string;
  }>(
    `SELECT kc.id::text AS card_id,
            kc.board_id::text AS board_id,
            kc.column_id::text AS column_id,
            col.name AS column_name
     FROM chat_kanban_cards kc
     INNER JOIN chat_kanban_columns col ON col.id = kc.column_id
     WHERE kc.tenant_id = $1
       AND kc.board_id = $2
       AND kc.acquisition_lead_id = $3
       AND kc.archived_at IS NULL
     LIMIT 1`,
    [SUPERADMIN_OPS_KANBAN_TENANT_ID, boardId, acquisitionLeadId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    cardId: row.card_id,
    boardId: row.board_id,
    columnId: row.column_id,
    columnName: row.column_name,
  };
}

export async function findOpsKanbanCardForLead(acquisitionLeadId: string): Promise<{
  cardId: string;
  boardId: string;
  columnId: string;
  columnName: string;
} | null> {
  if (!(await hasKanbanAcquisitionLeadColumn())) return null;
  const r = await pool.query<{
    card_id: string;
    board_id: string;
    column_id: string;
    column_name: string;
  }>(
    `SELECT kc.id::text AS card_id,
            kc.board_id::text AS board_id,
            kc.column_id::text AS column_id,
            col.name AS column_name
     FROM chat_kanban_cards kc
     INNER JOIN chat_kanban_columns col ON col.id = kc.column_id
     WHERE kc.tenant_id = $1 AND kc.acquisition_lead_id = $2 AND kc.archived_at IS NULL
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
    columnName: row.column_name,
  };
}
