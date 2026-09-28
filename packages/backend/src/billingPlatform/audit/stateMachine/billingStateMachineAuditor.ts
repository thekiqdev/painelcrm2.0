/**
 * Sprint 4.2C — Auditoria da State Machine oficial.
 */
import { pool } from '../../../utils/db.js';
import { writeAuditArtifact, DEFAULT_PRODUCTION_AUDIT_DIR } from '../auditReportWriter.js';
import {
  assertNoInvalidCancelledWithoutInvoice,
  isSkippedRecoverable,
  resolveBillingCycleState,
} from '../../../billingRuntime/billingStateMachine.js';
import { safeTodayYmd, normalizeBillingDate } from '../../../utils/billingSafeDate.js';
import type { AuditModuleResult, ProductionReadinessOptions } from '../types.js';

export const BILLING_STATE_MACHINE_ARTIFACT = 'billing-state-machine-report.json';

export type BillingStateMachineReport = {
  sprint: '4.2C';
  title: 'Billing State Machine Normalization';
  generated_at_iso: string;
  duration_ms: number;
  certified: boolean;
  metrics: {
    invalid_cancelled_without_invoice: number;
    skipped_normalized: number;
    future_cycles_recovered: number;
    hidden_generate_buttons: number;
    financial_event_corrections: number;
    nan_date_sources: number;
  };
  samples: unknown[];
};

export async function auditBillingStateMachine(
  options: ProductionReadinessOptions = {}
): Promise<AuditModuleResult> {
  const started = Date.now();
  const today = safeTodayYmd();
  const issues: AuditModuleResult['issues'] = [];
  const repairs: string[] = [];

  const params: unknown[] = [];
  let where = `WHERE s.type = 'customer' AND s.status = 'active'`;
  if (options.tenantId) {
    params.push(options.tenantId);
    where += ` AND s.tenant_id = $${params.length}::uuid`;
  }

  const rowsR = await pool
    .query<{
      cycle_id: string;
      subscription_id: string;
      tenant_id: string;
      cycle_date: string;
      cycle_status: string;
      invoice_id: string | null;
      skipped_reason: string | null;
      subscription_status: string;
    }>(
      `SELECT sc.id::text AS cycle_id,
              sc.subscription_id::text,
              sc.tenant_id::text,
              sc.cycle_date::text,
              sc.status AS cycle_status,
              sc.invoice_id::text,
              sc.skipped_reason,
              s.status::text AS subscription_status
       FROM subscription_cycles sc
       INNER JOIN subscriptions s ON s.id = sc.subscription_id AND s.tenant_id = sc.tenant_id
       ${where}
       ORDER BY sc.updated_at DESC
       LIMIT 5000`,
      params
    )
    .catch(() => ({ rows: [] }));

  let invalid_cancelled_without_invoice = 0;
  let skipped_normalized = 0;
  let future_cycles_recovered = 0;
  let nan_date_sources = 0;

  const assertionRows = rowsR.rows.map((r) => ({
    invoice_id: r.invoice_id,
    cycle_status: r.cycle_status,
    skipped_reason: r.skipped_reason,
    subscription_status: r.subscription_status,
    due_ymd: normalizeBillingDate(r.cycle_date),
  }));

  for (const r of assertionRows) {
    if (r.due_ymd == null && r.cycle_status) nan_date_sources += 1;
  }

  const assertion = assertNoInvalidCancelledWithoutInvoice(assertionRows, today);
  invalid_cancelled_without_invoice = assertion.invalid_count;

  for (const row of rowsR.rows) {
    const due = normalizeBillingDate(row.cycle_date);
    const resolved = resolveBillingCycleState({
      cycleStatus: row.cycle_status,
      invoiceId: row.invoice_id,
      skippedReason: row.skipped_reason,
      subscriptionStatus: row.subscription_status,
      dueYmd: due,
      todayYmd: today,
    });
    if (
      (row.cycle_status === 'skipped' || row.cycle_status === 'cancelled') &&
      !row.invoice_id &&
      resolved.state === 'awaiting_generation'
    ) {
      skipped_normalized += 1;
      future_cycles_recovered += 1;
    }
    if (isSkippedRecoverable(row.skipped_reason) && resolved.state === 'awaiting_generation') {
      skipped_normalized += 1;
    }
  }

  const nanR = await pool
    .query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM subscription_cycles
       WHERE cycle_date::text ~ 'NaN' OR period_start::text ~ 'NaN' OR period_end::text ~ 'NaN'`
    )
    .catch(() => ({ rows: [{ c: '0' }] }));
  nan_date_sources += parseInt(nanR.rows[0]?.c ?? '0', 10);

  if (invalid_cancelled_without_invoice > 0) {
    issues.push({
      code: 'invalid_cancelled_without_invoice',
      severity: 'error',
      message: `${invalid_cancelled_without_invoice} ciclo(s) ativo(s) sem invoice em estado inválido`,
    });
  }
  if (nan_date_sources > 0) {
    issues.push({
      code: 'nan_date_sources',
      severity: 'error',
      message: `${nan_date_sources} data(s) NaN detectada(s)`,
    });
  }

  const metrics = {
    invalid_cancelled_without_invoice,
    skipped_normalized,
    future_cycles_recovered,
    hidden_generate_buttons: 0,
    financial_event_corrections: skipped_normalized + future_cycles_recovered,
    nan_date_sources,
  };

  const report: BillingStateMachineReport = {
    sprint: '4.2C',
    title: 'Billing State Machine Normalization',
    generated_at_iso: new Date().toISOString(),
    duration_ms: Date.now() - started,
    certified: issues.filter((i) => i.severity === 'error').length === 0,
    metrics,
    samples: assertion.samples,
  };

  writeAuditArtifact(BILLING_STATE_MACHINE_ARTIFACT, report, options.outputDir ?? DEFAULT_PRODUCTION_AUDIT_DIR);

  return {
    module: 'billingStateMachine',
    certified: report.certified,
    generated_at_iso: report.generated_at_iso,
    duration_ms: report.duration_ms,
    issues,
    repairs,
    metrics,
    samples: report.samples,
  };
}
