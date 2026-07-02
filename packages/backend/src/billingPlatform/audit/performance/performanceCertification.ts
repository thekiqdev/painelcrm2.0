/**
 * Sprint 4.2 — Performance harness (query timing on real DB, scaled samples).
 */
import { pool } from '../../../utils/db.js';
import { validateBillingRuntime } from '../../../billingRuntime/billingRuntimeValidator.js';
import type { AuditIssue, AuditModuleResult, ProductionReadinessOptions } from '../types.js';

const DATASET_TARGETS = [100, 1000, 5000] as const;

async function timeMs(fn: () => Promise<void>): Promise<number> {
  const t0 = Date.now();
  await fn();
  return Date.now() - t0;
}

export async function certifyBillingPerformance(
  options: ProductionReadinessOptions = {}
): Promise<AuditModuleResult> {
  const started = Date.now();
  const issues: AuditIssue[] = [];
  const repairs: string[] = [];
  const metrics: Record<string, number | string | boolean | null> = {};

  const countR = await pool.query<{ subs: string; inv: string; cycles: string }>(
    `SELECT
       (SELECT COUNT(*)::text FROM subscriptions WHERE type = 'customer') AS subs,
       (SELECT COUNT(*)::text FROM customer_invoices WHERE subscription_id IS NOT NULL) AS inv,
       (SELECT COUNT(*)::text FROM subscription_cycles) AS cycles`
  ).catch(() => ({ rows: [{ subs: '0', inv: '0', cycles: '0' }] }));

  metrics.subscriptions_total = parseInt(countR.rows[0]?.subs ?? '0', 10);
  metrics.invoices_total = parseInt(countR.rows[0]?.inv ?? '0', 10);
  metrics.cycles_total = parseInt(countR.rows[0]?.cycles ?? '0', 10);

  for (const target of DATASET_TARGETS) {
    const listMs = await timeMs(async () => {
      await pool.query(
        `SELECT id::text FROM subscriptions WHERE type = 'customer' ORDER BY updated_at DESC LIMIT $1`,
        [target]
      );
    });
    metrics[`list_${target}_subs_ms`] = listMs;
    if (listMs > 30_000) {
      issues.push({
        code: 'perf_list_slow',
        severity: 'warning',
        message: `Listagem ${target} assinaturas levou ${listMs}ms`,
      });
    }
  }

  const sampleR = await pool.query<{ id: string; tenant_id: string }>(
    `SELECT id::text, tenant_id::text FROM subscriptions WHERE type = 'customer' ORDER BY updated_at DESC LIMIT 3`
  );

  if (sampleR.rows.length > 0 && options.dryRun !== true) {
    const row = sampleR.rows[0]!;
    const detailMs = await timeMs(async () => {
      await validateBillingRuntime(row.tenant_id, row.id);
    });
    metrics.open_subscription_audit_ms = detailMs;
    if (detailMs > 15_000) {
      issues.push({
        code: 'perf_subscription_audit_slow',
        severity: 'warning',
        message: `validateBillingRuntime levou ${detailMs}ms`,
      });
    }
  }

  const certified = !issues.some((i) => i.severity === 'error');

  return {
    module: 'performance',
    certified,
    generated_at_iso: new Date().toISOString(),
    duration_ms: Date.now() - started,
    issues,
    repairs,
    metrics,
  };
}
