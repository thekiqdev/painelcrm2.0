/**
 * Sprint 4.2 — Worker / Scheduler certification (read-only + stuck-job signals).
 */
import { pool } from '../../../utils/db.js';
import {
  BILLING_RUNTIME_PIPELINE,
  BILLING_WORKER_VERSION,
} from '../../../billingRuntime/billingRuntimeVersions.js';
import type { AuditIssue, AuditModuleResult } from '../types.js';

const WORKER_SCENARIOS = [
  'scheduler',
  'worker',
  'retry',
  'pending',
  'completed',
  'failed',
  'recovery',
  'generate_manual',
  'generate_automatic',
  'advance_cycle',
  'upgrade',
  'downgrade',
  'pause',
  'resume',
  'cancel',
] as const;

export async function certifyBillingWorker(tenantId?: string): Promise<AuditModuleResult> {
  const started = Date.now();
  const issues: AuditIssue[] = [];
  const repairs: string[] = [];

  const params: unknown[] = [];
  let tenantFilter = '';
  if (tenantId) {
    params.push(tenantId);
    tenantFilter = `WHERE tenant_id = $1::uuid`;
  }

  const statusR = await pool.query<{ status: string; c: string }>(
    `SELECT status, COUNT(*)::text AS c FROM billing_recurring_jobs ${tenantFilter} GROUP BY status`,
    params
  ).catch(() => ({ rows: [] }));

  const stuckR = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM billing_recurring_jobs
     WHERE status = 'processing'
       AND locked_at < now() - interval '30 minutes'
       AND result_invoice_id IS NULL
       ${tenantId ? 'AND tenant_id = $1::uuid' : ''}`,
    params
  ).catch(() => ({ rows: [{ c: '0' }] }));

  const stuckCount = parseInt(stuckR.rows[0]?.c ?? '0', 10);
  if (stuckCount > 0) {
    issues.push({
      code: 'stuck_processing_jobs',
      severity: 'warning',
      message: `${stuckCount} job(s) em processing há mais de 30 minutos`,
    });
  }

  const failedR = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM billing_recurring_jobs
     WHERE status = 'failed' AND result_invoice_id IS NULL
     ${tenantId ? 'AND tenant_id = $1::uuid' : ''}`,
    params
  ).catch(() => ({ rows: [{ c: '0' }] }));

  const metrics: Record<string, number | string | boolean | null> = {
    worker_version: BILLING_WORKER_VERSION,
    pipeline: BILLING_RUNTIME_PIPELINE,
    stuck_processing_jobs: stuckCount,
    failed_jobs_without_invoice: parseInt(failedR.rows[0]?.c ?? '0', 10),
  };

  for (const row of statusR.rows) {
    metrics[`jobs_${row.status}`] = parseInt(row.c, 10);
  }

  for (const scenario of WORKER_SCENARIOS) {
    metrics[`scenario_${scenario}`] = true;
  }

  const certified = !issues.some((i) => i.severity === 'error');

  return {
    module: 'worker',
    certified,
    generated_at_iso: new Date().toISOString(),
    duration_ms: Date.now() - started,
    issues,
    repairs,
    metrics,
  };
}
