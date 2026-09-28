import { pool } from '../utils/db.js';

export type ChatScheduledMessageRow = {
  id: string;
  tenant_id: string;
  conversation_id: string;
  instance_id: string | null;
  client_id: string | null;
  lead_id: string | null;
  scheduled_by_user_id: string;
  message_text: string;
  scheduled_at: string;
  status: string;
  sent_at: string | null;
  cancelled_at: string | null;
  cancelled_by_user_id: string | null;
  failure_reason: string | null;
  provider_message_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const STALE_PROCESSING_MINUTES = 15;

export async function resetStaleProcessingScheduledMessages(): Promise<number> {
  const r = await pool.query(
    `
    UPDATE public.chat_scheduled_messages
    SET status = 'scheduled', updated_at = now()
    WHERE status = 'processing'
      AND updated_at < now() - ($1::integer * interval '1 minute')
    `,
    [STALE_PROCESSING_MINUTES],
  );
  return r.rowCount ?? 0;
}

export async function claimDueScheduledMessages(limit: number): Promise<ChatScheduledMessageRow[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sel = await client.query<{ id: string }>(
      `
      SELECT id FROM public.chat_scheduled_messages
      WHERE status = 'scheduled' AND scheduled_at <= now()
      ORDER BY scheduled_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT $1
      `,
      [limit],
    );
    const ids = sel.rows.map((r) => r.id);
    if (ids.length === 0) {
      await client.query('COMMIT');
      return [];
    }
    const upd = await client.query(
      `
      UPDATE public.chat_scheduled_messages
      SET status = 'processing', updated_at = now()
      WHERE id = ANY($1::uuid[])
      RETURNING *
      `,
      [ids],
    );
    await client.query('COMMIT');
    return upd.rows as ChatScheduledMessageRow[];
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
}

export async function markScheduledMessageSent(
  id: string,
  providerMessageId: string | null,
): Promise<void> {
  await pool.query(
    `
    UPDATE public.chat_scheduled_messages
    SET status = 'sent',
        sent_at = now(),
        provider_message_id = $2,
        updated_at = now()
    WHERE id = $1::uuid
    `,
    [id, providerMessageId],
  );
}

export async function markScheduledMessageFailed(id: string, reason: string): Promise<void> {
  await pool.query(
    `
    UPDATE public.chat_scheduled_messages
    SET status = 'failed',
        failure_reason = $2,
        updated_at = now()
    WHERE id = $1::uuid
    `,
    [id, reason.slice(0, 2000)],
  );
}

export async function insertScheduledMessage(params: {
  tenantId: string;
  conversationId: string;
  instanceId: string | null;
  clientId: string | null;
  leadId: string | null;
  scheduledByUserId: string;
  messageText: string;
  scheduledAt: Date;
  metadata?: Record<string, unknown>;
}): Promise<ChatScheduledMessageRow> {
  const meta = { ...(params.metadata ?? {}) };
  const r = await pool.query(
    `
    INSERT INTO public.chat_scheduled_messages (
      tenant_id, conversation_id, instance_id, client_id, lead_id,
      scheduled_by_user_id, message_text, scheduled_at, status, metadata
    )
    VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7, $8::timestamptz, 'scheduled', $9::jsonb)
    RETURNING *
    `,
    [
      params.tenantId,
      params.conversationId,
      params.instanceId,
      params.clientId,
      params.leadId,
      params.scheduledByUserId,
      params.messageText,
      params.scheduledAt.toISOString(),
      JSON.stringify(meta),
    ],
  );
  return r.rows[0] as ChatScheduledMessageRow;
}

export async function listScheduledMessagesForConversation(params: {
  tenantId: string;
  conversationId: string;
  limit: number;
}): Promise<ChatScheduledMessageRow[]> {
  const r = await pool.query(
    `
    SELECT m.*
    FROM public.chat_scheduled_messages m
    INNER JOIN public.chat_conversations c ON c.id = m.conversation_id
    INNER JOIN public.users u ON u.id = c.user_id
    WHERE m.conversation_id = $1::uuid
      AND u.tenant_id = $2::uuid
      AND m.tenant_id = $2::uuid
      AND m.status IN ('scheduled', 'processing')
    ORDER BY m.scheduled_at DESC
    LIMIT $3
    `,
    [params.conversationId, params.tenantId, params.limit],
  );
  return r.rows as ChatScheduledMessageRow[];
}

export async function cancelScheduledMessage(params: {
  id: string;
  tenantId: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  const r = await pool.query(
    `
    UPDATE public.chat_scheduled_messages m
    SET status = 'cancelled',
        cancelled_at = now(),
        cancelled_by_user_id = $3::uuid,
        updated_at = now()
    FROM public.chat_conversations c
    INNER JOIN public.users u ON u.id = c.user_id
    WHERE m.id = $1::uuid
      AND m.conversation_id = c.id
      AND u.tenant_id = $2::uuid
      AND m.tenant_id = $2::uuid
      AND m.status = 'scheduled'
    RETURNING m.id
    `,
    [params.id, params.tenantId, params.userId],
  );
  if (!r.rowCount) return { ok: false, code: 'not_found_or_invalid_state' };
  return { ok: true };
}

export async function patchScheduledMessage(params: {
  id: string;
  tenantId: string;
  messageText: string;
  scheduledAt: Date;
}): Promise<{ ok: true; row: ChatScheduledMessageRow } | { ok: false; code: string }> {
  const r = await pool.query(
    `
    UPDATE public.chat_scheduled_messages m
    SET message_text = $3,
        scheduled_at = $4::timestamptz,
        updated_at = now()
    WHERE m.id = $1::uuid
      AND m.tenant_id = $2::uuid
      AND m.status = 'scheduled'
    RETURNING *
    `,
    [params.id, params.tenantId, params.messageText, params.scheduledAt.toISOString()],
  );
  if (!r.rowCount) return { ok: false, code: 'not_found_or_invalid_state' };
  return { ok: true, row: r.rows[0] as ChatScheduledMessageRow };
}
