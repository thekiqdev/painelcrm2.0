import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import { listCanonicalOpsBoardIds } from '../services/superadminOpsKanbanFoundation.js';
import { ensureSuperadminOpsKanbanSeed } from '../services/superadminOpsKanbanSeedService.js';
type BootstrapBody = { backfill?: boolean; backfillLimit?: number };

/**
 * POST /api/superadmin/ops/kanban/bootstrap
 *
 * Seed idempotente: 5 boards operacionais + colunas padrão + recuperação de leads.
 */
export async function bootstrapSuperadminOpsKanban(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ ok: false, error: 'Não autenticado' });
    return;
  }

  try {
    const body = (req.body ?? {}) as BootstrapBody;
    const backfill = body.backfill === true;
    const backfillLimit = typeof body.backfillLimit === 'number' ? body.backfillLimit : 500;

    const result = await ensureSuperadminOpsKanbanSeed(userId, {
      backfillLeads: backfill,
      backfillLimit,
      recoverLeads: true,
      recoverLimit: backfillLimit,
    });

    if (!result.ok) {
      const status = result.reason === 'ops_tenant_missing' ? 503 : 500;
      res.status(status).json({ ok: false, error: result.reason ?? 'seed_failed' });
      return;
    }

    const acquisition = result.boards.find((b) => b.name === 'Aquisição');

    res.json({
      ok: true,
      boards_created: result.boardsCreated,
      columns_added: result.columnsAdded,
      leads_synced: result.leadsSynced ?? 0,
      boards: result.boards,
      default_board_id: acquisition?.id ?? result.boards[0]?.id ?? null,
    });
  } catch (e) {
    console.error('[superadmin/ops/kanban] bootstrap_error', e);
    res.status(500).json({ ok: false, error: 'Erro ao inicializar Kanban operacional' });
  }
}

/**
 * GET /api/superadmin/ops/kanban/boards — seed + lista apenas boards canônicos (oculta duplicatas).
 */
export async function listSuperadminOpsBoards(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }

  try {
    const seed = await ensureSuperadminOpsKanbanSeed(userId, {
      backfillLeads: false,
      recoverLeads: false,
    });

    if (!seed.ok) {
      const status = seed.reason === 'ops_tenant_missing' ? 503 : 500;
      res.status(status).json({ ok: false, error: seed.reason ?? 'seed_failed' });
      return;
    }

    const canonicalIds = await listCanonicalOpsBoardIds();
    if (canonicalIds.size === 0) {
      res.json([]);
      return;
    }

    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(500).json({ error: 'Tenant operacional não configurado' });
      return;
    }

    const includeArchived =
      String(req.query.includeArchived || '') === '1' || String(req.query.includeArchived || '') === 'true';

    // Rota já exige Super Admin; coluna users.role não existe no schema.
    const isAdmin = true;

    const result = await pool.query(
      `SELECT
         b.*,
         ($3::boolean OR b.created_by_user_id = $2::uuid) AS current_user_can_manage
       FROM chat_kanban_boards b
       WHERE b.tenant_id = $1::uuid
         AND b.id = ANY($4::uuid[])
         AND ($5::boolean OR b.archived_at IS NULL)
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
       ORDER BY b.sort_order ASC, b.created_at ASC`,
      [tenantId, userId, isAdmin, Array.from(canonicalIds), includeArchived],
    );
    res.json(result.rows);
  } catch (e) {
    console.error('[superadmin/ops/kanban] list_boards', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Erro ao listar boards' });
  }
}

