/**
 * Sprint 4.2 — Calendar / cycles / invoices consistency (delegates reconciliation).
 */
import { pool } from '../../../utils/db.js';
import { runSubscriptionCyclesReconciliation } from '../../../services/subscriptionCyclesReconciliationService.js';
import { normalizeBillingDateFromDb } from '../../../billingRuntime/billingRuntimeAssertions.js';
import type { AuditIssue, AuditModuleResult, ProductionReadinessOptions } from '../types.js';

export async function certifyCalendarConsistency(
  options: ProductionReadinessOptions = {}
): Promise<AuditModuleResult> {
  const started = Date.now();
  const issues: AuditIssue[] = [];
  const repairs: string[] = [];

  const reconciliation = await runSubscriptionCyclesReconciliation({ sampleLimit: 50 });
  const summary = reconciliation.summary;
  const totalIssues =
    summary.invoiced_cycle_missing_invoice_id +
    summary.customer_invoice_subscription_missing_cycle +
    summary.completed_job_customer_invoice_cycle_mismatch +
    summary.queued_cycle_without_active_job +
    summary.processing_cycle_without_processing_job +
    summary.terminal_cycle_missing_reason +
    summary.invoiced_cycle_invoice_orphan_or_wrong_subscription;

  if (totalIssues > 0) {
    issues.push({
      code: 'cycles_reconciliation_mismatch',
      severity: 'error',
      message: `${totalIssues} inconsistência(s) cycles×jobs×invoices`,
      meta: { ...summary },
    });
  }

  const params: unknown[] = [];
  let where = `WHERE s.type = 'customer' AND s.status = 'active'`;
  if (options.tenantId) {
    params.push(options.tenantId);
    where += ` AND s.tenant_id = $${params.length}::uuid`;
  }

  const activeR = await pool.query<{ id: string; next_billing_date: string | Date | null }>(
    `SELECT s.id::text, s.next_billing_date FROM subscriptions s ${where} LIMIT 2000`,
    params
  );

  let missingNext = 0;
  for (const row of activeR.rows) {
    if (!normalizeBillingDateFromDb(row.next_billing_date)) missingNext += 1;
  }
  if (missingNext > 0) {
    issues.push({
      code: 'active_without_next_charge',
      severity: 'error',
      message: `${missingNext} assinatura(s) ativa(s) sem próxima cobrança válida`,
    });
  }

  return {
    module: 'calendar',
    certified: totalIssues === 0 && missingNext === 0,
    generated_at_iso: new Date().toISOString(),
    duration_ms: Date.now() - started,
    issues,
    repairs,
    metrics: {
      reconciliation_table_exists: reconciliation.subscription_cycles_table_exists,
      reconciliation_issue_total: totalIssues,
      active_subscriptions_checked: activeR.rows.length,
      active_missing_next_billing: missingNext,
    },
    samples: [reconciliation.samples],
  };
}
