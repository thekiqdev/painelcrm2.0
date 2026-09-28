/**
 * Diagnóstico somente leitura antes do SELECT do batch do worker.
 * Não altera jobs nem regras de elegibilidade.
 */
import {
  getBillingStaleProcessingReclaimMinutes,
  isBillingWorkerBatchDiagnostic,
} from '../config/billingEnv.js';

type DbQueryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export interface BillingWorkerBatchDiagnosticPayload {
  workerId: string;
  reclaim_minutes: number;
  reclaimed_processing_this_run: number;
  pending_locks_cleared_this_run: number;
  db_now: string;
  db_current_date: string;
  db_timezone: string;
  counts: {
    pending_total: number;
    pending_scheduled_at_eligible: number;
    /** Mesmos filtros do SELECT do batch (`scheduled_at` + `retry_at`). */
    pending_worker_query_eligible: number;
    pending_future_scheduled_at: number;
    pending_future_retry_at: number;
    pending_with_orphan_lock: number;
    processing_total: number;
    processing_stale_would_reclaim: number;
    processing_active_recent: number;
    failed_total: number;
    completed_total: number;
    cancelled_total: number;
  };
  /** Amostra de pending que falham filtros do worker (máx. 8). */
  pending_not_in_batch_sample: Array<{
    id: string;
    subscription_id: string;
    cycle_key: string;
    status: string;
    scheduled_at: string;
    retry_at: string | null;
    locked_at: string | null;
    locked_by: string | null;
    block_reason: string;
  }>;
}

function parseCount(row: Record<string, unknown>, key: string): number {
  return parseInt(String(row[key] ?? '0'), 10) || 0;
}

/**
 * Emite `[BILLING_WORKER_DIAGNOSTIC]` (JSON) quando `BILLING_WORKER_BATCH_DIAGNOSTIC` ≠ false.
 */
export async function emitBillingWorkerBatchDiagnostic(
  db: DbQueryable,
  workerId: string,
  reclaimedThisRun: number,
  pendingLocksClearedThisRun: number
): Promise<BillingWorkerBatchDiagnosticPayload | null> {
  if (!isBillingWorkerBatchDiagnostic()) return null;

  const reclaimMinutes = getBillingStaleProcessingReclaimMinutes();

  const metaR = await db.query(
    `SELECT now()::text AS db_now,
            CURRENT_DATE::text AS db_current_date,
            current_setting('TIMEZONE') AS db_timezone`
  );
  const meta = metaR.rows[0] ?? {};

  const countsR = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending')::text AS pending_total,
       COUNT(*) FILTER (WHERE status = 'pending' AND scheduled_at <= now())::text AS pending_scheduled_at_eligible,
       COUNT(*) FILTER (
         WHERE status = 'pending' AND scheduled_at <= now()
           AND (retry_at IS NULL OR retry_at <= now())
       )::text AS pending_worker_query_eligible,
       COUNT(*) FILTER (WHERE status = 'pending' AND scheduled_at > now())::text AS pending_future_scheduled_at,
       COUNT(*) FILTER (
         WHERE status = 'pending' AND scheduled_at <= now()
           AND retry_at IS NOT NULL AND retry_at > now()
       )::text AS pending_future_retry_at,
       COUNT(*) FILTER (
         WHERE status = 'pending' AND (locked_at IS NOT NULL OR locked_by IS NOT NULL)
       )::text AS pending_with_orphan_lock,
       COUNT(*) FILTER (WHERE status = 'processing')::text AS processing_total,
       COUNT(*) FILTER (
         WHERE status = 'processing'
           AND (
             (locked_at IS NOT NULL AND locked_at < now() - ($1::int * INTERVAL '1 minute'))
             OR (locked_at IS NULL AND updated_at < now() - ($1::int * INTERVAL '1 minute'))
           )
       )::text AS processing_stale_would_reclaim,
       COUNT(*) FILTER (
         WHERE status = 'processing'
           AND NOT (
             (locked_at IS NOT NULL AND locked_at < now() - ($1::int * INTERVAL '1 minute'))
             OR (locked_at IS NULL AND updated_at < now() - ($1::int * INTERVAL '1 minute'))
           )
       )::text AS processing_active_recent,
       COUNT(*) FILTER (WHERE status = 'failed')::text AS failed_total,
       COUNT(*) FILTER (WHERE status = 'completed')::text AS completed_total,
       COUNT(*) FILTER (WHERE status = 'cancelled')::text AS cancelled_total
     FROM billing_recurring_jobs`,
    [reclaimMinutes]
  );
  const c = countsR.rows[0] ?? {};

  const sampleR = await db.query(
    `SELECT id::text, subscription_id::text, cycle_key, status,
            scheduled_at::text, retry_at::text, locked_at::text, locked_by::text,
            CASE
              WHEN scheduled_at > now() THEN 'scheduled_at_in_future'
              WHEN retry_at IS NOT NULL AND retry_at > now() THEN 'retry_at_in_future'
              WHEN locked_at IS NOT NULL OR locked_by IS NOT NULL THEN 'orphan_lock_on_pending'
              ELSE 'would_match_worker_query'
            END AS block_reason
     FROM billing_recurring_jobs
     WHERE status = 'pending'
       AND NOT (
         scheduled_at <= now()
         AND (retry_at IS NULL OR retry_at <= now())
       )
     ORDER BY updated_at DESC
     LIMIT 8`
  );

  const payload: BillingWorkerBatchDiagnosticPayload = {
    workerId,
    reclaim_minutes: reclaimMinutes,
    reclaimed_processing_this_run: reclaimedThisRun,
    pending_locks_cleared_this_run: pendingLocksClearedThisRun,
    db_now: String(meta.db_now ?? ''),
    db_current_date: String(meta.db_current_date ?? ''),
    db_timezone: String(meta.db_timezone ?? ''),
    counts: {
      pending_total: parseCount(c, 'pending_total'),
      pending_scheduled_at_eligible: parseCount(c, 'pending_scheduled_at_eligible'),
      pending_worker_query_eligible: parseCount(c, 'pending_worker_query_eligible'),
      pending_future_scheduled_at: parseCount(c, 'pending_future_scheduled_at'),
      pending_future_retry_at: parseCount(c, 'pending_future_retry_at'),
      pending_with_orphan_lock: parseCount(c, 'pending_with_orphan_lock'),
      processing_total: parseCount(c, 'processing_total'),
      processing_stale_would_reclaim: parseCount(c, 'processing_stale_would_reclaim'),
      processing_active_recent: parseCount(c, 'processing_active_recent'),
      failed_total: parseCount(c, 'failed_total'),
      completed_total: parseCount(c, 'completed_total'),
      cancelled_total: parseCount(c, 'cancelled_total'),
    },
    pending_not_in_batch_sample: sampleR.rows.map((row) => ({
      id: String(row.id),
      subscription_id: String(row.subscription_id),
      cycle_key: String(row.cycle_key),
      status: String(row.status),
      scheduled_at: String(row.scheduled_at),
      retry_at: row.retry_at != null ? String(row.retry_at) : null,
      locked_at: row.locked_at != null ? String(row.locked_at) : null,
      locked_by: row.locked_by != null ? String(row.locked_by) : null,
      block_reason: String(row.block_reason),
    })),
  };

  console.log('[BILLING_WORKER_DIAGNOSTIC]', JSON.stringify(payload));
  return payload;
}
