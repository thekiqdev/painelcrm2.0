/**
 * Kanban de conversas (Etapa D.2) — CRUD boards/colunas/cards.
 * Política P1: não altera funil CRM nem clients.funnel_stage.
 */
import { Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantId } from '../middleware/auth.js';
import { ensureTenantIdForInsert, ensureUserIdForInsert } from '../utils/tenantScope.js';
import {
  applyKanbanColumnEnterRules,
  applyKanbanColumnOrganizationRules,
  emitKanbanAttendanceIfNeeded,
  kanbanRulesRequireAttendanceMutation,
  kanbanRulesRequireOrganizationMutation,
  parseKanbanColumnRules,
} from '../utils/kanbanColumnRules.js';

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

/** Mesma projeção que `listCards`, para um cartão (resposta de PATCH com dados de conversa atualizados). */
async function loadEnrichedKanbanCard(tenantId: string, cardId: string) {
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
        c.avatar_url AS conv_avatar_url,
        c.attendance_status AS conv_attendance_status,
        c.assigned_to_user_id AS conv_assigned_to_user_id,
        c.assigned_team_id AS conv_assigned_team_id,
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
        END AS conv_link_state
      FROM chat_kanban_cards kc
      INNER JOIN chat_conversations c ON c.id = kc.conversation_id
      LEFT JOIN users assignee ON assignee.id = c.assigned_to_user_id
      LEFT JOIN profiles pf ON pf.id = assignee.id
      LEFT JOIN teams t_team ON t_team.id = c.assigned_team_id
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

export async function listBoards(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const includeArchived = String(req.query.includeArchived || '') === '1' || String(req.query.includeArchived || '') === 'true';
    const q = includeArchived
      ? `SELECT * FROM chat_kanban_boards WHERE tenant_id = $1 ORDER BY sort_order ASC, created_at ASC`
      : `SELECT * FROM chat_kanban_boards WHERE tenant_id = $1 AND archived_at IS NULL ORDER BY sort_order ASC, created_at ASC`;
    const result = await pool.query(q, [tenantId]);
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
    const row = await loadBoard(tenantId, boardId);
    if (!row) {
      res.status(404).json({ error: 'Board não encontrado' });
      return;
    }
    res.json(row);
  } catch (e: any) {
    console.error('[chatKanban] getBoard', e);
    res.status(500).json({ error: e?.message || 'Erro' });
  }
}

export async function createBoard(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = ensureTenantIdForInsert(req);
    const userId = ensureUserIdForInsert(req);
    const body = createBoardSchema.parse(req.body || {});
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
      res.status(403).json({ error: 'Usuário não vinculado a uma conta (tenant)' });
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
      updates.push(`linked_sales_funnel_id = $${n++}`);
      params.push(body.linked_sales_funnel_id);
    }
    if (updates.length === 0) {
      res.status(400).json({ error: 'Nenhum campo para atualizar' });
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
    const board = await loadBoard(tenantId, boardId);
    if (!board) {
      res.status(404).json({ error: 'Board não encontrado' });
      return;
    }
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
    const board = await loadBoard(tenantId, boardId);
    if (!board) {
      res.status(404).json({ error: 'Board não encontrado' });
      return;
    }
    let position = body.position;
    if (position === undefined) {
      const pr = await pool.query(
        `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM chat_kanban_columns WHERE board_id = $1`,
        [boardId],
      );
      position = pr.rows[0]?.p ?? 0;
    }
    const meta = body.metadata ?? {};
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
      res.status(403).json({ error: 'Usuário não vinculado a uma conta (tenant)' });
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
    const { columnId } = req.params;
    const body = patchColumnSchema.parse(req.body || {});
    const col = await loadColumn(tenantId, columnId);
    if (!col) {
      res.status(404).json({ error: 'Coluna não encontrada' });
      return;
    }
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
      updates.push(`funnel_stage_id = $${n++}`);
      params.push(body.funnel_stage_id);
    }
    if (body.metadata !== undefined) {
      updates.push(`metadata = $${n++}::jsonb`);
      params.push(JSON.stringify(body.metadata));
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
    const { columnId } = req.params;
    const col = await loadColumn(tenantId, columnId);
    if (!col) {
      res.status(404).json({ error: 'Coluna não encontrada' });
      return;
    }
    const cnt = await pool.query(
      `SELECT COUNT(*)::int AS n FROM chat_kanban_cards
       WHERE column_id = $1 AND tenant_id = $2 AND archived_at IS NULL`,
      [columnId, tenantId],
    );
    if ((cnt.rows[0]?.n ?? 0) > 0) {
      res.status(409).json({ error: 'Não é possível excluir coluna com cards; remova ou mova os cards primeiro' });
      return;
    }
    await pool.query(`DELETE FROM chat_kanban_columns WHERE id = $1 AND tenant_id = $2`, [columnId, tenantId]);
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
    const board = await loadBoard(tenantId, boardId);
    if (!board) {
      res.status(404).json({ error: 'Board não encontrado' });
      return;
    }
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
    const board = await loadBoard(tenantId, boardId);
    if (!board) {
      res.status(404).json({ error: 'Board não encontrado' });
      return;
    }
    const includeArchived = String(req.query.includeArchived || '') === 'true' || String(req.query.includeArchived || '') === '1';
    const archivedClause = includeArchived ? '' : 'AND kc.archived_at IS NULL';
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
        c.avatar_url AS conv_avatar_url,
        c.attendance_status AS conv_attendance_status,
        c.assigned_to_user_id AS conv_assigned_to_user_id,
        c.assigned_team_id AS conv_assigned_team_id,
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
        END AS conv_link_state
      FROM chat_kanban_cards kc
      INNER JOIN chat_conversations c ON c.id = kc.conversation_id
      LEFT JOIN users assignee ON assignee.id = c.assigned_to_user_id
      LEFT JOIN profiles pf ON pf.id = assignee.id
      LEFT JOIN teams t_team ON t_team.id = c.assigned_team_id
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
    const board = await loadBoard(tenantId, boardId);
    if (!board) {
      res.status(404).json({ error: 'Board não encontrado' });
      return;
    }
    const column = await loadColumn(tenantId, body.column_id);
    if (!column || column.board_id !== boardId) {
      res.status(400).json({ error: 'Coluna inválida ou não pertence a este board' });
      return;
    }
    const visible = await conversationVisibleToTenantUser(body.conversation_id, userId);
    if (!visible) {
      res.status(403).json({ error: 'Conversa não encontrada ou sem acesso para este tenant' });
      return;
    }
    const position = body.position !== undefined ? Number(body.position) : await nextCardPosition(body.column_id);
    const meta = body.metadata ?? {};
    const r = await pool.query(
      `INSERT INTO chat_kanban_cards (
        board_id, column_id, tenant_id, conversation_id, position, metadata, created_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      RETURNING *`,
      [boardId, body.column_id, tenantId, body.conversation_id, position, JSON.stringify(meta), userId],
    );
    res.status(201).json(r.rows[0]);
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
      res.status(403).json({ error: 'Autenticação ou tenant obrigatório' });
      return;
    }
    console.error('[chatKanban] createCard', e);
    res.status(500).json({ error: e?.message || 'Erro ao criar card' });
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

    client = await pool.connect();
    await client.query('BEGIN');

    let attendancePatch: Record<string, unknown> | null = null;
    let emitCtx: { tenantId: string | null; ownerUserId: string } | null = null;
    let orgRulesApplied = false;

    if (columnChanged && body.column_id && destColForRules) {
      const rules = parseKanbanColumnRules(destColForRules.metadata);
      const moveReason =
        typeof body.move_reason === 'string' && body.move_reason.trim()
          ? body.move_reason.trim().slice(0, 2000)
          : null;
      try {
        if (kanbanRulesRequireAttendanceMutation(rules)) {
          const applied = await applyKanbanColumnEnterRules(client, {
            conversationId: card.conversation_id as string,
            actorUserId: userId,
            rules,
            columnName: String(destColForRules.name),
            columnId: body.column_id,
            moveReason,
          });
          attendancePatch = applied.attendancePatch;
          emitCtx = applied.emit ?? null;
        }
        if (kanbanRulesRequireOrganizationMutation(rules)) {
          await applyKanbanColumnOrganizationRules(client, {
            conversationId: card.conversation_id as string,
            actorUserId: userId,
            rules,
            columnId: body.column_id,
            columnName: String(destColForRules.name),
            moveReason,
          });
          orgRulesApplied = true;
        }
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

    await client.query('COMMIT');

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
      if (enriched) payload = enriched as Record<string, unknown>;
    } catch (enrichErr) {
      console.warn('[chatKanban] patchCard enrich failed', enrichErr);
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
    const { cardId } = req.params;
    const card = await loadCard(tenantId, cardId);
    if (!card) {
      res.status(404).json({ error: 'Card não encontrado' });
      return;
    }
    await pool.query(`DELETE FROM chat_kanban_cards WHERE id = $1 AND tenant_id = $2`, [cardId, tenantId]);
    res.status(204).send();
  } catch (e: any) {
    console.error('[chatKanban] deleteCard', e);
    res.status(500).json({ error: e?.message || 'Erro' });
  }
}
