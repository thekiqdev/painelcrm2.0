/**
 * Seed idempotente dos Kanbans operacionais do Super Admin (tenant virtual).
 * Garante boards + colunas padrão no primeiro acesso — ambiente nunca “vazio”.
 */
import type { PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { pool } from '../utils/db.js';
import { beginKanbanTxWithRls } from '../utils/kanbanRlsTx.js';
import { SUPERADMIN_OPS_KANBAN_TENANT_ID } from '../config/superadminOpsKanban.js';
import { acquisitionLeadsTableExists } from '../acquisition/acquisitionLeadRepository.js';
import { syncAcquisitionLeadToOpsKanban } from './superadminOpsKanbanLeadService.js';
import {
  acquireOpsKanbanSeedAdvisoryLock,
  assertSuperadminOpsTenantExists,
  findCanonicalOpsBoardIdByName,
  findCanonicalOpsBoardIdByNameFromPool,
  runSerializedOpsKanbanSeed,
} from './superadminOpsKanbanFoundation.js';

export type OpsKanbanColumnSeed = { name: string; color: string | null };

export type OpsKanbanBoardSeed = {
  name: string;
  description: string;
  sort_order: number;
  columns: OpsKanbanColumnSeed[];
};

/** Boards operacionais padrão da central Super Admin. */
export const SUPERADMIN_OPS_KANBAN_BOARD_SEEDS: OpsKanbanBoardSeed[] = [
  {
    name: 'Aquisição',
    description: 'Pipeline de aquisição — leads, cadastro, checkout e trial',
    sort_order: 10,
    columns: [
      { name: 'Novo lead', color: '#64748b' },
      { name: 'Qualificado', color: '#38bdf8' },
      { name: 'Iniciou cadastro', color: '#a78bfa' },
      { name: 'Checkout', color: '#818cf8' },
      { name: 'Checkout abandonado', color: '#fbbf24' },
      { name: 'Trial iniciado', color: '#34d399' },
      { name: 'Onboarding incompleto', color: '#fb7185' },
      { name: 'Ativado', color: '#22c55e' },
      { name: 'Perdido', color: '#94a3b8' },
    ],
  },
  {
    name: 'Recovery',
    description: 'Recuperação de checkout abandonado e reengajamento',
    sort_order: 20,
    columns: [
      { name: 'Novo caso', color: '#64748b' },
      { name: 'Contato tentado', color: '#38bdf8' },
      { name: 'Em recuperação', color: '#fbbf24' },
      { name: 'Reengajado', color: '#34d399' },
      { name: 'Perdido', color: '#94a3b8' },
    ],
  },
  {
    name: 'Onboarding',
    description: 'Ativação pós-conversão — kickoff e primeiros passos',
    sort_order: 30,
    columns: [
      { name: 'Aguardando kickoff', color: '#64748b' },
      { name: 'Em progresso', color: '#38bdf8' },
      { name: 'Incompleto', color: '#fb7185' },
      { name: 'Ativado', color: '#22c55e' },
    ],
  },
  {
    name: 'Expansão',
    description: 'Upsell e expansão de contas ativas',
    sort_order: 40,
    columns: [
      { name: 'Oportunidade', color: '#64748b' },
      { name: 'Negociação', color: '#a78bfa' },
      { name: 'Expandido', color: '#22c55e' },
    ],
  },
  {
    name: 'Reativação',
    description: 'Contas inativas e campanhas de retorno',
    sort_order: 50,
    columns: [
      { name: 'Inativo detectado', color: '#64748b' },
      { name: 'Campanha enviada', color: '#38bdf8' },
      { name: 'Reativado', color: '#22c55e' },
    ],
  },
  {
    name: 'Engajamento Trial',
    description: 'Engajamento durante o período de teste — progressão temporal (Sprint N2)',
    sort_order: 55,
    columns: [
      { name: 'Trial iniciado', color: '#34d399' },
      { name: 'Dia 2', color: '#38bdf8' },
      { name: 'Dia 4', color: '#a78bfa' },
      { name: 'Dia 6', color: '#fbbf24' },
      { name: 'Trial finalizando', color: '#fb7185' },
    ],
  },
];

export const ACQUISITION_BOARD_NAME = 'Aquisição';

export type EnsureOpsKanbanSeedResult = {
  ok: boolean;
  boardsCreated: number;
  columnsAdded: number;
  boards: Array<{ name: string; id: string }>;
  leadsSynced?: number;
  reason?: string;
};

async function ensureBoardForSeed(
  client: PoolClient,
  seed: OpsKanbanBoardSeed,
  actorUserId: string,
): Promise<{ boardId: string; created: boolean }> {
  let boardId = await findCanonicalOpsBoardIdByName(client, seed.name);
  if (boardId) return { boardId, created: false };

  const newId = randomUUID();
  try {
    await client.query(
      `INSERT INTO chat_kanban_boards (
         id, tenant_id, name, description, sort_order, archived_at,
         created_by_user_id, visibility_mode, is_active, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, NULL, $6, 'restricted', true, now(), now())`,
      [
        newId,
        SUPERADMIN_OPS_KANBAN_TENANT_ID,
        seed.name,
        seed.description,
        seed.sort_order,
        actorUserId,
      ],
    );
    return { boardId: newId, created: true };
  } catch (e) {
    const pgCode = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: string }).code) : '';
    if (pgCode === '23505') {
      boardId = await findCanonicalOpsBoardIdByName(client, seed.name);
      if (boardId) return { boardId, created: false };
    }
    throw e;
  }
}

async function ensureColumnsForBoard(
  client: PoolClient,
  boardId: string,
  columns: OpsKanbanColumnSeed[],
): Promise<number> {
  let added = 0;
  const defaultColumnMetadata = {
    automation_config: {
      enabled: false,
      sources: {
        new_conversations: false,
        leads: false,
        clients: false,
        tags: [],
      },
    },
    kanban_phase2: { version: 1 },
  };
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]!;
    const exists = await client.query<{ id: string }>(
      `SELECT id::text FROM chat_kanban_columns
       WHERE board_id = $1 AND tenant_id = $2 AND lower(btrim(name)) = lower(btrim($3))
       LIMIT 1`,
      [boardId, SUPERADMIN_OPS_KANBAN_TENANT_ID, col.name],
    );
    if (exists.rows.length > 0) continue;

    const maxPos = await client.query<{ p: number }>(
      `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM chat_kanban_columns WHERE board_id = $1`,
      [boardId],
    );
    const position = maxPos.rows[0]?.p ?? i;

    await client.query(
      `INSERT INTO chat_kanban_columns (
         id, tenant_id, board_id, name, color, position, metadata, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now(), now())`,
      [
        randomUUID(),
        SUPERADMIN_OPS_KANBAN_TENANT_ID,
        boardId,
        col.name,
        col.color,
        position,
        JSON.stringify(defaultColumnMetadata),
      ],
    );
    added += 1;
  }
  return added;
}

async function ensureSuperadminOpsKanbanSeedInner(
  actorUserId: string,
  opts?: { backfillLeads?: boolean; backfillLimit?: number; recoverLeads?: boolean; recoverLimit?: number },
): Promise<EnsureOpsKanbanSeedResult> {
  const tenantCheck = await assertSuperadminOpsTenantExists();
  if (!tenantCheck.ok) {
    return {
      ok: false,
      boardsCreated: 0,
      columnsAdded: 0,
      boards: [],
      reason: 'ops_tenant_missing',
    };
  }

  const boards: Array<{ name: string; id: string }> = [];
  let boardsCreated = 0;
  let columnsAdded = 0;

  const client = await pool.connect();
  try {
    await beginKanbanTxWithRls(client, SUPERADMIN_OPS_KANBAN_TENANT_ID, actorUserId);
    await acquireOpsKanbanSeedAdvisoryLock(client);

    for (const seed of SUPERADMIN_OPS_KANBAN_BOARD_SEEDS) {
      const { boardId, created } = await ensureBoardForSeed(client, seed, actorUserId);
      if (created) boardsCreated += 1;
      columnsAdded += await ensureColumnsForBoard(client, boardId, seed.columns);
      boards.push({ name: seed.name, id: boardId });
    }

    await client.query('COMMIT');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('[opsKanban] ensureSeed failed', e);
    return {
      ok: false,
      boardsCreated: 0,
      columnsAdded: 0,
      boards: [],
      reason: e instanceof Error ? e.message : 'seed_failed',
    };
  } finally {
    client.release();
  }

  let leadsSynced = 0;
  const shouldRecover = opts?.recoverLeads === true || opts?.backfillLeads !== false;
  if (shouldRecover) {
    leadsSynced = await recoverAcquisitionLeadsWithoutOpsCard(actorUserId, {
      limit: opts?.recoverLimit ?? opts?.backfillLimit ?? 150,
    });
  }

  return { ok: true, boardsCreated, columnsAdded, boards, leadsSynced };
}

/**
 * Cria boards/colunas padrão que ainda não existem (idempotente, serializado).
 */
export async function ensureSuperadminOpsKanbanSeed(
  actorUserId: string,
  opts?: { backfillLeads?: boolean; backfillLimit?: number; recoverLeads?: boolean; recoverLimit?: number },
): Promise<EnsureOpsKanbanSeedResult> {
  return runSerializedOpsKanbanSeed(() => ensureSuperadminOpsKanbanSeedInner(actorUserId, opts));
}

/**
 * Recupera leads sem cartão no Kanban Ops (idempotente — sync não duplica).
 */
export async function recoverAcquisitionLeadsWithoutOpsCard(
  actorUserId: string,
  opts?: { limit?: number },
): Promise<number> {
  if (!(await acquisitionLeadsTableExists())) return 0;

  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 2000);

  const r = await pool.query<{ id: string; correlation_id: string }>(
    `SELECT al.id::text, al.correlation_id::text
     FROM acquisition_leads al
     WHERE NOT EXISTS (
         SELECT 1 FROM chat_kanban_cards kc
         WHERE kc.acquisition_lead_id = al.id
           AND kc.tenant_id = $1::uuid
           AND kc.archived_at IS NULL
       )
     ORDER BY al.created_at DESC
     LIMIT $2`,
    [SUPERADMIN_OPS_KANBAN_TENANT_ID, limit],
  );

  let synced = 0;
  for (const row of r.rows) {
    const result = await syncAcquisitionLeadToOpsKanban({
      acquisitionLeadId: row.id,
      correlationId: row.correlation_id || `recover:${row.id}`,
      actorUserId,
    });
    if (result.ok) synced += 1;
  }
  return synced;
}

/** @deprecated Use recoverAcquisitionLeadsWithoutOpsCard */
export async function backfillAcquisitionLeadsToOpsKanban(
  actorUserId: string,
  limit = 150,
): Promise<number> {
  return recoverAcquisitionLeadsWithoutOpsCard(actorUserId, { limit });
}

export async function getAcquisitionBoardId(): Promise<string | null> {
  return findCanonicalOpsBoardIdByNameFromPool(ACQUISITION_BOARD_NAME);
}

