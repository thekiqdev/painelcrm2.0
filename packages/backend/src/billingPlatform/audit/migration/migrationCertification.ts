/**
 * Sprint 4.2 — Legacy subscription / billing plan migration certification.
 */
import { pool } from '../../../utils/db.js';
import { getSubscriptionById } from '../../../services/billingSubscriptionService.js';
import { repairBillingPlanForSubscription } from '../../provisioning/billingPlanRepairService.js';
import type { AuditIssue, AuditModuleResult, ProductionReadinessOptions } from '../types.js';

export async function certifyBillingMigration(
  options: ProductionReadinessOptions = {}
): Promise<AuditModuleResult> {
  const started = Date.now();
  const issues: AuditIssue[] = [];
  const repairs: string[] = [];
  const repair = options.repair !== false && !options.dryRun;

  const params: unknown[] = [];
  let where = `WHERE s.type = 'customer' AND s.status IN ('active','paused','past_due')`;
  if (options.tenantId) {
    params.push(options.tenantId);
    where += ` AND s.tenant_id = $${params.length}::uuid`;
  }

  const missingPlanR = await pool.query<{ id: string; tenant_id: string }>(
    `SELECT s.id::text, s.tenant_id::text
     FROM subscriptions s
     ${where}
       AND NOT EXISTS (
         SELECT 1 FROM billing_plans bp
         WHERE bp.subscription_id = s.id AND bp.tenant_id = s.tenant_id AND bp.status = 'active'
       )
     LIMIT 500`,
    params
  );

  const missingItemsR = await pool.query<{ id: string; tenant_id: string }>(
    `SELECT s.id::text, s.tenant_id::text
     FROM subscriptions s
     INNER JOIN billing_plans bp ON bp.subscription_id = s.id AND bp.tenant_id = s.tenant_id AND bp.status = 'active'
     WHERE s.type = 'customer'
       ${options.tenantId ? 'AND s.tenant_id = $1::uuid' : ''}
       AND NOT EXISTS (
         SELECT 1 FROM billing_plan_items bpi
         WHERE bpi.billing_plan_id = bp.id AND bpi.tenant_id = s.tenant_id
       )
     LIMIT 500`,
    params
  );

  let repairedPlans = 0;
  if (repair) {
    const toRepair = [...missingPlanR.rows, ...missingItemsR.rows];
    const seen = new Set<string>();
    for (const row of toRepair) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      try {
        const sub = await getSubscriptionById(row.id);
        if (!sub) continue;
        const result = await repairBillingPlanForSubscription(sub);
        if (result.createdPlan || result.createdItems) {
          repairedPlans += 1;
          repairs.push(`provisioned:${row.id}`);
        }
      } catch (e) {
        issues.push({
          code: 'migration_repair_failed',
          severity: 'warning',
          message: e instanceof Error ? e.message : String(e),
          subscription_id: row.id,
          tenant_id: row.tenant_id,
        });
      }
    }
  }

  const stillMissing = missingPlanR.rows.length + missingItemsR.rows.length - repairedPlans;
  if (stillMissing > 0 && !repair) {
    issues.push({
      code: 'legacy_missing_billing_plan',
      severity: 'error',
      message: `${stillMissing} assinatura(s) sem billing plan/items completo`,
    });
  }

  return {
    module: 'migration',
    certified: stillMissing <= 0 || repairedPlans >= missingPlanR.rows.length,
    generated_at_iso: new Date().toISOString(),
    duration_ms: Date.now() - started,
    issues,
    repairs,
    metrics: {
      missing_plan_count: missingPlanR.rows.length,
      missing_items_count: missingItemsR.rows.length,
      auto_repaired: repairedPlans,
      repair_enabled: repair,
    },
  };
}
