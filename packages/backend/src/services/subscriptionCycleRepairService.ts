/**
 * Reparo de ciclos recuperáveis (Sprint 4.1I).
 * Migra `failed` → `pending` quando ainda não há invoice e o ciclo é futuro/hoje.
 * Sprint 5.0-24C — inclui repair INV-19 (invoiced sem invoice_id).
 */
import { pool } from '../utils/db.js';
import { billingLog } from './billingLogger.js';
import { isSubscriptionCyclesWriteEnabled } from './subscriptionCyclesWriteFlagService.js';
import { normalizeBillingDate, safeTodayYmd } from '../utils/billingSafeDate.js';
import { normalizeBillingCycleKeyYmd } from '../utils/billingCycleKey.js';
import { repairInvoicedCyclesWithoutInvoice } from './subscriptionCycleLifecycleService.js';

export type CycleRepairResult = {
  cycles_repaired: number;
  jobs_repaired: number;
  repaired_cycle_dates: string[];
  invariant_cycles_reopened: number;
};

async function repairCyclesTable(
  tenantId: string,
  subscriptionId: string,
  todayYmd: string
): Promise<{ count: number; dates: string[] }> {
  if (!(await isSubscriptionCyclesWriteEnabled())) {
    return { count: 0, dates: [] };
  }
  try {
    const r = await pool.query<{ cycle_date: string }>(
      `UPDATE subscription_cycles
       SET status = 'pending',
           skipped_reason = NULL,
           error_message = NULL,
           processed_at = NULL,
           updated_at = now()
       WHERE tenant_id = $1::uuid
         AND subscription_id = $2::uuid
         AND status = 'failed'
         AND invoice_id IS NULL
         AND cycle_date >= $3::date
       RETURNING cycle_date::text`,
      [tenantId, subscriptionId, todayYmd]
    );
    return {
      count: r.rowCount ?? 0,
      dates: r.rows.map((row) => normalizeBillingDate(row.cycle_date) ?? row.cycle_date),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/relation\s+["']?subscription_cycles["']?\s+does not exist/i.test(msg)) {
      return { count: 0, dates: [] };
    }
    throw e;
  }
}

async function repairFailedJobs(
  tenantId: string,
  subscriptionId: string,
  todayYmd: string
): Promise<number> {
  const r = await pool.query(
    `UPDATE billing_recurring_jobs
     SET status = 'pending',
         retry_at = NULL,
         locked_at = NULL,
         locked_by = NULL,
         error_message = NULL,
         completion_outcome = NULL,
         updated_at = now()
     WHERE tenant_id = $1::uuid
       AND subscription_id = $2::uuid
       AND status = 'failed'
       AND result_invoice_id IS NULL
       AND left(trim(cycle_key), 10) >= $3`,
    [tenantId, subscriptionId, todayYmd]
  );
  return r.rowCount ?? 0;
}

/** Repara todos os ciclos recuperáveis da assinatura. */
export async function repairRecoverableSubscriptionCycles(
  tenantId: string,
  subscriptionId: string
): Promise<CycleRepairResult> {
  const todayYmd = safeTodayYmd();
  const invariant = await repairInvoicedCyclesWithoutInvoice(tenantId, subscriptionId, {
    reason: 'runtime_invariant_repair',
  });
  const cycles = await repairCyclesTable(tenantId, subscriptionId, todayYmd);
  const jobs = await repairFailedJobs(tenantId, subscriptionId, todayYmd);
  if (cycles.count > 0 || jobs > 0 || invariant.cycles_reopened > 0) {
    billingLog('worker', 'subscription_cycles_auto_repair', {
      tenant_id: tenantId,
      subscription_id: subscriptionId,
      cycles_repaired: cycles.count,
      jobs_repaired: jobs,
      invariant_cycles_reopened: invariant.cycles_reopened,
      cycle_dates: [...invariant.cycle_dates, ...cycles.dates].join(','),
    });
  }
  return {
    cycles_repaired: cycles.count,
    jobs_repaired: jobs,
    repaired_cycle_dates: [...invariant.cycle_dates, ...cycles.dates],
    invariant_cycles_reopened: invariant.cycles_reopened,
  };
}

/** Repara um ciclo específico (failed + sem invoice + data >= hoje). */
export async function repairCycle(
  tenantId: string,
  subscriptionId: string,
  cycleDateRaw: string
): Promise<boolean> {
  const cycleDate = normalizeBillingCycleKeyYmd(cycleDateRaw) || normalizeBillingDate(cycleDateRaw);
  if (!cycleDate) return false;
  const todayYmd = safeTodayYmd();
  if (cycleDate < todayYmd) return false;

  const result = await repairRecoverableSubscriptionCycles(tenantId, subscriptionId);
  return result.repaired_cycle_dates.includes(cycleDate) || result.jobs_repaired > 0;
}
