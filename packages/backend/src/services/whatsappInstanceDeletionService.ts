/**
 * Remoção completa de uma instância WhatsApp (UazAPI) no CRM: provedor + BD + notificações órfãs.
 *
 * Auditoria de dados (escopo desta eliminação):
 * - `chat_instances` — DELETE explícito (owner).
 * - `chat_conversations` / `chat_messages` — ON DELETE CASCADE desde chat_instances (schema base).
 * - Filhos típicos em `chat_conversations` (kanban links, SLA, etc.) — CASCADE na conversa.
 * - `notifications` — JSON `data.conversation_id`; DELETE manual (sem FK).
 * - `chat_group_admin_audit` — FK instance_id → CASCADE em chat_instances.
 * Outros tenants: não afetados (WHERE id + user_id dono).
 */
import type { Pool, PoolClient } from 'pg';
import { uazapiService } from './uazapi.js';

export type ChatInstanceDeletionAudit = {
  instance_id: string;
  owner_user_id: string;
  notifications_deleted: number;
  provider_disconnect_attempted: boolean;
  provider_disconnect_error?: string;
  provider_delete_ok: boolean;
  provider_delete_http_status?: number;
  provider_delete_note?: string;
};

/** Remove notificações internas que referenciam conversas desta instância (JSON data, sem FK). */
export async function purgeNotificationsForChatInstance(client: PoolClient, instanceId: string): Promise<number> {
  const r = await client.query(
    `DELETE FROM notifications n
     WHERE COALESCE(n.data->>'conversation_id','') IN (SELECT id::text FROM chat_conversations WHERE instance_id = $1::uuid)
        OR COALESCE(n.data->>'conversationId','') IN (SELECT id::text FROM chat_conversations WHERE instance_id = $1::uuid)`,
    [instanceId],
  );
  return r.rowCount ?? 0;
}

async function tryDisconnectProvider(instanceToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await uazapiService.disconnectInstance(instanceToken);
    return { ok: true };
  } catch (e: unknown) {
    const st = typeof e === 'object' && e !== null && 'status' in e ? Number((e as { status: unknown }).status) : undefined;
    return {
      ok: false,
      error: st != null ? `http_${st}` : e instanceof Error ? e.message.slice(0, 120) : 'disconnect_failed',
    };
  }
}

/**
 * DELETE da linha em chat_instances + purge de notifications.
 * Provedor UazAPI: disconnect + delete (best-effort, antes da transação BD).
 */
export async function deleteChatInstanceComplete(
  pool: Pool,
  instanceId: string,
  ownerUserId: string,
): Promise<{ deleted: boolean; audit: ChatInstanceDeletionAudit | null }> {
  const sel = await pool.query<{
    id: string;
    user_id: string;
    instance_token: string;
    external_instance_name: string | null;
  }>(
    `SELECT id::text, user_id::text, instance_token, external_instance_name
     FROM chat_instances WHERE id = $1::uuid AND user_id = $2::uuid`,
    [instanceId, ownerUserId],
  );
  const row = sel.rows[0];
  if (!row) return { deleted: false, audit: null };

  const token = row.instance_token?.trim();
  let provider_disconnect_attempted = false;
  let provider_disconnect_error: string | undefined;
  let disc: { ok: boolean; error?: string } = { ok: true };
  if (token) {
    provider_disconnect_attempted = true;
    disc = await tryDisconnectProvider(token);
    if (!disc.ok) provider_disconnect_error = disc.error;
  }

  const provDel = token ? await uazapiService.deleteInstanceAtProvider(token) : { ok: false as const, note: 'no_token' };

  const client = await pool.connect();
  let notifications_deleted = 0;
  try {
    await client.query('BEGIN');
    notifications_deleted = await purgeNotificationsForChatInstance(client, instanceId);
    const del = await client.query(`DELETE FROM chat_instances WHERE id = $1::uuid AND user_id = $2::uuid`, [
      instanceId,
      ownerUserId,
    ]);
    await client.query('COMMIT');
    const deleted = (del.rowCount ?? 0) > 0;
    const audit: ChatInstanceDeletionAudit = {
      instance_id: instanceId,
      owner_user_id: ownerUserId,
      notifications_deleted,
      provider_disconnect_attempted,
      provider_disconnect_error,
      provider_delete_ok: provDel.ok === true,
      provider_delete_http_status: provDel.httpStatus,
      provider_delete_note: provDel.note,
    };
    return { deleted, audit };
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
