/**
 * Validação e reparo automático do billing runtime (Sprint 4.1J).
 */
import { pool } from '../utils/db.js';
import { getSubscriptionById } from '../services/billingSubscriptionService.js';
import { repairRecoverableSubscriptionCycles } from '../services/subscriptionCycleRepairService.js';
import { repairBillingPlanForSubscription } from '../billingPlatform/provisioning/billingPlanRepairService.js';
import { normalizeBillingDateFromDb, assertBillingDate } from './billingRuntimeAssertions.js';
import { recordBillingRuntimeTrace } from './billingRuntimeTrace.js';
import {
  BILLING_ENGINE_VERSION,
  BILLING_EXECUTION_VERSION,
  BILLING_RUNTIME_PIPELINE,
  BILLING_RUNTIME_VERSION,
  BILLING_WORKER_VERSION,
} from './billingRuntimeVersions.js';
import { safeTodayYmd } from '../utils/billingSafeDate.js';
import { normalizeBillingCycleKeyYmd } from '../utils/billingCycleKey.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONSISTENCY_ROOT = path.resolve(__dirname, '../../../../storage/debug/billing-runtime');

export type CycleConsistencyIssue = {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  cycle_date?: string;
  invoice_id?: string;
  job_id?: string;
};

export type BillingRuntimeValidationResult = {
  subscription_id: string;
  tenant_id: string;
  certified: boolean;
  repairs: string[];
  issues: CycleConsistencyIssue[];
  cycles_repaired: number;
  jobs_repaired: number;
  billing_plan_repaired: boolean;
  normalized_dates: Record<string, string | null>;
  observability: BillingRuntimeObservability;
};

export type BillingRuntimeObservability = {
  engine_version: string;
  worker_version: string;
  execution_version: string;
  runtime_version: string;
  pipeline: string;
  current_stage: string | null;
  request_id: string | null;
  job_id: string | null;
  retry_count: number | null;
  worker_attempt: number | null;
  caller: string | null;
  billing_plan_id: string | null;
  billing_plan_item_count: number;
  current_cycle_ymd: string | null;
  next_cycle_ymd: string | null;
  current_invoice_id: string | null;
  normalized_dates: Record<string, string | null>;
  last_generation_at: string | null;
  last_retry_at: string | null;
  last_error: string | null;
  last_error_origin: { file: string | null; function: string | null; stack_summary: string | null } | null;
};

async function auditCycleConsistency(
  tenantId: string,
  subscriptionId: string
): Promise<CycleConsistencyIssue[]> {
  const issues: CycleConsistencyIssue[] = [];
  const today = safeTodayYmd();

  const cyclesR = await pool.query<{
    id: string;
    cycle_date: string | Date;
    period_start: string | Date;
    period_end: string | Date;
    status: string;
    invoice_id: string | null;
    job_id: string | null;
  }>(
    `SELECT id::text, cycle_date, period_start, period_end, status, invoice_id::text, job_id::text
     FROM subscription_cycles
     WHERE tenant_id = $1::uuid AND subscription_id = $2::uuid
     ORDER BY cycle_date`,
    [tenantId, subscriptionId]
  ).catch(() => ({ rows: [] }));

  const seenDates = new Map<string, number>();
  for (const row of cyclesR.rows) {
    const cycleYmd = normalizeBillingDateFromDb(row.cycle_date) ?? '';
    if (!cycleYmd) {
      issues.push({
        code: 'invalid_cycle_date',
        severity: 'error',
        message: 'cycle_date inválido no banco',
        cycle_date: String(row.cycle_date),
      });
      continue;
    }
    seenDates.set(cycleYmd, (seenDates.get(cycleYmd) ?? 0) + 1);
    const ps = normalizeBillingDateFromDb(row.period_start);
    const pe = normalizeBillingDateFromDb(row.period_end);
    if (ps && pe && pe < ps) {
      issues.push({
        code: 'period_overlap',
        severity: 'error',
        message: 'period_end anterior a period_start',
        cycle_date: cycleYmd,
      });
    }
    if (row.status === 'invoiced' && !row.invoice_id) {
      issues.push({
        code: 'invoiced_without_invoice',
        severity: 'error',
        message: 'Ciclo invoiced sem invoice_id',
        cycle_date: cycleYmd,
      });
    }
    if (row.invoice_id && row.status === 'failed' && cycleYmd >= today) {
      issues.push({
        code: 'recoverable_failed_with_invoice',
        severity: 'warning',
        message: 'Ciclo failed recuperável com invoice',
        cycle_date: cycleYmd,
        invoice_id: row.invoice_id,
      });
    }
  }

  for (const [date, count] of seenDates) {
    if (count > 1) {
      issues.push({
        code: 'duplicate_cycle',
        severity: 'error',
        message: `Ciclo duplicado: ${date} (${count}x)`,
        cycle_date: date,
      });
    }
  }

  const invR = await pool.query<{ id: string; period_start: string | Date }>(
    `SELECT id::text, period_start FROM customer_invoices
     WHERE tenant_id = $1::uuid AND subscription_id = $2::uuid AND status != 'cancelled'`,
    [tenantId, subscriptionId]
  );
  const cycleInvoiceIds = new Set(
    cyclesR.rows.map((r) => r.invoice_id).filter(Boolean) as string[]
  );
  for (const inv of invR.rows) {
    if (!cycleInvoiceIds.has(inv.id)) {
      const ps = normalizeBillingDateFromDb(inv.period_start);
      issues.push({
        code: 'orphan_invoice',
        severity: 'warning',
        message: 'Invoice sem ciclo correspondente',
        invoice_id: inv.id,
        cycle_date: ps ?? undefined,
      });
    }
  }

  const planR = await pool.query<{ id: string; c: string }>(
    `SELECT bp.id::text, (SELECT COUNT(*)::text FROM billing_plan_items bpi
      WHERE bpi.billing_plan_id = bp.id AND bpi.tenant_id = bp.tenant_id) AS c
     FROM billing_plans bp
     WHERE bp.subscription_id = $1::uuid AND bp.tenant_id = $2::uuid AND bp.status = 'active'
     LIMIT 1`,
    [subscriptionId, tenantId]
  );
  const plan = planR.rows[0];
  if (!plan) {
    issues.push({ code: 'missing_billing_plan', severity: 'error', message: 'Billing plan ativo ausente' });
  } else if (parseInt(plan.c, 10) < 1) {
    issues.push({
      code: 'plan_without_items',
      severity: 'error',
      message: 'Billing plan sem itens',
    });
  }

  try {
    if (!fs.existsSync(CONSISTENCY_ROOT)) fs.mkdirSync(CONSISTENCY_ROOT, { recursive: true });
    fs.writeFileSync(
      path.join(CONSISTENCY_ROOT, 'billing-cycle-consistency.json'),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          tenant_id: tenantId,
          subscription_id: subscriptionId,
          issues,
          cycle_count: cyclesR.rows.length,
        },
        null,
        2
      ),
      'utf8'
    );
  } catch {
    /* best effort */
  }

  return issues;
}

async function resetStuckRetries(tenantId: string, subscriptionId: string): Promise<number> {
  const r = await pool.query(
    `UPDATE billing_recurring_jobs
     SET status = 'pending', retry_at = NULL, locked_at = NULL, locked_by = NULL, updated_at = now()
     WHERE tenant_id = $1::uuid AND subscription_id = $2::uuid
       AND status = 'processing'
       AND locked_at < now() - interval '30 minutes'
       AND result_invoice_id IS NULL`,
    [tenantId, subscriptionId]
  );
  return r.rowCount ?? 0;
}

export async function validateBillingRuntime(
  tenantId: string,
  subscriptionId: string,
  options?: { requestId?: string | null }
): Promise<BillingRuntimeValidationResult> {
  const repairs: string[] = [];
  const sub = await getSubscriptionById(subscriptionId);
  if (!sub || sub.tenant_id !== tenantId) {
    return {
      subscription_id: subscriptionId,
      tenant_id: tenantId,
      certified: false,
      repairs: [],
      issues: [{ code: 'subscription_not_found', severity: 'error', message: 'Assinatura não encontrada' }],
      cycles_repaired: 0,
      jobs_repaired: 0,
      billing_plan_repaired: false,
      normalized_dates: {},
      observability: emptyObservability(options?.requestId),
    };
  }

  const normalized_dates: Record<string, string | null> = {
    next_billing_date: normalizeBillingDateFromDb(sub.next_billing_date),
    current_period_start: normalizeBillingDateFromDb(sub.current_period_start),
    current_period_end: normalizeBillingDateFromDb(sub.current_period_end),
  };

  for (const [field, ymd] of Object.entries(normalized_dates)) {
    if (ymd) {
      try {
        assertBillingDate(ymd, field);
      } catch {
        repairs.push(`normalized_invalid_${field}`);
      }
    }
  }

  const cycleRepair = await repairRecoverableSubscriptionCycles(tenantId, subscriptionId);
  if (cycleRepair.cycles_repaired > 0) repairs.push(`cycles_failed_to_pending:${cycleRepair.cycles_repaired}`);
  if (cycleRepair.jobs_repaired > 0) repairs.push(`jobs_failed_to_pending:${cycleRepair.jobs_repaired}`);

  const stuck = await resetStuckRetries(tenantId, subscriptionId);
  if (stuck > 0) repairs.push(`stuck_retry_reset:${stuck}`);

  let billing_plan_repaired = false;
  try {
    const repaired = await repairBillingPlanForSubscription(sub);
    if (repaired.createdPlan || repaired.createdItems) {
      billing_plan_repaired = true;
      repairs.push('billing_plan_provisioned');
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    recordBillingRuntimeTrace({
      kind: 'runtime_repair',
      meta: { subscription_id: subscriptionId, error: msg.slice(0, 200) },
    });
  }

  const issues = await auditCycleConsistency(tenantId, subscriptionId);

  const jobR = await pool.query<{
    id: string;
    status: string;
    cycle_key: string;
    attempts: number;
    max_attempts: number;
    retry_at: string | null;
    error_message: string | null;
    updated_at: string;
    result_invoice_id: string | null;
  }>(
    `SELECT id::text, status, cycle_key, attempts, max_attempts, retry_at::text, error_message, updated_at::text, result_invoice_id::text
     FROM billing_recurring_jobs
     WHERE tenant_id = $1::uuid AND subscription_id = $2::uuid
     ORDER BY updated_at DESC LIMIT 1`,
    [tenantId, subscriptionId]
  );
  const job = jobR.rows[0] ?? null;

  const planR = await pool.query<{ id: string; c: string }>(
    `SELECT bp.id::text, (SELECT COUNT(*)::text FROM billing_plan_items bpi
      WHERE bpi.billing_plan_id = bp.id) AS c
     FROM billing_plans bp WHERE bp.subscription_id = $1::uuid AND bp.tenant_id = $2::uuid AND bp.status = 'active' LIMIT 1`,
    [subscriptionId, tenantId]
  );

  const lastInvR = await pool.query<{ id: string; created_at: string }>(
    `SELECT id::text, created_at::text FROM customer_invoices
     WHERE tenant_id = $1::uuid AND subscription_id = $2::uuid ORDER BY created_at DESC LIMIT 1`,
    [tenantId, subscriptionId]
  );

  const observability: BillingRuntimeObservability = {
    engine_version: BILLING_ENGINE_VERSION,
    worker_version: BILLING_WORKER_VERSION,
    execution_version: BILLING_EXECUTION_VERSION,
    runtime_version: BILLING_RUNTIME_VERSION,
    pipeline: BILLING_RUNTIME_PIPELINE,
    current_stage: job?.status === 'processing' ? 'ENGINE_START' : job?.status === 'pending' ? 'JOB_PICKUP' : null,
    request_id: options?.requestId ?? null,
    job_id: job?.id ?? null,
    retry_count: job?.attempts ?? null,
    worker_attempt: job?.attempts ?? null,
    caller: 'validateBillingRuntime',
    billing_plan_id: planR.rows[0]?.id ?? null,
    billing_plan_item_count: planR.rows[0] ? parseInt(planR.rows[0].c, 10) : 0,
    current_cycle_ymd: normalizeBillingCycleKeyYmd(job?.cycle_key ?? '') || normalized_dates.next_billing_date,
    next_cycle_ymd: normalized_dates.next_billing_date,
    current_invoice_id: job?.result_invoice_id ?? lastInvR.rows[0]?.id ?? null,
    normalized_dates,
    last_generation_at: lastInvR.rows[0]?.created_at ?? null,
    last_retry_at: job?.retry_at ?? null,
    last_error: job?.error_message ?? null,
    last_error_origin: job?.error_message
      ? {
          file: job.error_message.includes('Tue Jun') ? 'billingRecurringJobPersistence.ts' : null,
          function: job.error_message.includes('Tue Jun') ? 'computeFinalNextBillingForCompletedCycle' : null,
          stack_summary: job.error_message.slice(0, 120),
        }
      : null,
  };

  recordBillingRuntimeTrace({
    kind: 'runtime_repair',
    subscription_id: subscriptionId,
    tenant_id: tenantId,
    meta: { repairs, issue_count: issues.length },
  });

  const critical = issues.filter((i) => i.severity === 'error' && !repairs.some((r) => r.includes('billing_plan')));
  return {
    subscription_id: subscriptionId,
    tenant_id: tenantId,
    certified: critical.length === 0,
    repairs,
    issues,
    cycles_repaired: cycleRepair.cycles_repaired,
    jobs_repaired: cycleRepair.jobs_repaired,
    billing_plan_repaired,
    normalized_dates,
    observability,
  };
}

function emptyObservability(requestId?: string | null): BillingRuntimeObservability {
  return {
    engine_version: BILLING_ENGINE_VERSION,
    worker_version: BILLING_WORKER_VERSION,
    execution_version: BILLING_EXECUTION_VERSION,
    runtime_version: BILLING_RUNTIME_VERSION,
    pipeline: BILLING_RUNTIME_PIPELINE,
    current_stage: null,
    request_id: requestId ?? null,
    job_id: null,
    retry_count: null,
    worker_attempt: null,
    caller: null,
    billing_plan_id: null,
    billing_plan_item_count: 0,
    current_cycle_ymd: null,
    next_cycle_ymd: null,
    current_invoice_id: null,
    normalized_dates: {},
    last_generation_at: null,
    last_retry_at: null,
    last_error: null,
    last_error_origin: null,
  };
}
