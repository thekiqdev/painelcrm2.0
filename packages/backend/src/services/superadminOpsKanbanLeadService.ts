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

  const client = await pool.connect();
  try {
    await beginKanbanTxWithRls(client, SUPERADMIN_OPS_KANBAN_TENANT_ID, actor);

    const columnId = await findColumnIdByName(client, boardId, columnName);
    if (!columnId) {
      await client.query('ROLLBACK');
      console.warn('[opsKanban] syncAcquisitionLead skipped', {
        acquisition_lead_id: input.acquisitionLeadId,
        reason: `column_not_found:${columnName}`,
        board_id: boardId,
      });
      return { ok: false, reason: `column_not_found:${columnName}` };
    }

    const existing = await client.query<{ id: string; column_id: string }>(
      `SELECT id::text, column_id::text FROM chat_kanban_cards
       WHERE tenant_id = $1 AND board_id = $2 AND acquisition_lead_id = $3 AND archived_at IS NULL
       LIMIT 1`,
      [SUPERADMIN_OPS_KANBAN_TENANT_ID, boardId, lead.id],
    );

    const meta = buildLeadCardMetadata(lead);
    const timelineType = input.timelineType ?? (existing.rows[0] ? 'kanban_moved' : 'kanban_card_created');

    if (existing.rows[0]) {
      const cardId = existing.rows[0].id;
      const prevColumnId = existing.rows[0].column_id;
      const moved = prevColumnId !== columnId;

      await client.query(
        `UPDATE chat_kanban_cards
         SET column_id = $1,
             metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
             updated_at = now()
         WHERE id = $3 AND tenant_id = $4`,
        [columnId, JSON.stringify(meta), cardId, SUPERADMIN_OPS_KANBAN_TENANT_ID],
      );

      if (moved) {
        const fromName = (await findColumnNameById(client, prevColumnId)) ?? prevColumnId;
        const toName = columnName;
        await appendOperationalTimelineByCardId(client, cardId, {
          type: timelineType,
          label: TIMELINE_LABELS.kanban_moved ?? 'Movido no Kanban',
          from_column: fromName,
          to_column: toName,
          current_stage: lead.current_stage,
          correlation_id: input.correlationId,
        });
      }

      await client.query('COMMIT');
      observeOpsKanbanAcquisitionSync({
        acquisitionLeadId: lead.id,
        tenantId: lead.tenant_id,
        correlationId: input.correlationId,
        currentStage: lead.current_stage,
        signupStep: input.signupStep,
        columnName,
        cardCreated: false,
      });
      return { ok: true, cardId, boardId, columnId, created: false, moved };
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
    const pgCode = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: string }).code) : '';
    if (pgCode === '23505') {
      const existingCard = await findOpsKanbanCardForLead(input.acquisitionLeadId);
      if (existingCard) {
        console.info('[opsKanban] syncAcquisitionLead idempotent', {
          acquisition_lead_id: input.acquisitionLeadId,
          card_id: existingCard.cardId,
          reason: 'concurrent_create',
        });
        return {
          ok: true,
          cardId: existingCard.cardId,
          columnId: existingCard.columnId,
          created: false,
          moved: false,
        };
      }
    }
    console.error('[opsKanban] syncAcquisitionLead failed', e);
    return { ok: false, reason: e instanceof Error ? e.message : 'sync_failed' };
  } finally {
    client.release();
  }
}

export async function findOpsKanbanCardForLead(acquisitionLeadId: string): Promise<{
  cardId: string;
  columnId: string;
  columnName: string;
} | null> {
  if (!(await hasKanbanAcquisitionLeadColumn())) return null;
  const r = await pool.query<{ card_id: string; column_id: string; column_name: string }>(
    `SELECT kc.id::text AS card_id, kc.column_id::text AS column_id, col.name AS column_name
     FROM chat_kanban_cards kc
     INNER JOIN chat_kanban_columns col ON col.id = kc.column_id
     WHERE kc.tenant_id = $1 AND kc.acquisition_lead_id = $2 AND kc.archived_at IS NULL
     LIMIT 1`,
    [SUPERADMIN_OPS_KANBAN_TENANT_ID, acquisitionLeadId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return { cardId: row.card_id, columnId: row.column_id, columnName: row.column_name };
}
