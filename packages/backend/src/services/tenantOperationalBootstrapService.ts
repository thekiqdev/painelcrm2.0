/**
 * Sprint 1 — Bootstrap operacional para tenants novos (fluxo acquisition).
 * Idempotente: equipe padrão, kanban Atendimento, templates WhatsApp.
 * Não altera tenants existentes — invocado apenas em provisionWorkspaceFromSession.
 */
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import { beginKanbanTxWithRls } from '../utils/kanbanRlsTx.js';
import { ensureWhatsAppTemplateDefaults } from './whatsappTemplateDefaultsService.js';

export const TENANT_BOOTSTRAP_DEFAULT_TEAM_NAME = 'Equipe Principal';
export const TENANT_BOOTSTRAP_DEFAULT_TEAM_SLUG = 'equipe-principal';
export const TENANT_BOOTSTRAP_DEFAULT_BOARD_NAME = 'Atendimento';
export const TENANT_BOOTSTRAP_BOARD_DESCRIPTION =
  'Quadro padrão de atendimento criado automaticamente na ativação da conta.';

export const TENANT_BOOTSTRAP_KANBAN_COLUMNS = [
  { name: 'Novo', color: '#94a3b8', position: 0 },
  { name: 'Em atendimento', color: '#0ea5e9', position: 1 },
  { name: 'Aguardando retorno', color: '#f59e0b', position: 2 },
  { name: 'Concluído', color: '#22c55e', position: 3 },
] as const;

export type TenantOperationalBootstrapInput = {
  tenantId: string;
  adminUserId: string;
};

export type TenantOperationalBootstrapResult = {
  team: { id: string; created: boolean; memberAdded: boolean };
  kanban: { boardId: string; created: boolean; columnsEnsured: number };
  whatsappTemplates: { ensured: boolean };
};

async function findDefaultTeam(
  client: PoolClient,
  tenantId: string,
): Promise<{ id: string } | null> {
  const r = await client.query<{ id: string }>(
    `SELECT id::text FROM teams
     WHERE tenant_id = $1
       AND (slug = $2 OR lower(trim(name)) = lower(trim($3)))
     ORDER BY CASE WHEN slug = $2 THEN 0 ELSE 1 END
     LIMIT 1`,
    [tenantId, TENANT_BOOTSTRAP_DEFAULT_TEAM_SLUG, TENANT_BOOTSTRAP_DEFAULT_TEAM_NAME],
  );
  return r.rows[0] ?? null;
}

export async function ensureDefaultPrincipalTeam(
  client: PoolClient,
  tenantId: string,
  adminUserId: string,
): Promise<{ id: string; created: boolean; memberAdded: boolean }> {
  let team = await findDefaultTeam(client, tenantId);
  let created = false;

  if (!team) {
    const ins = await client.query<{ id: string }>(
      `INSERT INTO teams (tenant_id, name, slug, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, slug) DO NOTHING
       RETURNING id::text`,
      [
        tenantId,
        TENANT_BOOTSTRAP_DEFAULT_TEAM_NAME,
        TENANT_BOOTSTRAP_DEFAULT_TEAM_SLUG,
        'Equipe padrão da operação',
      ],
    );
    if (ins.rows[0]) {
      team = { id: ins.rows[0].id };
      created = true;
    } else {
      team = await findDefaultTeam(client, tenantId);
      if (!team) {
        throw new Error('tenant_bootstrap_default_team_unavailable');
      }
    }
  }

  const memberIns = await client.query(
    `INSERT INTO team_members (team_id, user_id, role)
     VALUES ($1, $2, 'lead')
     ON CONFLICT (team_id, user_id) DO NOTHING
     RETURNING id`,
    [team.id, adminUserId],
  );
  const memberAdded = (memberIns.rowCount ?? 0) > 0;

  return { id: team.id, created, memberAdded };
}

async function findAtendimentoBoard(
  client: PoolClient,
  tenantId: string,
): Promise<{ id: string } | null> {
  const r = await client.query<{ id: string }>(
    `SELECT id::text FROM chat_kanban_boards
     WHERE tenant_id = $1
       AND archived_at IS NULL
       AND lower(trim(name)) = lower(trim($2))
     LIMIT 1`,
    [tenantId, TENANT_BOOTSTRAP_DEFAULT_BOARD_NAME],
  );
  return r.rows[0] ?? null;
}

async function ensureKanbanColumns(
  client: PoolClient,
  tenantId: string,
  boardId: string,
): Promise<number> {
  let ensured = 0;
  for (const col of TENANT_BOOTSTRAP_KANBAN_COLUMNS) {
    const exists = await client.query<{ id: string }>(
      `SELECT id::text FROM chat_kanban_columns
       WHERE board_id = $1 AND tenant_id = $2 AND lower(trim(name)) = lower(trim($3))
       LIMIT 1`,
      [boardId, tenantId, col.name],
    );
    if (exists.rows.length > 0) continue;

    const posTaken = await client.query<{ id: string }>(
      `SELECT id::text FROM chat_kanban_columns
       WHERE board_id = $1 AND tenant_id = $2 AND position = $3
       LIMIT 1`,
      [boardId, tenantId, col.position],
    );
    let position = col.position;
    if (posTaken.rows.length > 0) {
      const maxPos = await client.query<{ p: number }>(
        `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM chat_kanban_columns WHERE board_id = $1`,
        [boardId],
      );
      position = maxPos.rows[0]?.p ?? col.position;
    }

    await client.query(
      `INSERT INTO chat_kanban_columns (
         board_id, tenant_id, name, color, position, metadata
       ) VALUES ($1, $2, $3, $4, $5, '{}'::jsonb)`,
      [boardId, tenantId, col.name, col.color, position],
    );
    ensured += 1;
  }
  return ensured;
}

export async function ensureDefaultAtendimentoKanbanBoard(
  client: PoolClient,
  tenantId: string,
  adminUserId: string,
): Promise<{ boardId: string; created: boolean; columnsEnsured: number }> {
  let board = await findAtendimentoBoard(client, tenantId);
  let created = false;

  if (!board) {
    const boardId = randomUUID();
    await client.query(
      `INSERT INTO chat_kanban_boards (
         id, tenant_id, name, description, sort_order, archived_at,
         created_by_user_id, visibility_mode, is_active, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, 0, NULL, $5, 'tenant_all', true, now(), now())`,
      [
        boardId,
        tenantId,
        TENANT_BOOTSTRAP_DEFAULT_BOARD_NAME,
        TENANT_BOOTSTRAP_BOARD_DESCRIPTION,
        adminUserId,
      ],
    );
    board = { id: boardId };
    created = true;
  }

  const columnsEnsured = await ensureKanbanColumns(client, tenantId, board.id);
  return { boardId: board.id, created, columnsEnsured };
}

/**
 * Bootstrap operacional completo (acquisition provision apenas).
 * Falhas em templates WhatsApp não revertem equipe/kanban já criados.
 */
export async function ensureTenantOperationalBootstrap(
  input: TenantOperationalBootstrapInput,
): Promise<TenantOperationalBootstrapResult> {
  const { tenantId, adminUserId } = input;
  const client = await pool.connect();

  let teamResult: TenantOperationalBootstrapResult['team'];
  let kanbanResult: TenantOperationalBootstrapResult['kanban'];

  try {
    await client.query('BEGIN');
    teamResult = await ensureDefaultPrincipalTeam(client, tenantId, adminUserId);
    await client.query('COMMIT');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  }

  const kanbanClient = await pool.connect();
  try {
    await beginKanbanTxWithRls(kanbanClient, tenantId, adminUserId);
    kanbanResult = await ensureDefaultAtendimentoKanbanBoard(kanbanClient, tenantId, adminUserId);
    await kanbanClient.query('COMMIT');
  } catch (e) {
    try {
      await kanbanClient.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    kanbanClient.release();
  }

  let whatsappTemplates = { ensured: false };
  try {
    await ensureWhatsAppTemplateDefaults(tenantId);
    whatsappTemplates = { ensured: true };
  } catch (err) {
    console.warn('[tenant_bootstrap] whatsapp_template_defaults_failed', {
      tenantId,
      err,
    });
  } finally {
    client.release();
  }

  console.info('[tenant_bootstrap] operational_bootstrap_complete', {
    tenantId,
    teamId: teamResult.id,
    teamCreated: teamResult.created,
    boardId: kanbanResult.boardId,
    boardCreated: kanbanResult.created,
    columnsEnsured: kanbanResult.columnsEnsured,
    whatsappTemplates: whatsappTemplates.ensured,
  });

  return {
    team: teamResult,
    kanban: kanbanResult,
    whatsappTemplates,
  };
}
