import { pool } from '../utils/db.js';

export type ChatGroupAdminAuditAction =
  | 'group_update_name'
  | 'group_update_description'
  | 'group_update_image'
  | 'group_reset_invite'
  | 'group_leave'
  | 'group_participants'
  | 'group_update_settings'
  | 'create_group_from_conversation';

export async function insertChatGroupAdminAudit(params: {
  tenantId: string | null;
  actorUserId: string;
  conversationId: string;
  instanceId: string;
  groupJid: string;
  action: ChatGroupAdminAuditAction;
  payload?: Record<string, unknown> | null;
  uazapiStatus?: number | null;
  errorMessage?: string | null;
}): Promise<void> {
  const success = params.errorMessage == null || params.errorMessage === '';
  await pool.query(
    `
    INSERT INTO chat_group_admin_audit (
      tenant_id, actor_user_id, conversation_id, instance_id, group_jid,
      action, payload, uazapi_status, error_message, success
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
    `,
    [
      params.tenantId,
      params.actorUserId,
      params.conversationId,
      params.instanceId,
      params.groupJid,
      params.action,
      params.payload ? JSON.stringify(params.payload) : null,
      params.uazapiStatus ?? null,
      params.errorMessage ?? null,
      success,
    ]
  );
}
