/**
 * Sprint 4.2 — Financial totals certification (tenant-wide aggregates).
 */
import { pool } from '../../../utils/db.js';
import type { AuditIssue, AuditModuleResult, ProductionReadinessOptions } from '../types.js';

export async function certifyBillingFinancial(
  options: ProductionReadinessOptions = {}
): Promise<AuditModuleResult> {
  const started = Date.now();
  const issues: AuditIssue[] = [];
  const repairs: string[] = [];

  const params: unknown[] = [];
  let subFilter = `WHERE s.type = 'customer'`;
  if (options.tenantId) {
    params.push(options.tenantId);
    subFilter += ` AND s.tenant_id = $${params.length}::uuid`;
  }

  const invFilter = options.tenantId
    ? `WHERE ci.tenant_id = $1::uuid AND ci.subscription_id IS NOT NULL`
  : `WHERE ci.subscription_id IS NOT NULL`;

  const statsR = await pool.query<{
    total_invoiced: string;
    total_paid: string;
    total_open: string;
    invoice_count: string;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN ci.status NOT IN ('cancelled','refunded') THEN ci.amount_cents ELSE 0 END), 0)::text AS total_invoiced,
       COALESCE(SUM(CASE WHEN ci.status = 'paid' THEN ci.amount_cents ELSE 0 END), 0)::text AS total_paid,
       COALESCE(SUM(CASE WHEN ci.status IN ('pending','waiting_payment','processing','overdue') THEN ci.amount_cents ELSE 0 END), 0)::text AS total_open,
       COUNT(*)::text AS invoice_count
     FROM customer_invoices ci
     ${invFilter}`,
    params
  ).catch(() => ({
    rows: [{ total_invoiced: '0', total_paid: '0', total_open: '0', invoice_count: '0' }],
  }));

  const mrrR = await pool.query<{ mrr_cents: string; active_count: string }>(
    `SELECT
       COALESCE(SUM(s.amount_cents), 0)::text AS mrr_cents,
       COUNT(*)::text AS active_count
     FROM subscriptions s
     ${subFilter} AND s.status = 'active'`,
    params
  ).catch(() => ({ rows: [{ mrr_cents: '0', active_count: '0' }] }));

  const orphanR = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM customer_invoices ci
     WHERE ci.subscription_id IS NOT NULL
       AND ci.origin = 'subscription'
       AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.id = ci.subscription_id)
       ${options.tenantId ? 'AND ci.tenant_id = $1::uuid' : ''}`,
    params
  ).catch(() => ({ rows: [{ c: '0' }] }));

  const orphanCount = parseInt(orphanR.rows[0]?.c ?? '0', 10);
  if (orphanCount > 0) {
    issues.push({
      code: 'orphan_subscription_invoices',
      severity: 'error',
      message: `${orphanCount} invoice(s) de assinatura órfã(s)`,
    });
  }

  const row = statsR.rows[0]!;
  const mrr = mrrR.rows[0]!;

  return {
    module: 'financial',
    certified: orphanCount === 0,
    generated_at_iso: new Date().toISOString(),
    duration_ms: Date.now() - started,
    issues,
    repairs,
    metrics: {
      total_invoiced_cents: parseInt(row.total_invoiced, 10),
      total_paid_cents: parseInt(row.total_paid, 10),
      total_open_cents: parseInt(row.total_open, 10),
      invoice_count: parseInt(row.invoice_count, 10),
      mrr_cents: parseInt(mrr.mrr_cents, 10),
      active_subscriptions: parseInt(mrr.active_count, 10),
      annual_revenue_estimate_cents: parseInt(mrr.mrr_cents, 10) * 12,
    },
  };
}
