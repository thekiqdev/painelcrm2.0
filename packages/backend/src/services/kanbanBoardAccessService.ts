import { pool } from '../utils/db.js';
import { isTenantAdmin } from '../utils/tenant.js';

export type KanbanBoardAccessRow = {
  id: string;
  tenant_id: string;
  created_by_user_id: string;
  is_active: boolean;
  visibility_mode: string;
};

export async function userCanViewKanbanBoard(
  tenantId: string,
  userId: string,
  board: KanbanBoardAccessRow,
): Promise<boolean> {
  if (board.tenant_id !== tenantId) return false;
  const admin = await isTenantAdmin(userId);
  if (admin) return true;
  if (String(board.created_by_user_id) === userId) return true;
  if (board.is_active === false) return false;
  if (board.visibility_mode === 'tenant_all') return true;
  const u = await pool.query(
    `SELECT 1 FROM chat_kanban_board_users WHERE board_id = $1 AND user_id = $2 LIMIT 1`,
    [board.id, userId],
  );
  if (u.rows.length > 0) return true;
  const t = await pool.query(
    `SELECT 1
     FROM chat_kanban_board_teams bt
     INNER JOIN team_members tm ON tm.team_id = bt.team_id AND tm.user_id = $2
     WHERE bt.board_id = $1
     LIMIT 1`,
    [board.id, userId],
  );
  return t.rows.length > 0;
}

export async function userCanManageKanbanBoard(userId: string, board: KanbanBoardAccessRow): Promise<boolean> {
  if (String(board.created_by_user_id) === userId) return true;
  return isTenantAdmin(userId);
}
