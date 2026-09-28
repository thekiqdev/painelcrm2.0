import { pool } from '../utils/db.js';

export type AuditAction =
  | 'tenant.created'
  | 'tenant.updated'
  | 'tenant.plan_changed'
  | 'tenant.deleted'
  | 'plan.created'
  | 'plan.updated'
  | 'plan.deleted'
  | string;

/**
 * Registra uma ação no log de auditoria do Super Admin.
 */
export async function logSuperAdminAction(
  userId: string,
  action: AuditAction,
  entityType: string,
  entityId: string | null,
  payload?: Record<string, unknown>
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO super_admin_audit_log (user_id, action, entity_type, entity_id, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, entityType, entityId ?? null, payload ? JSON.stringify(payload) : null]
    );
  } catch (e) {
    console.error('logSuperAdminAction error:', e);
  }
}

/**
 * Insere registro em tenant_plan (histórico de plano). Chamar ao criar tenant ou ao alterar plan_id.
 */
export async function insertTenantPlanHistory(
  tenantId: string,
  planId: string,
  startedAt: Date = new Date()
): Promise<void> {
  await pool.query(
    `INSERT INTO tenant_plan (tenant_id, plan_id, starts_at) VALUES ($1, $2, $3)`,
    [tenantId, planId, startedAt]
  );
}
