import { pool } from '../utils/db.js';

export type CommercialOverrideAuditAction = 'created' | 'updated' | 'disabled';

export async function insertCommercialOverrideAudit(input: {
  overrideId: string;
  tenantId: string;
  action: CommercialOverrideAuditAction;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  createdBy: string | null;
}): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO tenant_commercial_override_audit (
       override_id, tenant_id, action, before_json, after_json, created_by
     ) VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5::jsonb, $6::uuid)
     RETURNING id::text`,
    [
      input.overrideId,
      input.tenantId,
      input.action,
      input.beforeJson ? JSON.stringify(input.beforeJson) : null,
      input.afterJson ? JSON.stringify(input.afterJson) : null,
      input.createdBy,
    ],
  );
  return r.rows[0]?.id ?? '';
}
