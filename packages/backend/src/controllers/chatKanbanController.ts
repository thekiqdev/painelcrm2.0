/**
 * Kanban de conversas (Etapa D.2) — CRUD boards/colunas/cards.
 * Política P1: não altera funil CRM nem clients.funnel_stage.
 */
import { Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import { beginKanbanTxWithRls } from '../utils/kanbanRlsTx.js';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantId } from '../middleware/auth.js';
import { isTenantAdmin } from '../utils/tenant.js';
import { ensureTenantIdForInsert, ensureUserIdForInsert } from '../utils/tenantScope.js';
import { emitKanbanAttendanceIfNeeded, parseKanbanColumnRules } from '../utils/kanbanColumnRules.js';
import {
  applyKanbanPhase2Defaults,
  parseKanbanPhase2,
  validateKanbanAutoMoveAgainstBoard,
  validateKanbanPhase2ForSave,
} from '../utils/kanbanPhase2.js';
import {
  runKanbanPhase2Automations,
  type KanbanPhase2AutomationContext,
} from '../services/kanbanColumnAutomationService.js';
import {
  applyKanbanDestColumnEnterSideEffectsBeforeCardUpdate,
  runKanbanDestColumnPostUpdateAutomations,
} from '../services/kanbanInternalCardColumnPipeline.js';
import {
  cancelAllPendingScheduledMovesFromColumn,
  cancelPendingScheduledMovesForCardColumn,
  cancelPendingScheduledMovesForEntireCard,
  insertScheduledMoveIfColumnConfigured,
} from '../services/kanbanScheduledMoveService.js';
import {
  type KanbanBoardAccessRow,
  userCanManageKanbanBoard,
  userCanViewKanbanBoard,
} from '../services/kanbanBoardAccessService.js';
import {
  type KanbanProposalsMetadata,
  parseKanbanProposalsMetadata,
  sanitizeKanbanProposalsInMetadata,
  validateKanbanProposalAcceptAutomation,
  validateKanbanProposalAutoCreateOnEnter,
} from '../utils/kanbanProposalsMetadata.js';
import { issueNewPublicTokenForProposal } from '../services/proposalPublicViewService.js';
import {
  proposalPublicLinkPathFromRawToken,
  saveProposalPublicLinkCiphertext,
} from '../services/proposalPublicLinkCrmStore.js';
import type { KanbanAutoCreatedProposalPayload } from '../services/kanbanColumnAutoProposalService.js';
import { runKanbanAutoCreateProposalInTransaction } from '../services/kanbanColumnAutoProposalService.js';

/** Modelo oficial (`proposal_templates`) ou legado (`proposals` em draft). */
async function assertValidKanbanProposalColumnRefs(
  tenantId: string,
  kp: KanbanProposalsMetadata,
): Promise<string[]> {
  const errs: string[] = [];
  if (kp.default_proposal_model_id) {
    try {
      const r = await pool.query(
        `SELECT 1 FROM proposal_templates pt
         INNER JOIN users u ON u.id = pt.user_id
         WHERE pt.id = $1 AND u.tenant_id = $2 AND pt.is_active = true`,
        [kp.default_proposal_model_id, tenantId],
      );
      if (r.rows.length === 0) {
        errs.push(
          'Modelo de proposta da coluna: seleção inválida ou inativa — escolha um modelo ativo ou remova.',
        );
      }
    } catch (e: unknown) {
      const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
      if (code === '42P01') {
        errs.push(
          'Base desatualizada: execute a migração 128_proposal_templates.sql antes de usar modelos oficiais.',
        );
      } else {
        throw e;
      }
    }
  }
  if (kp.default_proposal_template_id && !kp.default_proposal_model_id) {
    const r = await pool.query(
      `SELECT 1 FROM proposals p
       INNER JOIN users u ON u.id = p.user_id
       WHERE p.id = $1 AND u.tenant_id = $2 AND p.status = 'draft'`,
      [kp.default_proposal_template_id, tenantId],
    );
    if (r.rows.length === 0) {
      errs.push(
        'Referência legada a rascunho inválida — selecione um modelo oficial (Propostas → Modelos) ou remova.',
      );
    }
  }
  return errs;
}

function boardAccessFromRow(board: Record<string, unknown>): KanbanBoardAccessRow {
  return {
    id: String(board.id),
    tenant_id: String(board.tenant_id),
    created_by_user_id: String(board.created_by_user_id),
    is_active: board.is_active !== false,
    visibility_mode: String(board.visibility_mode || 'tenant_all'),
  };
}

const createBoardSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  description: z.string().optional().nullable(),
  sort_order: z.number().int().optional(),
  linked_sales_funnel_id: z.string().uuid().optional().nullable(),
});

const patchBoardSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  sort_order: z.number().int().optional(),
  archived_at: z.union([z.string(), z.null()]).optional(),
  linked_sales_funnel_id: z.string().uuid().optional().nullable(),
  visibility_mode: z.enum(['tenant_all', 'restricted']).optional(),
  is_active: z.boolean().optional(),
  allowed_user_ids: z.array(z.string().uuid()).optional(),
  allowed_team_ids: z.array(z.string().uuid()).optional(),
});

const createColumnSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional().nullable(),
  position: z.number().int().min(0).optional(),
  funnel_stage_id: z.string().uuid().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

const patchColumnSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional().nullable(),
  position: z.number().int().min(0).optional(),
  funnel_stage_id: z.string().uuid().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

const reorderColumnsSchema = z.object({
  column_ids: z.array(z.string().uuid()).min(1),
});

const createCardSchema = z.object({
  conversation_id: z.string().uuid(),
  column_id: z.string().uuid(),
  position: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const patchCardSchema = z.object({
  column_id: z.string().uuid().optional(),
  position: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
  archived_at: z.union([z.string(), z.null()]).optional(),
  /** Obrigatório quando a coluna destino tem `require_move_reason`. */
  move_reason: z.string().max(2000).optional(),
  /** Obrigatório `true` quando a coluna destino tem `require_confirmation`. */
  move_confirmed: z.boolean().optional(),
});

const attachConversationSchema = z.object({
  board_id: z.string().uuid(),
  column_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  move_reason: z.string().max(2000).optional(),
  move_confirmed: z.boolean().optional(),
});

/** Mesma regra de partilha que getConversations com inboxScope = tenant. */
export async function conversationVisibleToTenantUser(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM chat_conversations c
     WHERE c.id = $1 AND (
         c.user_id = $2
         OR EXISTS (
           SELECT 1 FROM users u_owner
           INNER JOIN users u_me ON u_me.id = $2
           WHERE u_owner.id = c.user_id
             AND u_owner.tenant_id IS NOT NULL
             AND u_me.tenant_id IS NOT NULL
             AND u_owner.tenant_id = u_me.tenant_id
         )
       )
     LIMIT 1`,
    [conversationId, userId],
  );
  return r.rows.length > 0;
}

async function loadBoard(tenantId: string, boardId: string) {
  const r = await pool.query(
    `SELECT * FROM chat_kanban_boards WHERE id = $1 AND tenant_id = $2`,
    [boardId, tenantId],
  );
  return r.rows[0] ?? null;
}

/** Carrega o board e responde 401/403/404 se o utilizador não puder ver o quadro. */
async function requireVisibleKanbanBoard(
  req: AuthRequest,
  res: Response,
  tenantId: string,
  boardId: string,
): Promise<Record<string, unknown> | null> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Não autenticado' });
    return null;
  }
  const row = await loadBoard(tenantId, boardId);
  if (!row) {
    res.status(404).json({ error: 'Board não encontrado' });
    return null;
  }
  if (!(await userCanViewKanbanBoard(tenantId, userId, boardAccessFromRow(row as Record<string, unknown>)))) {
    res.status(403).json({ error: 'Sem acesso a este quadro Kanban.' });
    return null;
  }
  return row as Record<string, unknown>;
}

async function validateLinkedFunnelBelongsToTenant(tenantId: string, funnelId: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1
     FROM sales_funnels sf
     INNER JOIN users u ON u.id = sf.user_id
     WHERE sf.id = $1
       AND u.tenant_id = $2
     LIMIT 1`,
    [funnelId, tenantId],
  );
  return r.rows.length > 0;
}

async function validateStageBelongsToFunnelAndTenant(
  tenantId: string,
  stageId: string,
  funnelId: string,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1
     FROM funnel_stages fs
     INNER JOIN sales_funnels sf ON sf.id = fs.funnel_id
     INNER JOIN users u ON u.id = sf.user_id
     WHERE fs.id = $1
       AND sf.id = $2
       AND u.tenant_id = $3
     LIMIT 1`,
    [stageId, funnelId, tenantId],
  );
  return r.rows.length > 0;
}

async function loadColumn(tenantId: string, columnId: string) {
  const r = await pool.query(
    `SELECT * FROM chat_kanban_columns WHERE id = $1 AND tenant_id = $2`,
    [columnId, tenantId],
  );
  return r.rows[0] ?? null;
}

async function loadCard(tenantId: string, cardId: string) {
  const r = await pool.query(
    `SELECT * FROM chat_kanban_cards WHERE id = $1 AND tenant_id = $2`,
    [cardId, tenantId],
  );
  return r.rows[0] ?? null;
}

let hasConversationAvatarCachedUrlColumnPromise: Promise<boolean> | null = null;
async function hasConversationAvatarCachedUrlColumn(): Promise<boolean> {
  if (!hasConversationAvatarCachedUrlColumnPromise) {
    hasConversationAvatarCachedUrlColumnPromise = (async () => {
      const r = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'chat_conversations'
           AND column_name = 'avatar_cached_url'`,
      );
      return (r.rows[0]?.c ?? '0') === '1';
    })();
  }
  return hasConversationAvatarCachedUrlColumnPromise;
}

async function kanbanConversationAvatarSqlExpr(): Promise<string> {
  return (await hasConversationAvatarCachedUrlColumn())
    ? 'COALESCE(c.avatar_cached_url, c.avatar_url)'
    : 'c.avatar_url';
}

/** Mesma projeção que `listCards`, para um cartão (resposta de PATCH com dados de conversa atualizados). */
async function loadEnrichedKanbanCard(tenantId: string, cardId: string) {
  const avatarExpr = await kanbanConversationAvatarSqlExpr();
  const q = `
 SELECT
        kc.id,
        kc.board_id,
        kc.column_id,
        kc.tenant_id,
        kc.conversation_id,
        kc.position,
        kc.metadata,
        kc.archived_at,
        kc.created_by_user_id,
        kc.updated_by_user_id,
        kc.created_at,
        kc.updated_at,
        c.display_name AS conv_display_name,
        c.contact_name AS conv_contact_name,
        c.profile_name AS conv_profile_name,
        c.phone_number AS conv_phone_number,
        c.canonical_phone AS conv_canonical_phone,
        c.last_message_preview AS conv_last_message_preview,
        c.last_message_at AS conv_last_message_at,
        COALESCE(c.unread_count, 0)::int AS conv_unread_count,
        c.client_id AS conv_client_id,
        c.lead_id AS conv_lead_id,
        ${avatarExpr} AS conv_avatar_url,
        c.attendance_status AS conv_attendance_status,
        c.assigned_to_user_id AS conv_assigned_to_user_id,
        c.assigned_team_id AS conv_assigned_team_id,
        c.queue_id AS conv_queue_id,
        c.metadata AS conv_metadata,
        COALESCE(
          NULLIF(TRIM(COALESCE(pf.first_name, '') || ' ' || COALESCE(pf.last_name, '')), ''),
          assignee.email
        ) AS conv_assignee_display,
        t_team.name AS conv_assigned_team_name,
        CASE
          WHEN c.client_id IS NOT NULL THEN 'client_linked'
          WHEN c.lead_id IS NOT NULL THEN 'lead_linked'
          WHEN COALESCE((c.metadata->>'link_confidence'), '') = 'review' THEN 'review_required'
          ELSE 'unlinked'
        END AS conv_link_state,
        proposal_agg.proposal_pending_total,
        proposal_agg.proposal_accepted_total
      FROM chat_kanban_cards kc
      INNER JOIN chat_conversations c ON c.id = kc.conversation_id
      LEFT JOIN users assignee ON assignee.id = c.assigned_to_user_id
      LEFT JOIN profiles pf ON pf.id = assignee.id
      LEFT JOIN teams t_team ON t_team.id = c.assigned_team_id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(CASE WHEN p.status = 'sent' THEN p.amount::numeric ELSE 0 END), 0)::double precision AS proposal_pending_total,
          COALESCE(SUM(CASE WHEN p.status IN ('accepted', 'invoiced') THEN p.amount::numeric ELSE 0 END), 0)::double precision AS proposal_accepted_total
        FROM proposals p
        INNER JOIN users pu ON pu.id = p.user_id AND pu.tenant_id = $2
        WHERE
          (c.client_id IS NOT NULL AND p.client_id = c.client_id)
          OR (c.client_id IS NULL AND c.lead_id IS NOT NULL AND p.lead_id = c.lead_id)
      ) proposal_agg ON TRUE
      WHERE kc.id = $1 AND kc.tenant_id = $2
      LIMIT 1
    `;
  const r = await pool.query(q, [cardId, tenantId]);
  return r.rows[0] ?? null;
}

/** Próxima position na coluna (fractional indexing; novos cards ao fim). */
async function nextCardPosition(columnId: string): Promise<number> {
  const r = await pool.query(
    `SELECT COALESCE(MAX(position), 0)::float8 + 1 AS n FROM chat_kanban_cards
     WHERE column_id = $1 AND archived_at IS NULL`,
    [columnId],
  );
  const n = r.rows[0]?.n;
  return typeof n === 'number' ? n : Number(n) || 1;
}

async function fetchKanbanBoardAllowedUserIds(boardId: string, tenantId: string): Promise<string[]> {
  const r = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM chat_kanban_board_users WHERE board_id = $1 AND tenant_id = $2`,
    [boardId, tenantId],
  );
  return r.rows.map((x) => x.user_id);
}

async function fetchKanbanBoardAllowedTeamIds(boardId: string, tenantId: string): Promise<string[]> {
  const r = await pool.query<{ team_id: string }>(
    `SELECT team_id FROM chat_kanban_board_teams WHERE board_id = $1 AND tenant_id = $2`,
    [boardId, tenantId],
  );
  return r.rows.map((x) => x.team_id);
}

async function assertUserIdsBelongToTenant(
  tenantId: string,
  userIds: string[],
  res: Response,
): Promise<boolean> {
  const uniq = [...new Set(userIds)];
  if (uniq.length === 0) return true;
  const r = await pool.query(
    `SELECT COUNT(DISTINCT id)::int AS c FROM users WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
    [tenantId, uniq],
  );
  const c = Number(r.rows[0]?.c);
  if (c !== uniq.length) {
    res.status(400).json({ error: 'Um ou mais utilizadores não pertencem à empresa.' });
    return false;
  }
  return true;
}

async function assertTeamIdsBelongToTenant(
  tenantId: string,
  teamIds: string[],
  res: Response,
): Promise<boolean> {
  const uniq = [...new Set(teamIds)];
  if (uniq.length === 0) return true;
  const r = await pool.query(
    `SELECT COUNT(DISTINCT id)::int AS c FROM teams WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
    [tenantId, uniq],
  );
  const c = Number(r.rows[0]?.c);
  if (c !== uniq.length) {
    res.status(400).json({ error: 'Uma ou mais equipes não pertencem à empresa.' });
    return false;
  }
  return true;
}

async function replaceKanbanBoardAcl(
  client: import('pg').PoolClient,
  tenantId: string,
  boardId: string,
  userIds: string[],
  teamIds: string[],
): Promise<void> {
  await client.query('DELETE FROM chat_kanban_board_users WHERE board_id = $1', [boardId]);
  await client.query('DELETE FROM chat_kanban_board_teams WHERE board_id = $1', [boardId]);
  for (const uid of userIds) {
    await client.query(
      `INSERT INTO chat_kanban_board_users (board_id, tenant_id, user_id) VALUES ($1, $2, $3)`,
      [boardId, tenantId, uid],
    );
  }
  for (const tid of teamIds) {
    await client.query(
      `INSERT INTO chat_kanban_board_teams (board_id, tenant_id, team_id) VALUES ($1, $2, $3)`,
      [boardId, tenantId, tid],
    );
  }
}

export async function listBoards(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    const includeArchived = String(req.query.includeArchived || '') === '1' || String(req.query.includeArchived || '') === 'true';
    const isAdmin = await isTenantAdmin(userId);
    const q = `
      SELECT
        b.*,
        ($3::boolean OR b.created_by_user_id = $2::uuid) AS current_user_can_manage
      FROM chat_kanban_boards b
      WHERE b.tenant_id = $1::uuid
        AND ($4::boolean OR b.archived_at IS NULL)
        AND (
          $3::boolean
          OR b.created_by_user_id = $2::uuid
          OR (
            COALESCE(b.is_active, true)
            AND (
              COALESCE(b.visibility_mode, 'tenant_all') = 'tenant_all'
              OR EXISTS (
                SELECT 1 FROM chat_kanban_board_users bu
                WHERE bu.board_id = b.id AND bu.user_id = $2::uuid
              )
              OR EXISTS (
                SELECT 1
                FROM chat_kanban_board_teams bt
                INNER JOIN team_members tm ON tm.team_id = bt.team_id AND tm.user_id = $2::uuid
                WHERE bt.board_id = b.id
              )
            )
          )
        )
      ORDER BY b.sort_order ASC, b.created_at ASC
    `;
    const result = await pool.query(q, [tenantId, userId, isAdmin, includeArchived]);
    res.json(result.rows);
  } catch (e: any) {
    if (e?.code === '42P01') {
      res.json([]);
      return;
    }
    console.error('[chatKanban] listBoards', e);
    res.status(500).json({ error: e?.message || 'Erro ao listar boards' });
  }
}

export async function getBoard(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const { boardId } = req.params;
    const row = await requireVisibleKanbanBoard(req, res, tenantId, boardId);
    if (!row) return;
    res.json(row);
  } catch (e: any) {
    console.error('[chatKanban] getBoard', e);
    res.status(500).json({ error: e?.message || 'Erro' });
  }
}

/** Definições do board (ACL + campos) — apenas criador ou admin da empresa. */
export async function getBoardSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    const { boardId } = req.params;
    const row = await loadBoard(tenantId, boardId);
    if (!row) {
      res.status(404).json({ error: 'Board não encontrado' });
      return;
    }
    const accessRow = boardAccessFromRow(row as Record<string, unknown>);
    if (!(await userCanManageKanbanBoard(userId, accessRow))) {
      res.status(403).json({ error: 'Apenas o criador do quadro ou administrador da empresa pode abrir estas definições.' });
      return;
    }
    const [usersR, teamsR] = await Promise.all([
      pool.query<{ user_id: string }>(
        `SELECT user_id FROM chat_kanban_board_users WHERE board_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`,
        [boardId, tenantId],
      ),
      pool.query<{ team_id: string }>(
        `SELECT team_id FROM chat_kanban_board_teams WHERE board_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`,
        [boardId, tenantId],
      ),
    ]);
    res.json({
      board: row,
      allowed_user_ids: usersR.rows.map((x) => x.user_id),
      allowed_team_ids: teamsR.rows.map((x) => x.team_id),
    });
  } catch (e: any) {
    console.error('[chatKanban] getBoardSettings', e);
    res.status(500).json({ error: e?.message || 'Erro' });
  }
}

export async function createBoard(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = ensureTenantIdForInsert(req);
    const userId = ensureUserIdForInsert(req);
    const body = createBoardSchema.parse(req.body || {});
    if (body.linked_sales_funnel_id) {
      const funnelOk = await validateLinkedFunnelBelongsToTenant(tenantId, body.linked_sales_funnel_id);
      if (!funnelOk) {
        res.status(400).json({ error: 'Funil inválido para esta empresa.' });
        return;
      }
    }
    const r = await pool.query(
      `INSERT INTO chat_kanban_boards (
        tenant_id, name, description, sort_order, created_by_user_id, linked_sales_funnel_id
      ) VALUES ($1, $2, $3, COALESCE($4, 0), $5, $6)
      RETURNING *`,
      [
        tenantId,
        body.name.trim(),
        body.description ?? null,
        body.sort_order ?? null,
        userId,
        body.linked_sales_funnel_id ?? null,
      ],
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.errors.map((x) => x.message).join('; ') });
      return;
    }
    if (e?.message === 'Tenant required') {
      res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
      return;
    }
    console.error('[chatKanban] createBoard', e);
    res.status(500).json({ error: e?.message || 'Erro ao criar board' });
  }
}

export async function patchBoard(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const { boardId } = req.params;
    const body = patchBoardSchema.parse(req.body || {});
    const existing = await loadBoard(tenantId, boardId);
    if (!existing) {
      res.status(404).json({ error: 'Board não encontrado' });
      return;
    }
    const accessRow = boardAccessFromRow(existing as Record<string, unknown>);
    if (!(await userCanManageKanbanBoard(userId, accessRow))) {
      res.status(403).json({
        error: 'Apenas o criador do quadro ou administrador da empresa pode alterar estas definições.',
      });
      return;
    }

    const touchesAcl =
      body.visibility_mode !== undefined ||
      body.allowed_user_ids !== undefined ||
      body.allowed_team_ids !== undefined;

    const updates: string[] = [];
    const params: unknown[] = [];
    let n = 1;
    if (body.name !== undefined) {
      updates.push(`name = $${n++}`);
      params.push(body.name.trim());
    }
    if (body.description !== undefined) {
      updates.push(`description = $${n++}`);
      params.push(body.description);
    }
    if (body.sort_order !== undefined) {
      updates.push(`sort_order = $${n++}`);
      params.push(body.sort_order);
    }
    if (body.archived_at !== undefined) {
      updates.push(`archived_at = $${n++}`);
      params.push(body.archived_at ? new Date(body.archived_at) : null);
    }
    if (body.linked_sales_funnel_id !== undefined) {
      if (body.linked_sales_funnel_id) {
        const funnelOk = await validateLinkedFunnelBelongsToTenant(tenantId, body.linked_sales_funnel_id);
        if (!funnelOk) {
          res.status(400).json({ error: 'Funil inválido para esta empresa.' });
          return;
        }
      }
      updates.push(`linked_sales_funnel_id = $${n++}`);
      params.push(body.linked_sales_funnel_id);
    }
    if (body.visibility_mode !== undefined) {
      updates.push(`visibility_mode = $${n++}`);
      params.push(body.visibility_mode);
    }
    if (body.is_active !== undefined) {
      updates.push(`is_active = $${n++}`);
      params.push(body.is_active);
    }

    if (updates.length === 0 && !touchesAcl) {
      res.status(400).json({ error: 'Nenhum campo para atualizar' });
      return;
    }

    let resolvedUserIds: string[] | null = null;
    let resolvedTeamIds: string[] | null = null;
    if (touchesAcl) {
      const prevVis = String((existing as Record<string, unknown>).visibility_mode || 'tenant_all');
      const finalVis = body.visibility_mode ?? prevVis;
      if (finalVis === 'tenant_all') {
        resolvedUserIds = [];
        resolvedTeamIds = [];
      } else {
        resolvedUserIds =
          body.allowed_user_ids !== undefined
            ? body.allowed_user_ids
            : await fetchKanbanBoardAllowedUserIds(boardId, tenantId);
        resolvedTeamIds =
          body.allowed_team_ids !== undefined
            ? body.allowed_team_ids
            : await fetchKanbanBoardAllowedTeamIds(boardId, tenantId);
        if (!(await assertUserIdsBelongToTenant(tenantId, resolvedUserIds, res))) return;
        if (!(await assertTeamIdsBelongToTenant(tenantId, resolvedTeamIds, res))) return;
      }
    }

    if (touchesAcl && (resolvedUserIds !== null || resolvedTeamIds !== null)) {
      const client = await pool.connect();
      try {
        await beginKanbanTxWithRls(client, tenantId, userId);
        if (updates.length > 0) {
          updates.push(`updated_by_user_id = $${n++}`);
          params.push(userId);
          const idParam = n++;
          const tenantParam = n++;
          params.push(boardId, tenantId);
          await client.query(
            `UPDATE chat_kanban_boards SET ${updates.join(', ')} WHERE id = $${idParam} AND tenant_id = $${tenantParam}`,
            params,
          );
        } else {
          await client.query(
            `UPDATE chat_kanban_boards SET updated_by_user_id = $1 WHERE id = $2 AND tenant_id = $3`,
            [userId, boardId, tenantId],
          );
        }
        await replaceKanbanBoardAcl(
          client,
          tenantId,
          boardId,
          resolvedUserIds ?? [],
          resolvedTeamIds ?? [],
        );
        await client.query('COMMIT');
      } catch (e) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* ignore */
        }
        throw e;
      } finally {
        client.release();
      }
      const out = await loadBoard(tenantId, boardId);
      res.json(out);
      return;
    }

    updates.push(`updated_by_user_id = $${n++}`);
    params.push(userId);
    const idParam = n++;
    const tenantParam = n++;
    params.push(boardId, tenantId);
    const r = await pool.query(
      `UPDATE chat_kanban_boards SET ${updates.join(', ')} WHERE id = $${idParam} AND tenant_id = $${tenantParam}
       RETURNING *`,
      params,
    );
    res.json(r.rows[0]);
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.errors.map((x) => x.message).join('; ') });
      return;
    }
    console.error('[chatKanban] patchBoard', e);
    res.status(500).json({ error: e?.message || 'Erro' });
  }
}

export async function listColumns(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const { boardId } = req.params;
    if (!(await requireVisibleKanbanBoard(req, res, tenantId, boardId))) return;
    const r = await pool.query(
      `SELECT * FROM chat_kanban_columns WHERE board_id = $1 AND tenant_id = $2 ORDER BY position ASC, created_at ASC`,
      [boardId, tenantId],
    );
    res.json(r.rows);
  } catch (e: any) {
    console.error('[chatKanban] listColumns', e);
    res.status(500).json({ error: e?.message || 'Erro' });
  }
}

export async function createColumn(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = ensureTenantIdForInsert(req);
    const { boardId } = req.params;
    const body = createColumnSchema.parse(req.body || {});
    const board = await requireVisibleKanbanBoard(req, res, tenantId, boardId);
    if (!board) return;
    let position = body.position;
    if (position === undefined) {
      const pr = await pool.query(
        `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM chat_kanban_columns WHERE board_id = $1`,
        [boardId],
      );
      position = pr.rows[0]?.p ?? 0;
    }
    const meta = applyKanbanPhase2Defaults(body.metadata ?? {});
    sanitizeKanbanProposalsInMetadata(meta);
    const phase2Issues = validateKanbanPhase2ForSave(meta);
    if (phase2Issues.length > 0) {
      res.status(400).json({ error: phase2Issues.join('; ') });
      return;
    }
    const boardCols = await pool.query(`SELECT id FROM chat_kanban_columns WHERE board_id = $1 AND tenant_id = $2`, [
      boardId,
      tenantId,
    ]);
    const boardColSet = new Set(boardCols.rows.map((r: { id: string }) => r.id));
    const autoMoveIssues = validateKanbanAutoMoveAgainstBoard(null, boardColSet, parseKanbanPhase2(meta));
    if (autoMoveIssues.length > 0) {
      res.status(400).json({ error: autoMoveIssues.join('; ') });
      return;
    }
    const proposalAcceptIssues = validateKanbanProposalAcceptAutomation(null, meta, boardColSet);
    if (proposalAcceptIssues.length > 0) {
      res.status(400).json({ error: proposalAcceptIssues.join('; ') });
      return;
    }
    const kpParsed = parseKanbanProposalsMetadata(meta);
    const autoCreateIssues = validateKanbanProposalAutoCreateOnEnter(kpParsed);
    if (autoCreateIssues.length > 0) {
      res.status(400).json({ error: autoCreateIssues.join('; ') });
      return;
    }
    const templateIssues = await assertValidKanbanProposalColumnRefs(tenantId, kpParsed);
    if (templateIssues.length > 0) {
      res.status(400).json({ error: templateIssues.join('; ') });
      return;
    }
    if (body.funnel_stage_id) {
      const boardFunnelId = (board.linked_sales_funnel_id as string | null) ?? null;
      if (!boardFunnelId) {
        res.status(400).json({
          error: 'Esta coluna não pode mapear estágio sem funil vinculado ao board.',
        });
        return;
      }
      const stageOk = await validateStageBelongsToFunnelAndTenant(
        tenantId,
        body.funnel_stage_id,
        boardFunnelId,
      );
      if (!stageOk) {
        res.status(400).json({
          error: 'Stage inválido: não pertence ao funil vinculado neste board.',
        });
        return;
      }
    }
    const r = await pool.query(
      `INSERT INTO chat_kanban_columns (
        board_id, tenant_id, name, color, position, funnel_stage_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING *`,
      [
        boardId,
        tenantId,
        body.name.trim(),
        body.color ?? null,
        position,
        body.funnel_stage_id ?? null,
        JSON.stringify(meta),
      ],
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.errors.map((x) => x.message).join('; ') });
      return;
    }
    if (e?.code === '23505') {
      res.status(409).json({ error: 'Posição já em uso neste board; use reordenar ou outra posição' });
      return;
    }
    if (e?.message === 'Tenant required') {
      res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
      return;
    }
    console.error('[chatKanban] createColumn', e);
    res.status(500).json({ error: e?.message || 'Erro ao criar coluna' });
  }
}

export async function patchColumn(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const { columnId } = req.params;
    const body = patchColumnSchema.parse(req.body || {});
    const col = await loadColumn(tenantId, columnId);
    if (!col) {
      res.status(404).json({ error: 'Coluna não encontrada' });
      return;
    }
    if (!(await requireVisibleKanbanBoard(req, res, tenantId, String(col.board_id)))) return;
    const updates: string[] = [];
    const params: unknown[] = [];
    let n = 1;
    if (body.name !== undefined) {
      updates.push(`name = $${n++}`);
      params.push(body.name.trim());
    }
    if (body.color !== undefined) {
      updates.push(`color = $${n++}`);
      params.push(body.color);
    }
    if (body.position !== undefined) {
      updates.push(`position = $${n++}`);
      params.push(body.position);
    }
    if (body.funnel_stage_id !== undefined) {
      if (body.funnel_stage_id) {
        const board = await loadBoard(tenantId, String(col.board_id));
        const boardFunnelId = (board?.linked_sales_funnel_id as string | null) ?? null;
        if (!boardFunnelId) {
          res.status(400).json({
            error: 'Não é possível mapear stage: board sem funil vinculado.',
          });
          return;
        }
        const stageOk = await validateStageBelongsToFunnelAndTenant(
          tenantId,
          body.funnel_stage_id,
          boardFunnelId,
        );
        if (!stageOk) {
          res.status(400).json({
            error: 'Stage inválido: não pertence ao funil do board.',
          });
          return;
        }
      }
      updates.push(`funnel_stage_id = $${n++}`);
      params.push(body.funnel_stage_id);
    }
    if (body.metadata !== undefined) {
      const normalizedMeta = applyKanbanPhase2Defaults(body.metadata);
      sanitizeKanbanProposalsInMetadata(normalizedMeta);
      const phase2Issues = validateKanbanPhase2ForSave(normalizedMeta);
      if (phase2Issues.length > 0) {
        res.status(400).json({ error: phase2Issues.join('; ') });
        return;
      }
      const boardCols = await pool.query(`SELECT id FROM chat_kanban_columns WHERE board_id = $1 AND tenant_id = $2`, [
        col.board_id,
        tenantId,
      ]);
      const boardColSet = new Set(boardCols.rows.map((r: { id: string }) => r.id));
      const autoMoveIssues = validateKanbanAutoMoveAgainstBoard(columnId, boardColSet, parseKanbanPhase2(normalizedMeta));
      if (autoMoveIssues.length > 0) {
        res.status(400).json({ error: autoMoveIssues.join('; ') });
        return;
      }
      const proposalAcceptIssues = validateKanbanProposalAcceptAutomation(columnId, normalizedMeta, boardColSet);
      if (proposalAcceptIssues.length > 0) {
        res.status(400).json({ error: proposalAcceptIssues.join('; ') });
        return;
      }
      const kpParsed = parseKanbanProposalsMetadata(normalizedMeta);
      const autoCreateIssues = validateKanbanProposalAutoCreateOnEnter(kpParsed);
      if (autoCreateIssues.length > 0) {
        res.status(400).json({ error: autoCreateIssues.join('; ') });
        return;
      }
      const templateIssues = await assertValidKanbanProposalColumnRefs(tenantId, kpParsed);
      if (templateIssues.length > 0) {
        res.status(400).json({ error: templateIssues.join('; ') });
        return;
      }
      updates.push(`metadata = $${n++}::jsonb`);
      params.push(JSON.stringify(normalizedMeta));
    }
    if (updates.length === 0) {
      res.status(400).json({ error: 'Nenhum campo para atualizar' });
      return;
    }
    const idParam = n++;
    const tenantParam = n++;
    params.push(columnId, tenantId);
    const r = await pool.query(
      `UPDATE chat_kanban_columns SET ${updates.join(', ')} WHERE id = $${idParam} AND tenant_id = $${tenantParam}
       RETURNING *`,
      params,
    );
    if (body.metadata !== undefined) {
      const prevA = JSON.stringify(parseKanbanPhase2(col.metadata).automations);
      const nextA = JSON.stringify(parseKanbanPhase2(r.rows[0].metadata).automations);
      if (prevA !== nextA) {
        const c = await pool.connect();
        try {
          await beginKanbanTxWithRls(c, tenantId, userId);
          await cancelAllPendingScheduledMovesFromColumn(
            c,
            tenantId,
            columnId,
            'column_automation_settings_changed',
          );
          await c.query('COMMIT');
        } catch (ce) {
          try {
            await c.query('ROLLBACK');
          } catch {
            /* ignore */
          }
          console.error('[chatKanban] patchColumn cancel scheduled moves', ce);
        } finally {
          c.release();
        }
      }
    }
    res.json(r.rows[0]);
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.errors.map((x) => x.message).join('; ') });
      return;
    }
    if (e?.code === '23505') {
      res.status(409).json({ error: 'Conflito de position neste board' });
      return;
    }
    console.error('[chatKanban] patchColumn', e);
    res.status(500).json({ error: e?.message || 'Erro' });
  }
}

export async function deleteColumn(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const { columnId } = req.params;
    const col = await loadColumn(tenantId, columnId);
    if (!col) {
      res.status(404).json({ error: 'Coluna não encontrada' });
      return;
    }
    if (!(await requireVisibleKanbanBoard(req, res, tenantId, String(col.board_id)))) return;
    const cnt = await pool.query(
      `SELECT COUNT(*)::int AS n FROM chat_kanban_cards
       WHERE column_id = $1 AND tenant_id = $2 AND archived_at IS NULL`,
      [columnId, tenantId],
    );
    if ((cnt.rows[0]?.n ?? 0) > 0) {
      res.status(409).json({ error: 'Não é possível excluir coluna com cards; remova ou mova os cards primeiro' });
      return;
    }
    const cx = await pool.connect();
    try {
      await beginKanbanTxWithRls(cx, tenantId, userId);
      await cx.query(
        `UPDATE chat_kanban_scheduled_moves
         SET status = 'cancelled', cancelled_reason = $3, updated_at = now()
         WHERE tenant_id = $1 AND status = 'scheduled'
           AND (from_column_id = $2 OR to_column_id = $2)`,
        [tenantId, columnId, 'column_deleted'],
      );
      await cx.query(`DELETE FROM chat_kanban_columns WHERE id = $1 AND tenant_id = $2`, [columnId, tenantId]);
      await cx.query('COMMIT');
    } catch (de) {
      try {
        await cx.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw de;
    } finally {
      cx.release();
    }
    res.status(204).send();
  } catch (e: any) {
    console.error('[chatKanban] deleteColumn', e);
    res.status(500).json({ error: e?.message || 'Erro' });
  }
}

export async function reorderColumns(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const { boardId } = req.params;
    const body = reorderColumnsSchema.parse(req.body || {});
    if (!(await requireVisibleKanbanBoard(req, res, tenantId, boardId))) return;
    const cols = await pool.query(
      `SELECT id FROM chat_kanban_columns WHERE board_id = $1 AND tenant_id = $2`,
      [boardId, tenantId],
    );
    const existingIds = new Set(cols.rows.map((r: { id: string }) => r.id));
    if (body.column_ids.length !== existingIds.size) {
      res.status(400).json({ error: 'column_ids deve listar todas as colunas do board exatamente uma vez' });
      return;
    }
    for (const id of body.column_ids) {
      if (!existingIds.has(id)) {
        res.status(400).json({ error: 'column_id não pertence a este board' });
        return;
      }
    }
    await pool.query('BEGIN');
    try {
      for (let p = 0; p < body.column_ids.length; p++) {
        await pool.query(
          `UPDATE chat_kanban_columns SET position = $1 WHERE id = $2 AND board_id = $3 AND tenant_id = $4`,
          [p, body.column_ids[p], boardId, tenantId],
        );
      }
      await pool.query('COMMIT');
    } catch (inner) {
      await pool.query('ROLLBACK');
      throw inner;
    }
    const r = await pool.query(
      `SELECT * FROM chat_kanban_columns WHERE board_id = $1 AND tenant_id = $2 ORDER BY position ASC`,
      [boardId, tenantId],
    );
    res.json(r.rows);
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.errors.map((x) => x.message).join('; ') });
      return;
    }
    console.error('[chatKanban] reorderColumns', e);
    res.status(500).json({ error: e?.message || 'Erro' });
  }
}

export async function listCards(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const { boardId } = req.params;
    if (!(await requireVisibleKanbanBoard(req, res, tenantId, boardId))) return;
    const includeArchived = String(req.query.includeArchived || '') === 'true' || String(req.query.includeArchived || '') === '1';
    const archivedClause = includeArchived ? '' : 'AND kc.archived_at IS NULL';
    const avatarExpr = await kanbanConversationAvatarSqlExpr();
    const q = `
      SELECT
        kc.id,
        kc.board_id,
        kc.column_id,
        kc.tenant_id,
        kc.conversation_id,
        kc.position,
        kc.metadata,
        kc.archived_at,
        kc.created_by_user_id,
        kc.updated_by_user_id,
        kc.created_at,
        kc.updated_at,
        c.display_name AS conv_display_name,
        c.contact_name AS conv_contact_name,
        c.profile_name AS conv_profile_name,
        c.phone_number AS conv_phone_number,
        c.canonical_phone AS conv_canonical_phone,
        c.last_message_preview AS conv_last_message_preview,
        c.last_message_at AS conv_last_message_at,
        COALESCE(c.unread_count, 0)::int AS conv_unread_count,
        c.client_id AS conv_client_id,
        c.lead_id AS conv_lead_id,
        ${avatarExpr} AS conv_avatar_url,
        c.attendance_status AS conv_attendance_status,
        c.assigned_to_user_id AS conv_assigned_to_user_id,
        c.assigned_team_id AS conv_assigned_team_id,
        c.queue_id AS conv_queue_id,
        c.metadata AS conv_metadata,
        COALESCE(
          NULLIF(TRIM(COALESCE(pf.first_name, '') || ' ' || COALESCE(pf.last_name, '')), ''),
          assignee.email
        ) AS conv_assignee_display,
        t_team.name AS conv_assigned_team_name,
        CASE
          WHEN c.client_id IS NOT NULL THEN 'client_linked'
          WHEN c.lead_id IS NOT NULL THEN 'lead_linked'
          WHEN COALESCE((c.metadata->>'link_confidence'), '') = 'review' THEN 'review_required'
          ELSE 'unlinked'
        END AS conv_link_state,
        proposal_agg.proposal_pending_total,
        proposal_agg.proposal_accepted_total
      FROM chat_kanban_cards kc
      INNER JOIN chat_conversations c ON c.id = kc.conversation_id
      LEFT JOIN users assignee ON assignee.id = c.assigned_to_user_id
      LEFT JOIN profiles pf ON pf.id = assignee.id
      LEFT JOIN teams t_team ON t_team.id = c.assigned_team_id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(CASE WHEN p.status = 'sent' THEN p.amount::numeric ELSE 0 END), 0)::double precision AS proposal_pending_total,
          COALESCE(SUM(CASE WHEN p.status IN ('accepted', 'invoiced') THEN p.amount::numeric ELSE 0 END), 0)::double precision AS proposal_accepted_total
        FROM proposals p
        INNER JOIN users pu ON pu.id = p.user_id AND pu.tenant_id = $2
        WHERE
          (c.client_id IS NOT NULL AND p.client_id = c.client_id)
          OR (c.client_id IS NULL AND c.lead_id IS NOT NULL AND p.lead_id = c.lead_id)
      ) proposal_agg ON TRUE
      WHERE kc.board_id = $1 AND kc.tenant_id = $2
      ${archivedClause}
      ORDER BY kc.column_id, kc.position ASC, kc.created_at ASC
    `;
    const r = await pool.query(q, [boardId, tenantId]);
    res.json(r.rows);
  } catch (e: any) {
    console.error('[chatKanban] listCards', e);
    res.status(500).json({ error: e?.message || 'Erro' });
  }
}

export async function createCard(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = ensureTenantIdForInsert(req);
    const userId = ensureUserIdForInsert(req);
    const { boardId } = req.params;
    const body = createCardSchema.parse(req.body || {});
    if (!(await requireVisibleKanbanBoard(req, res, tenantId, boardId))) return;
    const column = await loadColumn(tenantId, body.column_id);
    if (!column || column.board_id !== boardId) {
      res.status(400).json({ error: 'Coluna inválida ou não pertence a este board' });
      return;
    }
    const visible = await conversationVisibleToTenantUser(body.conversation_id, userId);
    if (!visible) {
      res.status(403).json({ error: 'Conversa não encontrada ou sem acesso para esta empresa' });
      return;
    }
    const position = body.position !== undefined ? Number(body.position) : await nextCardPosition(body.column_id);
    const meta = body.metadata ?? {};
    const client = await pool.connect();
    let created: Record<string, unknown>;
    let createAutoPending: KanbanAutoCreatedProposalPayload | null = null;
    try {
      await beginKanbanTxWithRls(client, tenantId, userId);
      const r = await client.query(
        `INSERT INTO chat_kanban_cards (
          board_id, column_id, tenant_id, conversation_id, position, metadata, created_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
        RETURNING *`,
        [boardId, body.column_id, tenantId, body.conversation_id, position, JSON.stringify(meta), userId],
      );
      created = r.rows[0] as Record<string, unknown>;
      const auto = await runKanbanAutoCreateProposalInTransaction(client, {
        tenantId,
        actorUserId: userId,
        cardId: String(created.id),
        conversationId: body.conversation_id,
        destColumnId: body.column_id,
        destColumnMetadata: column.metadata,
        boardId,
      });
      if (auto) createAutoPending = auto;

      const colMeta = await client.query<{ metadata: unknown }>(
        `SELECT metadata FROM chat_kanban_columns WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [body.column_id, tenantId],
      );
      await insertScheduledMoveIfColumnConfigured(client, {
        tenantId,
        boardId,
        cardId: String(created.id),
        conversationId: body.conversation_id,
        columnId: body.column_id,
        columnMetadata: colMeta.rows[0]?.metadata ?? {},
        actorUserId: userId,
      });
      await client.query('COMMIT');
    } catch (inTx) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw inTx;
    } finally {
      client.release();
    }

    let outPayload: Record<string, unknown> = { ...created };
    if (createAutoPending && tenantId) {
      let autoRes: KanbanAutoCreatedProposalPayload = { ...createAutoPending, public_link_path: null };
      try {
        const { rawToken } = await issueNewPublicTokenForProposal({
          proposalId: createAutoPending.id,
          tenantId,
        });
        const public_link_path = proposalPublicLinkPathFromRawToken(rawToken);
        try {
          await saveProposalPublicLinkCiphertext(createAutoPending.id, rawToken);
        } catch (saveErr: unknown) {
          const code =
            typeof saveErr === 'object' && saveErr !== null && 'code' in saveErr
              ? String((saveErr as { code: unknown }).code)
              : '';
          if (code !== '42703') throw saveErr;
        }
        autoRes = { ...createAutoPending, public_link_path };
      } catch (e) {
        console.error('[chatKanban] createCard auto proposal link público', e);
      }
      outPayload.kanban_auto_created_proposal = autoRes;
    }

    res.status(201).json(outPayload);
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.errors.map((x) => x.message).join('; ') });
      return;
    }
    if (e?.code === '23505') {
      res.status(409).json({ error: 'Esta conversa já está neste board' });
      return;
    }
    if (e?.message === 'Tenant required' || e?.message === 'Authentication required') {
      res.status(403).json({ error: 'Autenticação ou empresa obrigatória' });
      return;
    }
    console.error('[chatKanban] createCard', e);
    res.status(500).json({ error: e?.message || 'Erro ao criar card' });
  }
}

/**
 * Anexa conversa ao quadro: cria cartão se ainda não existir neste board; caso contrário move para a coluna (idempotente por board+conversation).
 */
export async function attachConversation(req: AuthRequest, res: Response): Promise<void> {
  const prevParams = { ...req.params };
  const prevBody = req.body;
  const restoreReq = () => {
    (req as AuthRequest & { params: typeof prevParams }).params = prevParams;
    (req as AuthRequest & { body: unknown }).body = prevBody;
  };
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = ensureUserIdForInsert(req);
    const bodyParsed = attachConversationSchema.parse(req.body || {});
    const { board_id, column_id, conversation_id, move_reason, move_confirmed } = bodyParsed;

    if (!(await requireVisibleKanbanBoard(req, res, tenantId, board_id))) return;
    const column = await loadColumn(tenantId, column_id);
    if (!column || column.board_id !== board_id) {
      res.status(400).json({ error: 'Coluna inválida ou não pertence a este board' });
      return;
    }
    const visible = await conversationVisibleToTenantUser(conversation_id, userId);
    if (!visible) {
      res.status(403).json({ error: 'Conversa não encontrada ou sem acesso para esta empresa' });
      return;
    }

    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM chat_kanban_cards
       WHERE tenant_id = $1 AND board_id = $2 AND conversation_id = $3 AND archived_at IS NULL
       LIMIT 1`,
      [tenantId, board_id, conversation_id],
    );
    const existingId = existing.rows[0]?.id ?? null;

    if (existingId) {
      const position = await nextCardPosition(column_id);
      (req as AuthRequest & { params: Record<string, string> }).params = {
        ...prevParams,
        cardId: existingId,
      };
      (req as AuthRequest & { body: Record<string, unknown> }).body = {
        column_id,
        position,
        ...(typeof move_reason === 'string' && move_reason.trim() ? { move_reason: move_reason.trim() } : {}),
        ...(move_confirmed === true ? { move_confirmed: true } : {}),
      };
      await patchCard(req, res);
      return;
    }

    (req as AuthRequest & { params: Record<string, string> }).params = {
      ...prevParams,
      boardId: board_id,
    };
    (req as AuthRequest & { body: Record<string, unknown> }).body = {
      conversation_id,
      column_id,
    };
    await createCard(req, res);
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      if (!res.headersSent) {
        res.status(400).json({ error: e.errors.map((x) => x.message).join('; ') });
      }
      return;
    }
    if (e?.message === 'Tenant required' || e?.message === 'Authentication required') {
      if (!res.headersSent) res.status(403).json({ error: 'Autenticação ou empresa obrigatória' });
      return;
    }
    console.error('[chatKanban] attachConversation', e);
    if (!res.headersSent) res.status(500).json({ error: e?.message || 'Erro ao anexar conversa' });
  } finally {
    restoreReq();
  }
}

export async function patchCard(req: AuthRequest, res: Response): Promise<void> {
  let client: import('pg').PoolClient | null = null;
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const { cardId } = req.params;
    const body = patchCardSchema.parse(req.body || {});
    const card = await loadCard(tenantId, cardId);
    if (!card) {
      res.status(404).json({ error: 'Card não encontrado' });
      return;
    }
    const board = await requireVisibleKanbanBoard(req, res, tenantId, String(card.board_id));
    if (!board) return;
    let nextColumnId = card.column_id as string;
    if (body.column_id !== undefined) {
      const col = await loadColumn(tenantId, body.column_id);
      if (!col || col.board_id !== card.board_id) {
        res.status(400).json({ error: 'Coluna destino inválida ou de outro board' });
        return;
      }
      nextColumnId = body.column_id;
    }

    const columnChanged =
      body.column_id !== undefined && String(body.column_id) !== String(card.column_id);

    let destColForRules: Awaited<ReturnType<typeof loadColumn>> = null;
    if (columnChanged && body.column_id) {
      destColForRules = await loadColumn(tenantId, body.column_id);
      if (!destColForRules) {
        res.status(400).json({ error: 'Coluna destino inválida' });
        return;
      }
      const rulesPreview = parseKanbanColumnRules(destColForRules.metadata);
      if (rulesPreview.require_move_reason) {
        const mr = typeof body.move_reason === 'string' ? body.move_reason.trim() : '';
        if (!mr) {
          res.status(400).json({
            error: 'Esta coluna exige motivo ao mover o cartão.',
            code: 'KANBAN_MOVE_REASON_REQUIRED',
          });
          return;
        }
      }
      if (rulesPreview.require_confirmation && body.move_confirmed !== true) {
        res.status(400).json({
          error: 'Esta coluna exige confirmação antes de mover o cartão.',
          code: 'KANBAN_MOVE_CONFIRMATION_REQUIRED',
        });
        return;
      }
      const visible = await conversationVisibleToTenantUser(card.conversation_id as string, userId);
      if (!visible) {
        res.status(403).json({ error: 'Sem acesso à conversa deste cartão' });
        return;
      }
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    let n = 1;
    if (body.column_id !== undefined) {
      updates.push(`column_id = $${n++}`);
      params.push(nextColumnId);
    }
    if (body.position !== undefined) {
      updates.push(`position = $${n++}`);
      params.push(Number(body.position));
    }
    if (body.metadata !== undefined) {
      updates.push(`metadata = $${n++}::jsonb`);
      params.push(JSON.stringify(body.metadata));
    }
    if (body.archived_at !== undefined) {
      updates.push(`archived_at = $${n++}`);
      params.push(body.archived_at ? new Date(body.archived_at) : null);
    }
    if (updates.length === 0) {
      res.status(400).json({ error: 'Nenhum campo para atualizar' });
      return;
    }

    let kanbanAutoPending: KanbanAutoCreatedProposalPayload | null = null;

    client = await pool.connect();
    await beginKanbanTxWithRls(client, tenantId, userId);

    const sourceColumnIdBeforeUpdate = String(card.column_id);

    let attendancePatch: Record<string, unknown> | null = null;
    let emitCtx: { tenantId: string | null; ownerUserId: string } | null = null;
    let orgRulesApplied = false;
    let phase2Ctx: KanbanPhase2AutomationContext | null = null;

    if (columnChanged && body.column_id && destColForRules) {
      const moveReason =
        typeof body.move_reason === 'string' && body.move_reason.trim()
          ? body.move_reason.trim().slice(0, 2000)
          : null;
      try {
        const side = await applyKanbanDestColumnEnterSideEffectsBeforeCardUpdate(client, {
          tenantId,
          actorUserId: userId,
          boardId: String(card.board_id),
          boardLinkedFunnelId: (board.linked_sales_funnel_id as string | null) ?? null,
          destColumn: {
            id: String(destColForRules.id),
            name: String(destColForRules.name),
            metadata: destColForRules.metadata,
            funnel_stage_id: (destColForRules.funnel_stage_id as string | null) ?? null,
          },
          destColumnId: body.column_id,
          cardId,
          conversationId: String(card.conversation_id),
          moveReason,
        });
        attendancePatch = side.attendancePatch;
        emitCtx = side.emitCtx;
        orgRulesApplied = side.orgRulesApplied;
        phase2Ctx = side.phase2Ctx;
      } catch (e: any) {
        await client.query('ROLLBACK');
        client.release();
        client = null;
        if (e?.code === 'CHAT_ATTENDANCE_MIGRATION_REQUIRED') {
          res.status(503).json({
            error: e.message || 'Migration de atendimento necessária',
            code: e.code,
          });
          return;
        }
        if (e?.code === 'FORBIDDEN') {
          res.status(403).json({ error: e.message || 'Sem permissão' });
          return;
        }
        if (e?.code === 'NOT_FOUND') {
          res.status(404).json({ error: 'Conversa não encontrada' });
          return;
        }
        if (e?.code === 'BAD_REQUEST') {
          res.status(400).json({ error: e.message || 'Pedido inválido' });
          return;
        }
        throw e;
      }
    }

    updates.push(`updated_by_user_id = $${n++}`);
    params.push(userId);
    const idParam = n++;
    const tenantParam = n++;
    params.push(cardId, tenantId);
    const r = await client.query(
      `UPDATE chat_kanban_cards SET ${updates.join(', ')} WHERE id = $${idParam} AND tenant_id = $${tenantParam}
       RETURNING *`,
      params,
    );

    if (columnChanged && destColForRules) {
      try {
        const postRes = await runKanbanDestColumnPostUpdateAutomations(client, {
          tenantId,
          actorUserId: userId,
          boardId: String(board.id),
          boardLinkedFunnelId: (board.linked_sales_funnel_id as string | null) ?? null,
          destColumn: {
            id: String(destColForRules.id),
            name: String(destColForRules.name),
            metadata: destColForRules.metadata,
            funnel_stage_id: (destColForRules.funnel_stage_id as string | null) ?? null,
          },
          cardId,
          conversationId: String(card.conversation_id),
        });
        if (postRes.kanban_auto_created_proposal) {
          kanbanAutoPending = postRes.kanban_auto_created_proposal;
        }
      } catch (e: any) {
        await client.query('ROLLBACK');
        client.release();
        client = null;
        console.error('[chatKanban] patchCard column automations', e);
        if (e?.code === 'BAD_REQUEST') {
          res.status(400).json({ error: e.message || 'Falha numa automação da coluna.' });
          return;
        }
        if (e?.code === 'NOT_FOUND') {
          res.status(404).json({ error: e.message || 'Conversa não encontrada' });
          return;
        }
        res.status(500).json({ error: e?.message || 'Erro ao aplicar automações da coluna.' });
        return;
      }
    }

    await client.query('COMMIT');

    let kanbanAutoForResponse: KanbanAutoCreatedProposalPayload | undefined;
    if (kanbanAutoPending && tenantId) {
      kanbanAutoForResponse = { ...kanbanAutoPending, public_link_path: null };
      try {
        const { rawToken } = await issueNewPublicTokenForProposal({
          proposalId: kanbanAutoPending.id,
          tenantId,
        });
        const public_link_path = proposalPublicLinkPathFromRawToken(rawToken);
        try {
          await saveProposalPublicLinkCiphertext(kanbanAutoPending.id, rawToken);
        } catch (saveErr: unknown) {
          const code =
            typeof saveErr === 'object' && saveErr !== null && 'code' in saveErr
              ? String((saveErr as { code: unknown }).code)
              : '';
          if (code !== '42703') throw saveErr;
        }
        kanbanAutoForResponse = { ...kanbanAutoPending, public_link_path };
      } catch (e) {
        console.error('[chatKanban] patchCard auto proposal link público', e);
      }
    }

    if (columnChanged && destColForRules) {
      const schedClient = await pool.connect();
      try {
        await beginKanbanTxWithRls(schedClient, tenantId, userId);
        await cancelPendingScheduledMovesForCardColumn(
          schedClient,
          tenantId,
          cardId,
          sourceColumnIdBeforeUpdate,
          'card_left_source_column',
          userId,
        );
        await insertScheduledMoveIfColumnConfigured(schedClient, {
          tenantId,
          boardId: String(card.board_id),
          cardId,
          conversationId: String(card.conversation_id),
          columnId: String(destColForRules.id),
          columnMetadata: destColForRules.metadata,
          actorUserId: userId,
        });
        await schedClient.query('COMMIT');
      } catch (schedErr: unknown) {
        try {
          await schedClient.query('ROLLBACK');
        } catch {
          /* ignore */
        }
        console.error('[chatKanban] patchCard schedule sync after move (cartão já gravado)', schedErr);
      } finally {
        schedClient.release();
      }
    }

    if (attendancePatch && emitCtx) {
      emitKanbanAttendanceIfNeeded(emitCtx.tenantId, emitCtx.ownerUserId, attendancePatch);
    }

    if (columnChanged && orgRulesApplied && !attendancePatch) {
      const cr = await pool.query<{ owner_tenant_id: string | null; owner_user_id: string }>(
        `SELECT owner.tenant_id AS owner_tenant_id, c.user_id AS owner_user_id
         FROM chat_conversations c
         INNER JOIN users owner ON owner.id = c.user_id
         WHERE c.id = $1
         LIMIT 1`,
        [card.conversation_id],
      );
      const row = cr.rows[0];
      if (row) {
        emitKanbanAttendanceIfNeeded(row.owner_tenant_id, row.owner_user_id, {
          id: card.conversation_id,
        });
      }
    }

    let payload: Record<string, unknown> = r.rows[0];
    try {
      const enriched = await loadEnrichedKanbanCard(tenantId, cardId);
      if (enriched) {
        payload = enriched as Record<string, unknown>;
        if (phase2Ctx) {
          phase2Ctx = {
            ...phase2Ctx,
            conversationDisplayName:
              (enriched.conv_display_name as string | null | undefined) ??
              (enriched.conv_contact_name as string | null | undefined) ??
              null,
            conversationClientId:
              (enriched.conv_client_id as string | null | undefined) ??
              phase2Ctx.conversationClientId,
            conversationLeadId:
              (enriched.conv_lead_id as string | null | undefined) ??
              phase2Ctx.conversationLeadId,
            assignedToUserId:
              (enriched.conv_assigned_to_user_id as string | null | undefined) ??
              phase2Ctx.assignedToUserId,
            assignedTeamId:
              (enriched.conv_assigned_team_id as string | null | undefined) ??
              phase2Ctx.assignedTeamId,
            queueId:
              (enriched.conv_queue_id as string | null | undefined) ??
              phase2Ctx.queueId,
            attendanceStatus:
              (enriched.conv_attendance_status as string | null | undefined) ??
              phase2Ctx.attendanceStatus,
          };
        }
      }
    } catch (enrichErr) {
      console.warn('[chatKanban] patchCard enrich failed', enrichErr);
      if (phase2Ctx) {
        try {
          const convFallback = await pool.query<{
            display_name: string | null;
            contact_name: string | null;
            assigned_to_user_id: string | null;
            assigned_team_id: string | null;
            attendance_status: string | null;
              client_id: string | null;
              lead_id: string | null;
              queue_id: string | null;
          }>(
            `SELECT display_name, contact_name, assigned_to_user_id, assigned_team_id, attendance_status, client_id, lead_id, queue_id
             FROM chat_conversations
             WHERE id = $1
             LIMIT 1`,
            [card.conversation_id],
          );
          const conv = convFallback.rows[0];
          if (conv) {
            phase2Ctx = {
              ...phase2Ctx,
              conversationDisplayName: conv.display_name ?? conv.contact_name ?? null,
              conversationClientId: conv.client_id ?? phase2Ctx.conversationClientId,
              conversationLeadId: conv.lead_id ?? phase2Ctx.conversationLeadId,
              assignedToUserId: conv.assigned_to_user_id ?? phase2Ctx.assignedToUserId,
              assignedTeamId: conv.assigned_team_id ?? phase2Ctx.assignedTeamId,
              queueId: conv.queue_id ?? phase2Ctx.queueId,
              attendanceStatus: conv.attendance_status ?? phase2Ctx.attendanceStatus,
            };
          }
        } catch (fallbackErr) {
          console.warn('[chatKanban] patchCard phase2 fallback enrich failed', fallbackErr);
        }
      }
    }

    if (columnChanged && phase2Ctx) {
      try {
        const boardRes = await pool.query<{ name: string }>(
          `SELECT name FROM chat_kanban_boards WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
          [phase2Ctx.boardId, tenantId],
        );
        if (boardRes.rows[0]) {
          phase2Ctx = { ...phase2Ctx, boardName: boardRes.rows[0].name };
        }
      } catch (boardNameErr) {
        console.warn('[chatKanban] patchCard board name enrich failed', boardNameErr);
      }
      runKanbanPhase2Automations(phase2Ctx).catch((automationErr) => {
        console.error('[chatKanban] phase2 automations failed', {
          cardId,
          conversationId: card.conversation_id,
          error: automationErr,
        });
      });
    }
    if (kanbanAutoForResponse) {
      payload.kanban_auto_created_proposal = kanbanAutoForResponse;
    }
    res.json(payload);
  } catch (e: any) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
    }
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.errors.map((x) => x.message).join('; ') });
      return;
    }
    console.error('[chatKanban] patchCard', e);
    res.status(500).json({ error: e?.message || 'Erro' });
  } finally {
    if (client) {
      client.release();
    }
  }
}

export async function deleteCard(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const { cardId } = req.params;
    const card = await loadCard(tenantId, cardId);
    if (!card) {
      res.status(404).json({ error: 'Card não encontrado' });
      return;
    }
    if (!(await requireVisibleKanbanBoard(req, res, tenantId, String(card.board_id)))) return;
    const cx = await pool.connect();
    try {
      await beginKanbanTxWithRls(cx, tenantId, userId);
      await cancelPendingScheduledMovesForEntireCard(cx, tenantId, cardId, 'card_deleted');
      await cx.query(`DELETE FROM chat_kanban_cards WHERE id = $1 AND tenant_id = $2`, [cardId, tenantId]);
      await cx.query('COMMIT');
    } catch (de) {
      try {
        await cx.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw de;
    } finally {
      cx.release();
    }
    res.status(204).send();
  } catch (e: any) {
    console.error('[chatKanban] deleteCard', e);
    res.status(500).json({ error: e?.message || 'Erro' });
  }
}
