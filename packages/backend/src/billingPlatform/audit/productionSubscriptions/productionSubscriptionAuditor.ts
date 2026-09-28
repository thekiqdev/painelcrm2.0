/**
 * Sprint 4.2 — Audita todas as assinaturas CRM (type=customer).
 * Delega validação/reparo a validateBillingRuntime (4.1J).
 */
import { pool } from '../../../utils/db.js';
import { validateBillingRuntime } from '../../../billingRuntime/billingRuntimeValidator.js';
import { normalizeBillingDateFromDb } from '../../../billingRuntime/billingRuntimeAssertions.js';
import type { AuditIssue, AuditModuleResult, ProductionReadinessOptions } from '../types.js';

const VALID_STATUSES = new Set(['active', 'paused', 'past_due', 'trialing', 'cancelled']);

type SubRow = {
  id: string;
  tenant_id: string;
  status: string;
  next_billing_date: string | Date | null;
};

export async function auditProductionSubscriptions(
  options: ProductionReadinessOptions = {}
): Promise<AuditModuleResult> {
  const started = Date.now();
  const issues: AuditIssue[] = [];
  const repairs: string[] = [];
  const limit = Math.min(Math.max(options.subscriptionLimit ?? 5000, 1), 50000);
  const repair = options.repair !== false && !options.dryRun;

  const params: unknown[] = [];
  let where = `WHERE s.type = 'customer'`;
  if (options.tenantId) {
    params.push(options.tenantId);
    where += ` AND s.tenant_id = $${params.length}::uuid`;
  }
  params.push(limit);

  const subsR = await pool.query<SubRow>(
    `SELECT s.id::text, s.tenant_id::text, s.status, s.next_billing_date
     FROM subscriptions s
     ${where}
     ORDER BY s.updated_at DESC
     LIMIT $${params.length}`,
    params
  );

  let certifiedCount = 0;
  let failedCount = 0;
  const samples: unknown[] = [];

  for (const sub of subsR.rows) {
    if (!VALID_STATUSES.has(sub.status)) {
      issues.push({
        code: 'invalid_subscription_status',
        severity: 'error',
        message: `Status inválido: ${sub.status}`,
        subscription_id: sub.id,
        tenant_id: sub.tenant_id,
      });
      failedCount += 1;
      continue;
    }

    const nextYmd = normalizeBillingDateFromDb(sub.next_billing_date);
    if (sub.status === 'active' && !nextYmd) {
      issues.push({
        code: 'missing_next_billing_date',
        severity: 'error',
        message: 'Assinatura ativa sem next_billing_date válido',
        subscription_id: sub.id,
        tenant_id: sub.tenant_id,
      });
    }

    if (!repair) {
      if (sub.status === 'active' && nextYmd) certifiedCount += 1;
      continue;
    }

    const result = await validateBillingRuntime(sub.tenant_id, sub.id);
    for (const r of result.repairs) {
      repairs.push(`${sub.id}:${r}`);
    }
    if (!result.certified) {
      failedCount += 1;
      for (const i of result.issues.filter((x) => x.severity === 'error')) {
        issues.push({
          code: i.code,
          severity: 'error',
          message: i.message,
          subscription_id: sub.id,
          tenant_id: sub.tenant_id,
          meta: {
            cycle_date: i.cycle_date,
            invoice_id: i.invoice_id,
            job_id: i.job_id,
          },
        });
      }
      if (samples.length < 25) {
        samples.push({
          subscription_id: sub.id,
          tenant_id: sub.tenant_id,
          issues: result.issues,
          repairs: result.repairs,
        });
      }
    } else {
      certifiedCount += 1;
    }
  }

  const critical = issues.filter((i) => i.severity === 'error');
  const certified = failedCount === 0 && critical.length === 0;

  return {
    module: 'productionSubscriptions',
    certified,
    generated_at_iso: new Date().toISOString(),
    duration_ms: Date.now() - started,
    issues,
    repairs,
    metrics: {
      subscriptions_scanned: subsR.rows.length,
      subscriptions_certified: certifiedCount,
      subscriptions_failed: failedCount,
      repair_enabled: repair,
      dry_run: Boolean(options.dryRun),
    },
    samples,
  };
}
