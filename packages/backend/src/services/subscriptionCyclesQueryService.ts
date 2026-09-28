/**
 * Leitura de `subscription_cycles` para insight (Etapa 2). Sem escrita; sem scheduler/worker.
 */
import { pool } from '../utils/db.js';

export interface SubscriptionCycleDbRow {
  id: string;
  cycle_date: string;
  period_start: string;
  period_end: string;
  status: string;
  invoice_id: string | null;
  job_id: string | null;
  processed_at: string | null;
  skipped_reason: string | null;
  error_message: string | null;
}

function isMissingSubscriptionCyclesTable(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const msg = e instanceof Error ? e.message : String(e);
  return (
    code === '42P01' ||
    /relation\s+["']?subscription_cycles["']?\s+does not exist/i.test(msg)
  );
}

const SELECT_LIST = `
  id::text,
  cycle_date::text,
  period_start::text,
  period_end::text,
  status,
  invoice_id::text,
  job_id::text,
  processed_at::text,
  skipped_reason,
  error_message
`;

/**
 * Ciclos recentes da assinatura (mais recente primeiro).
 */
export async function listSubscriptionCyclesBySubscriptionId(
  tenantId: string,
  subscriptionId: string,
  limit: number
): Promise<SubscriptionCycleDbRow[]> {
  const lim = Math.min(Math.max(limit, 1), 120);
  try {
    const r = await pool.query<SubscriptionCycleDbRow>(
      `SELECT ${SELECT_LIST}
       FROM subscription_cycles
       WHERE tenant_id = $1 AND subscription_id = $2
       ORDER BY cycle_date DESC, created_at DESC
       LIMIT $3`,
      [tenantId, subscriptionId, lim]
    );
    return r.rows;
  } catch (e: unknown) {
    if (isMissingSubscriptionCyclesTable(e)) return [];
    throw e;
  }
}

/**
 * Ciclo correspondente à fatura: prioriza `invoice_id`, depois `cycle_date = period_start`.
 */
/** Ciclo exato por id (geração manual determinística — Sprint 4.2D). */
export async function getSubscriptionCycleById(
  tenantId: string,
  subscriptionId: string,
  cycleId: string
): Promise<SubscriptionCycleDbRow | null> {
  try {
    const r = await pool.query<SubscriptionCycleDbRow>(
      `SELECT ${SELECT_LIST}
       FROM subscription_cycles
       WHERE tenant_id = $1
         AND subscription_id = $2
         AND id = $3::uuid
       LIMIT 1`,
      [tenantId, subscriptionId, cycleId]
    );
    return r.rows[0] ?? null;
  } catch (e: unknown) {
    if (isMissingSubscriptionCyclesTable(e)) return null;
    throw e;
  }
}

export async function findSubscriptionCycleForInvoice(
  tenantId: string,
  subscriptionId: string,
  invoiceId: string,
  periodStartYmd: string | null
): Promise<SubscriptionCycleDbRow | null> {
  const period = periodStartYmd && /^\d{4}-\d{2}-\d{2}$/.test(periodStartYmd) ? periodStartYmd : null;
  try {
    const r = await pool.query<SubscriptionCycleDbRow>(
      `SELECT ${SELECT_LIST}
       FROM subscription_cycles
       WHERE tenant_id = $1
         AND subscription_id = $2
         AND (
           invoice_id = $3::uuid
           OR ($4::text IS NOT NULL AND cycle_date = $4::date)
         )
       ORDER BY cycle_date DESC
       LIMIT 1`,
      [tenantId, subscriptionId, invoiceId, period]
    );
    return r.rows[0] ?? null;
  } catch (e: unknown) {
    if (isMissingSubscriptionCyclesTable(e)) return null;
    throw e;
  }
}
