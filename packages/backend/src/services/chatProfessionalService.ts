import { pool } from '../utils/db.js';

export async function hasChatConversationTransfersTable(): Promise<boolean> {
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'chat_conversation_transfers'`
  );
  return (r.rows[0]?.c ?? '0') === '1';
}

export async function insertChatTransferRow(params: {
  tenantId: string;
  conversationId: string;
  fromUserId: string | null;
  fromTeamId: string | null;
  fromQueueId: string | null;
  toUserId: string | null;
  toTeamId: string | null;
  toQueueId: string | null;
  transferredBy: string;
  reason: string | null;
}): Promise<void> {
  if (!(await hasChatConversationTransfersTable())) return;
  await pool.query(
    `INSERT INTO chat_conversation_transfers (
      tenant_id, conversation_id, from_user_id, from_team_id, from_queue_id,
      to_user_id, to_team_id, to_queue_id, transferred_by, reason
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      params.tenantId,
      params.conversationId,
      params.fromUserId,
      params.fromTeamId,
      params.fromQueueId,
      params.toUserId,
      params.toTeamId,
      params.toQueueId,
      params.transferredBy,
      params.reason,
    ]
  );
}

export async function listTransfersForConversation(
  tenantId: string,
  conversationId: string,
  limit: number
): Promise<Record<string, unknown>[]> {
  if (!(await hasChatConversationTransfersTable())) return [];
  const r = await pool.query(
    `SELECT t.*,
            fu.email AS from_user_email,
            tu.email AS to_user_email,
            tb.email AS transferred_by_email
     FROM chat_conversation_transfers t
     LEFT JOIN users fu ON fu.id = t.from_user_id
     LEFT JOIN users tu ON tu.id = t.to_user_id
     LEFT JOIN users tb ON tb.id = t.transferred_by
     WHERE t.tenant_id = $1 AND t.conversation_id = $2
     ORDER BY t.transferred_at DESC
     LIMIT $3`,
    [tenantId, conversationId, limit]
  );
  return r.rows as Record<string, unknown>[];
}
