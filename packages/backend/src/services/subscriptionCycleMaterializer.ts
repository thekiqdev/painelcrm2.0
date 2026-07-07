/**
 * Sprint 5.0-23A — única porta de INSERT inicial em `subscription_cycles`.
 * Não decide regras de negócio (Planner); não gera invoice, job, notificações nem avança assinatura.
 */
import { billingLog } from './billingLogger.js';
import { calculateNextBillingDate } from './subscriptionService.js';
import type { BillingInterval } from './billingService.js';
import { isSubscriptionCyclesWriteEnabled } from './subscriptionCyclesWriteFlagService.js';
import {
  normalizeBillingCycleKeyYmd,
  normalizeSubscriptionNextBillingYmd,
} from '../utils/billingCycleKey.js';

export type DbQueryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
};

export type SubscriptionCycleMaterializeSource =
  | 'scheduler'
  | 'manual_generate'
  | 'patch_next_billing'
  | 'resume'
  | 'runtime_repair'
  | 'worker_lifecycle';

export type EnsureSubscriptionCycleParams = {
  tenantId: string;
  subscriptionId: string;
  cycleDateYmd: string;
  source: SubscriptionCycleMaterializeSource;
  jobId?: string | null;
  schedulingMeta?: Record<string, unknown> | null;
};

export type EnsureSubscriptionCycleResult = {
  cycleId: string;
  cycleDate: string;
  status: string;
  created: boolean;
  reactivated: boolean;
};

function isMissingSubscriptionCyclesTable(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const msg = e instanceof Error ? e.message : String(e);
  return (
    code === '42P01' ||
    /relation\s+["']?subscription_cycles["']?\s+does not exist/i.test(msg)
  );
}

function logMaterializerError(context: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  billingLog('worker', 'subscription_cycle_materializer_error', {
    context,
    error: msg.slice(0, 800),
  });
}

export async function loadSubscriptionCyclePeriodBounds(
  db: DbQueryable,
  subscriptionId: string,
  cycleDateYmd: string
): Promise<{ period_start: string; period_end: string } | null> {
  const r = await db.query(
    `SELECT billing_interval, billing_anchor_day, type FROM subscriptions WHERE id = $1 LIMIT 1`,
    [subscriptionId]
  );
  const row = r.rows[0] as
    | { billing_interval: string; billing_anchor_day: number | null; type: string }
    | undefined;
  if (!row) return null;
  const interval = (row.billing_interval || 'monthly') as BillingInterval;
  const period_start = cycleDateYmd;
  const period_end =
    row.type === 'customer'
      ? calculateNextBillingDate(period_start, interval, null)
      : calculateNextBillingDate(period_start, interval, row.billing_anchor_day);
  return { period_start, period_end };
}

function normalizeCycleDateYmd(raw: string): string | null {
  const cycleDate =
    normalizeBillingCycleKeyYmd(raw) || normalizeSubscriptionNextBillingYmd(raw) || raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cycleDate)) return null;
  return cycleDate;
}

/**
 * Garante que existe exatamente uma row para (subscriptionId, cycle_date). Idempotente.
 */
export async function ensureSubscriptionCycle(
  db: DbQueryable,
  params: EnsureSubscriptionCycleParams
): Promise<EnsureSubscriptionCycleResult | null> {
  try {
    if (!(await isSubscriptionCyclesWriteEnabled())) return null;

    const cycleDate = normalizeCycleDateYmd(params.cycleDateYmd);
    if (!cycleDate) return null;

    const bounds = await loadSubscriptionCyclePeriodBounds(db, params.subscriptionId, cycleDate);
    if (!bounds) return null;

    const status = params.jobId ? 'queued' : 'pending';
    const meta = JSON.stringify({
      dual_write: params.source === 'worker_lifecycle' ? 'worker' : 'scheduler',
      materializer_source: params.source,
      v: 1,
      ...(params.schedulingMeta && typeof params.schedulingMeta === 'object' ? params.schedulingMeta : {}),
    });

    const existingR = await db.query<{ id: string; status: string }>(
      `SELECT id::text, status FROM subscription_cycles
       WHERE subscription_id = $1::uuid AND cycle_date = $2::date
       LIMIT 1`,
      [params.subscriptionId, cycleDate]
    );
    const existing = existingR.rows[0];
    const created = !existing;

    const insR = await db.query<{ id: string; status: string }>(
      `INSERT INTO subscription_cycles (
         tenant_id, subscription_id, cycle_date, period_start, period_end,
         status, job_id, invoice_id, processed_at, skipped_reason, error_message, metadata, updated_at
       )
       VALUES ($1, $2, $3::date, $4::date, $5::date, $6, $7::uuid, NULL, NULL, NULL, NULL, $8::jsonb, now())
       ON CONFLICT (subscription_id, cycle_date) DO UPDATE SET
         job_id = CASE
           WHEN subscription_cycles.status = 'invoiced' AND subscription_cycles.invoice_id IS NOT NULL
             THEN subscription_cycles.job_id
           WHEN EXCLUDED.job_id IS NOT NULL THEN EXCLUDED.job_id
           ELSE subscription_cycles.job_id
         END,
         status = CASE
           WHEN subscription_cycles.status = 'invoiced' AND subscription_cycles.invoice_id IS NOT NULL
             THEN subscription_cycles.status
           ELSE EXCLUDED.status
         END,
         period_start = CASE
           WHEN subscription_cycles.status = 'invoiced' AND subscription_cycles.invoice_id IS NOT NULL
             THEN subscription_cycles.period_start
           ELSE EXCLUDED.period_start
         END,
         period_end = CASE
           WHEN subscription_cycles.status = 'invoiced' AND subscription_cycles.invoice_id IS NOT NULL
             THEN subscription_cycles.period_end
           ELSE EXCLUDED.period_end
         END,
         metadata = COALESCE(subscription_cycles.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
         updated_at = now()
       RETURNING id::text, status`,
      [
        params.tenantId,
        params.subscriptionId,
        cycleDate,
        bounds.period_start,
        bounds.period_end,
        status,
        params.jobId ?? null,
        meta,
      ]
    );

    const row = insR.rows[0];
    if (!row) return null;

    const reactivated =
      !created &&
      existing != null &&
      (existing.status === 'failed' || existing.status === 'cancelled') &&
      row.status === status;

    return {
      cycleId: row.id,
      cycleDate,
      status: row.status,
      created,
      reactivated,
    };
  } catch (e: unknown) {
    if (isMissingSubscriptionCyclesTable(e)) return null;
    logMaterializerError('ensure_subscription_cycle', e);
    return null;
  }
}

export type SubscriptionCycleLifecycleUpdateParams = {
  tenantId: string;
  subscriptionId: string;
  cycleDate: string;
  status: string;
  jobId: string | null;
  invoiceId: string | null;
  processedAt: boolean;
  skippedReason: string | null;
  errorMessage: string | null;
  extraMeta: Record<string, unknown> | null;
};

/**
 * Atualiza status operacional de um ciclo existente (worker dual-write).
 * Se a row não existir, materializa via ensure antes do UPDATE.
 */
export async function updateSubscriptionCycleLifecycle(
  db: DbQueryable,
  params: SubscriptionCycleLifecycleUpdateParams
): Promise<void> {
  const cycleDate = normalizeCycleDateYmd(params.cycleDate);
  if (!cycleDate) return;

  const existsR = await db.query(
    `SELECT 1 FROM subscription_cycles
     WHERE subscription_id = $1::uuid AND cycle_date = $2::date
     LIMIT 1`,
    [params.subscriptionId, cycleDate]
  );

  if ((existsR.rowCount ?? 0) === 0) {
    await ensureSubscriptionCycle(db, {
      tenantId: params.tenantId,
      subscriptionId: params.subscriptionId,
      cycleDateYmd: cycleDate,
      source: 'worker_lifecycle',
      jobId: params.jobId,
    });
  }

  const baseMeta = { dual_write: 'worker', v: 1, ...(params.extraMeta ?? {}) };
  await db.query(
    `UPDATE subscription_cycles SET
       job_id = CASE
         WHEN subscription_cycles.status = 'invoiced' AND subscription_cycles.invoice_id IS NOT NULL
           THEN subscription_cycles.job_id
         WHEN $3::uuid IS NOT NULL THEN $3::uuid
         ELSE subscription_cycles.job_id
       END,
       status = CASE
         WHEN subscription_cycles.status = 'invoiced' AND subscription_cycles.invoice_id IS NOT NULL
           THEN subscription_cycles.status
         ELSE $4
       END,
       invoice_id = CASE
         WHEN subscription_cycles.status = 'invoiced' AND subscription_cycles.invoice_id IS NOT NULL
           THEN subscription_cycles.invoice_id
         WHEN $5::uuid IS NOT NULL THEN $5::uuid
         ELSE subscription_cycles.invoice_id
       END,
       processed_at = CASE
         WHEN subscription_cycles.status = 'invoiced' AND subscription_cycles.invoice_id IS NOT NULL
           THEN subscription_cycles.processed_at
         WHEN $6 THEN now()
         ELSE subscription_cycles.processed_at
       END,
       skipped_reason = CASE
         WHEN subscription_cycles.status = 'invoiced' AND subscription_cycles.invoice_id IS NOT NULL
           THEN subscription_cycles.skipped_reason
         ELSE COALESCE($7, subscription_cycles.skipped_reason)
       END,
       error_message = CASE
         WHEN subscription_cycles.status = 'invoiced' AND subscription_cycles.invoice_id IS NOT NULL
           THEN subscription_cycles.error_message
         ELSE COALESCE($8, subscription_cycles.error_message)
       END,
       metadata = COALESCE(subscription_cycles.metadata, '{}'::jsonb) || $9::jsonb,
       updated_at = now()
     WHERE subscription_id = $1::uuid AND cycle_date = $2::date`,
    [
      params.subscriptionId,
      cycleDate,
      params.jobId,
      params.status,
      params.invoiceId,
      params.processedAt,
      params.skippedReason,
      params.errorMessage,
      JSON.stringify(baseMeta),
    ]
  );
}
