import { pool } from './db.js';
import type { MessageTemplateContext } from './renderMessageTemplate.js';

/** Subconjunto de `KanbanPhase2AutomationContext` (evita import circular com o serviço de automação). */
export type KanbanAutomationTemplateCtxInput = {
  tenantId: string;
  actorUserId: string;
  boardName: string | null;
  columnName: string | null;
  conversationDisplayName: string | null;
  assignedTeamId: string | null;
};

/**
 * Contexto alinhado ao drawer (`buildKanbanDrawerTemplateContext`): placeholders mínimos para automação Kanban.
 */
export async function buildKanbanAutomationTemplateContext(
  ctx: KanbanAutomationTemplateCtxInput,
): Promise<MessageTemplateContext> {
  const contact = (ctx.conversationDisplayName ?? '').trim() || '';
  const column = (ctx.columnName ?? '').trim() || '';
  const board = (ctx.boardName ?? '').trim() || '';

  const out: MessageTemplateContext = {
    contact_name: contact,
    column_name: column,
    board_name: board,
  };

  try {
    const tenantRow = await pool.query<{ name: string }>(
      `SELECT name FROM tenants WHERE id = $1 LIMIT 1`,
      [ctx.tenantId],
    );
    const tn = tenantRow.rows[0]?.name?.trim();
    if (tn) out.company_name = tn;
  } catch {
    /* ignore */
  }

  try {
    const userRow = await pool.query<{ first_name: string | null; last_name: string | null; email: string | null }>(
      `SELECT first_name, last_name, email FROM users WHERE id = $1 LIMIT 1`,
      [ctx.actorUserId],
    );
    const u = userRow.rows[0];
    if (u) {
      const op =
        [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || (u.email ?? '').trim() || '';
      if (op) out.operator_name = op;
    }
  } catch {
    /* ignore */
  }

  if (ctx.assignedTeamId) {
    try {
      const teamRow = await pool.query<{ name: string }>(
        `SELECT name FROM teams WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [ctx.assignedTeamId, ctx.tenantId],
      );
      const teamName = teamRow.rows[0]?.name?.trim();
      if (teamName) out.team_name = teamName;
    } catch {
      /* ignore */
    }
  }

  return out;
}
