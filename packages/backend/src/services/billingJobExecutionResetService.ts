/**
 * Sprint 5.0-24E — reset de execução de job ao reabrir competência (INV-21).
 * Delegado pelo SubscriptionCycleLifecycle; não substitui enqueue/worker.
 */
import { billingLog } from './billingLogger.js';
import type { DbQueryable } from './subscriptionCycleMaterializer.js';
import { billingJobsTableHasOutcomeColumns } from './billingRecurringJobPersistence.js';
import { normalizeBillingCycleKeyYmd } from '../utils/billingCycleKey.js';

export type JobExecutionResetResult = {
  jobs_reset: number;
  job_ids: string[];
};

function jobCycleMatchSql(alias: string, cycleParam: string): string {
  const ck = `${alias}.cycle_key`;
  return `(
    ${ck} = ${cycleParam}
    OR (
      length(${ck}) > 10
      AND left(${ck}, 10) = ${cycleParam}
      AND (substring(${ck}, 11, 1) IN ('T', 't', ' '))
    )
  )`;
}

function normalizeCycleYmd(raw: string): string | null {
  return normalizeBillingCycleKeyYmd(raw) || (/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null);
}

/**
 * Job completed/failed/cancelled cujo artefato não existe mais (ou nunca existiu)
 * ⇒ pending, pronto para nova execução na mesma (subscription, cycle_key).
 */
export async function resetJobExecutionForReopenedCompetency(
  db: DbQueryable,
  params: {
    tenantId: string;
    subscriptionId: string;
    cycleDateYmd: string;
    reason?: string;
  }
): Promise<JobExecutionResetResult> {
  const cycleKey = normalizeCycleYmd(params.cycleDateYmd);
  if (!cycleKey) return { jobs_reset: 0, job_ids: [] };

  const hasOutcome = await billingJobsTableHasOutcomeColumns(db);
  const completionClear = hasOutcome
    ? `completion_outcome = NULL,
       completion_detail = NULL,`
    : '';

  const r = await db.query<{ id: string }>(
    `UPDATE billing_recurring_jobs br
     SET status = 'pending',
         scheduled_at = now(),
         retry_at = NULL,
         locked_at = NULL,
         locked_by = NULL,
         error_message = NULL,
         ${completionClear}
         result_invoice_id = NULL,
         result_invoice_type = NULL,
         updated_at = now()
     WHERE br.id IN (
       SELECT br2.id
       FROM billing_recurring_jobs br2
       LEFT JOIN customer_invoices ci
         ON ci.id = br2.result_invoice_id
        AND ci.tenant_id = br2.tenant_id
       WHERE br2.subscription_id = $1::uuid
         AND br2.tenant_id = $2::uuid
         AND ${jobCycleMatchSql('br2', '$3::text')}
         AND br2.status IN ('completed', 'failed', 'cancelled')
         AND (
           br2.result_invoice_id IS NULL
           OR ci.id IS NULL
           OR ci.status IN ('cancelled', 'refunded')
         )
         AND (br2.result_invoice_type IS NULL OR br2.result_invoice_type = 'customer_invoice')
     )
     RETURNING br.id::text`,
    [params.subscriptionId, params.tenantId, cycleKey]
  );

  const job_ids = r.rows.map((row) => row.id);
  if (job_ids.length > 0) {
    billingLog('worker', 'billing_job_execution_reset', {
      tenant_id: params.tenantId,
      subscription_id: params.subscriptionId,
      cycle_date: cycleKey,
      reason: params.reason ?? 'competency_reopened',
      job_ids: job_ids.join(','),
    });
  }

  return { jobs_reset: job_ids.length, job_ids };
}

/** Reset jobs para várias competências (reopen em lote). */
export async function resetJobExecutionForReopenedCompetencies(
  db: DbQueryable,
  params: {
    tenantId: string;
    subscriptionId: string;
    cycleDatesYmd: string[];
    reason?: string;
  }
): Promise<JobExecutionResetResult> {
  const allIds: string[] = [];
  const seen = new Set<string>();
  for (const raw of params.cycleDatesYmd) {
    const cycleKey = normalizeCycleYmd(raw);
    if (!cycleKey || seen.has(cycleKey)) continue;
    seen.add(cycleKey);
    const one = await resetJobExecutionForReopenedCompetency(db, {
      tenantId: params.tenantId,
      subscriptionId: params.subscriptionId,
      cycleDateYmd: cycleKey,
      reason: params.reason,
    });
    allIds.push(...one.job_ids);
  }
  return { jobs_reset: allIds.length, job_ids: allIds };
}

/**
 * INV-21: ciclo aberto (sem invoice) mas job completed bloqueando geração.
 * Cobre pending já reparado + job órfão com result_invoice_id de fatura apagada.
 */
export async function repairJobExecutionForOpenCycles(
  db: DbQueryable,
  params: {
    tenantId: string;
    subscriptionId: string;
    cycleId?: string | null;
    reason?: string;
  }
): Promise<JobExecutionResetResult> {
  const cycleFilter = params.cycleId?.trim()
    ? `AND sc.id = $3::uuid`
    : '';
  const queryParams: unknown[] = [params.subscriptionId, params.tenantId];
  if (params.cycleId?.trim()) queryParams.push(params.cycleId.trim());

  const sel = await db.query<{ cycle_date: string }>(
    `SELECT DISTINCT sc.cycle_date::text
     FROM subscription_cycles sc
     WHERE sc.subscription_id = $1::uuid
       AND sc.tenant_id = $2::uuid
       AND sc.invoice_id IS NULL
       AND sc.status IN ('pending', 'queued', 'failed', 'skipped', 'cancelled')
       ${cycleFilter}`,
    queryParams
  );

  return resetJobExecutionForReopenedCompetencies(db, {
    tenantId: params.tenantId,
    subscriptionId: params.subscriptionId,
    cycleDatesYmd: sel.rows.map((r) => r.cycle_date),
    reason: params.reason ?? 'open_cycle_job_execution_repair',
  });
}
