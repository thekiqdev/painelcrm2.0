import { pool } from '../utils/db.js';

export type TenantUserAdminAuditEvent =
  | 'user_profile_updated'
  | 'user_password_changed_by_admin'
  | 'user_chat_sender_name_setting_changed';

export async function logTenantUserAdminAudit(params: {
  tenantId: string;
  adminUserId: string;
  targetUserId: string;
  eventType: TenantUserAdminAuditEvent;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    await pool.query(
      `
      INSERT INTO tenant_user_admin_audit (tenant_id, admin_user_id, target_user_id, event_type, payload)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::jsonb)
      `,
      [
        params.tenantId,
        params.adminUserId,
        params.targetUserId,
        params.eventType,
        JSON.stringify(params.payload),
      ]
    );
  } catch (e) {
    console.error('[tenantUserAdminAudit] insert failed', e);
  }
}
