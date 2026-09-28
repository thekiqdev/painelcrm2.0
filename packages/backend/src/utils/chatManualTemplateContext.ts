import { pool } from './db.js';
import type { MessageTemplateContext } from './renderMessageTemplate.js';

/**
 * Contexto de placeholders para envio manual de modelos WhatsApp (chat),
 * com dados mínimos da conversa + operador + empresa + equipe atribuída.
 */
export async function buildChatManualTemplateContext(params: {
  tenantId: string;
  actorUserId: string;
  conversationId: string;
}): Promise<MessageTemplateContext | null> {
  const conv = await pool.query<{
    display_name: string | null;
    contact_name: string | null;
    profile_name: string | null;
    assigned_team_id: string | null;
  }>(
    `SELECT c.display_name, c.contact_name, c.profile_name, c.assigned_team_id
     FROM chat_conversations c
     INNER JOIN users u ON u.id = c.user_id
     WHERE c.id = $1 AND u.tenant_id = $2
     LIMIT 1`,
    [params.conversationId, params.tenantId],
  );
  const row = conv.rows[0];
  if (!row) return null;

  const contact =
    (row.display_name ?? row.contact_name ?? row.profile_name ?? '').trim() || '';

  const out: MessageTemplateContext = {
    contact_name: contact,
    column_name: '',
    board_name: '',
  };

  try {
    const tenantRow = await pool.query<{ name: string }>(`SELECT name FROM tenants WHERE id = $1 LIMIT 1`, [
      params.tenantId,
    ]);
    const tn = tenantRow.rows[0]?.name?.trim();
    if (tn) out.company_name = tn;
  } catch {
    /* ignore */
  }

  try {
    const userRow = await pool.query<{ first_name: string | null; last_name: string | null; email: string | null }>(
      `SELECT first_name, last_name, email FROM users WHERE id = $1 LIMIT 1`,
      [params.actorUserId],
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

  if (row.assigned_team_id) {
    try {
      const teamRow = await pool.query<{ name: string }>(
        `SELECT name FROM teams WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [row.assigned_team_id, params.tenantId],
      );
      const teamName = teamRow.rows[0]?.name?.trim();
      if (teamName) out.team_name = teamName;
    } catch {
      /* ignore */
    }
  }

  return out;
}
