/**
 * Leitura operacional de `billing_recurring_jobs` + assinatura (superadmin / diagnóstico).
 */
import { pool } from '../utils/db.js';

let cachedHasCompletionColumns: boolean | undefined;

export async function billingRecurringJobsHasCompletionColumns(): Promise<boolean> {
  if (cachedHasCompletionColumns !== undefined) return cachedHasCompletionColumns;
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'billing_recurring_jobs'
       AND column_name = 'completion_outcome'`
  );
  cachedHasCompletionColumns = parseInt(r.rows[0]?.c ?? '0', 10) >= 1;
  return cachedHasCompletionColumns;
}

export interface BillingRecurringJobsStatusSummary {
  pending: number;
  processing: number;
  completed_with_invoice: number;
  completed_without_invoice: number;
  failed: number;
  cancelled: number;
  /** Últimos N dias (janela móvel por `updated_at`). */
  window_days: number;
}

export interface BillingRecurringJobOpsRow {
  id: string;
  subscription_id: string;
  tenant_id: string;
  job_type: string;
  cycle_key: string;
  scheduled_at: string;
  retry_at: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  result_invoice_id: string | null;
  result_invoice_type: string | null;
  completion_outcome: string | null;
  completion_detail: string | null;
  error_message: string | null;
  locked_by: string | null;
  created_at: string;
  updated_at: string;
  subscription_next_billing_date: string | null;
  subscription_status: string | null;
  subscription_type: string | null;
  tenant_name: string | null;
}

/**
 * Contagens por estado (tabela completa para pending/processing; demais por janela `updated_at`).
 */
export async function getBillingRecurringJobsStatusSummary(
  windowDays = 30
): Promise<BillingRecurringJobsStatusSummary> {
  const w = Math.min(365, Math.max(1, windowDays));
  const r = await pool.query<{
    pending: string;
    processing: string;
    completed_with_invoice: string;
    completed_without_invoice: string;
    failed: string;
    cancelled: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
       COUNT(*) FILTER (WHERE status = 'processing')::text AS processing,
       COUNT(*) FILTER (
         WHERE status = 'completed'
           AND result_invoice_id IS NOT NULL
           AND updated_at >= now() - ($1::int || ' days')::interval
       )::text AS completed_with_invoice,
       COUNT(*) FILTER (
         WHERE status = 'completed'
           AND result_invoice_id IS NULL
           AND updated_at >= now() - ($1::int || ' days')::interval
       )::text AS completed_without_invoice,
       COUNT(*) FILTER (
         WHERE status = 'failed' AND updated_at >= now() - ($1::int || ' days')::interval
       )::text AS failed,
       COUNT(*) FILTER (
         WHERE status = 'cancelled' AND updated_at >= now() - ($1::int || ' days')::interval
       )::text AS cancelled
     FROM billing_recurring_jobs`,
    [w]
  );
  const row = r.rows[0];
  return {
    pending: parseInt(row?.pending ?? '0', 10),
    processing: parseInt(row?.processing ?? '0', 10),
    completed_with_invoice: parseInt(row?.completed_with_invoice ?? '0', 10),
    completed_without_invoice: parseInt(row?.completed_without_invoice ?? '0', 10),
    failed: parseInt(row?.failed ?? '0', 10),
    cancelled: parseInt(row?.cancelled ?? '0', 10),
    window_days: w,
  };
}

/**
 * Lista jobs recentes com join em `subscriptions` e tenant (diagnóstico).
 */
export async function listBillingRecurringJobsForOps(params: {
  limit: number;
  /** Um status ou vários separados por vírgula (ex.: pending,failed). Omitir = todos. */
  status?: string | null;
  /** Filtra `j.updated_at >= now() - days` quando definido. */
  since_days?: number | null;
}): Promise<BillingRecurringJobOpsRow[]> {
  const limit = Math.min(500, Math.max(1, params.limit));
  const conditions: string[] = ['1=1'];
  const values: unknown[] = [];
  if (params.since_days != null && params.since_days > 0) {
    values.push(Math.min(365, params.since_days));
    conditions.push(`j.updated_at >= now() - ($${values.length}::int || ' days')::interval`);
  }
  if (params.status && params.status.trim()) {
    const parts = params.status
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 1) {
      values.push(parts[0]);
      conditions.push(`j.status = $${values.length}`);
    } else if (parts.length > 1) {
      values.push(parts);
      conditions.push(`j.status = ANY($${values.length}::text[])`);
    }
  }
  values.push(limit);
  const limitParam = values.length;
  const hasOc = await billingRecurringJobsHasCompletionColumns();
  const outcomeCols = hasOc
    ? `j.completion_outcome, j.completion_detail`
    : `NULL::text AS completion_outcome, NULL::text AS completion_detail`;
  const r = await pool.query<BillingRecurringJobOpsRow>(
    `SELECT
       j.id,
       j.subscription_id::text,
       j.tenant_id::text,
       j.job_type,
       j.cycle_key,
       j.scheduled_at::text,
       j.retry_at::text,
       j.status,
       j.attempts,
       j.max_attempts,
       j.result_invoice_id::text,
       j.result_invoice_type,
       ${outcomeCols},
       j.error_message,
       j.locked_by,
       j.created_at::text,
       j.updated_at::text,
       s.next_billing_date::text AS subscription_next_billing_date,
       s.status AS subscription_status,
       s.type AS subscription_type,
       t.company_name AS tenant_name
     FROM billing_recurring_jobs j
     LEFT JOIN subscriptions s ON s.id = j.subscription_id
     LEFT JOIN tenants t ON t.id = j.tenant_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY j.updated_at DESC
     LIMIT $${limitParam}`,
    values
  );
  return r.rows;
}
