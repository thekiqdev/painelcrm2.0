/**
 * Sprint 4.2B — Recuperação de ciclos legados marcados como cancelled sem cancelamento real.
 */
import { pool } from '../utils/db.js';
import { billingLog } from './billingLogger.js';
import { isSubscriptionCyclesWriteEnabled } from './subscriptionCyclesWriteFlagService.js';
import { safeTodayYmd } from '../utils/billingSafeDate.js';

export const OFFICIAL_CYCLE_CANCEL_MARKERS = [
  'cancel_subscription',
  'cancel_invoice',
  'cancel_cycle',
  'subscription_cancelled',
  'manual_cancel',
  'billing.cancel_invoice',
  'billing.cancel_subscription',
  'billing.cancel_charge',
] as const;

export type LegacyCycleCandidate = {
  cycle_id: string;
  tenant_id: string;
  subscription_id: string;
  cycle_date: string;
  skipped_reason: string | null;
  subscription_status: string;
};

export function hasOfficialCycleCancellation(input: {
  cycleStatus?: string | null;
  invoiceId?: string | null;
  invoiceStatus?: string | null;
  skippedReason?: string | null;
  subscriptionStatus: string;
}): boolean {
  const sub = (input.subscriptionStatus ?? '').toLowerCase();
  if (sub === 'cancelled') return true;

  const invSt = (input.invoiceStatus ?? '').toLowerCase();
  if (input.invoiceId && invSt === 'cancelled') return true;

  const reason = (input.skippedReason ?? '').toLowerCase().trim();
  if (!reason) return false;
  return OFFICIAL_CYCLE_CANCEL_MARKERS.some((marker) => reason.includes(marker.toLowerCase()));
}

export function isLegacyFalseCancelledCycle(input: {
  cycleStatus?: string | null;
  invoiceId?: string | null;
  invoiceStatus?: string | null;
  skippedReason?: string | null;
  subscriptionStatus: string;
}): boolean {
  const cycle = (input.cycleStatus ?? '').toLowerCase();
  if (cycle !== 'cancelled') return false;
  if (input.invoiceId) return false;
  if ((input.subscriptionStatus ?? '').toLowerCase() === 'cancelled') return false;
  return !hasOfficialCycleCancellation(input);
}

export async function listLegacyFalseCancelledCycles(options?: {
  tenantId?: string;
  subscriptionId?: string;
  limit?: number;
}): Promise<LegacyCycleCandidate[]> {
  const params: unknown[] = [];
  let where = `WHERE sc.status = 'cancelled'
    AND sc.invoice_id IS NULL
    AND s.type = 'customer'
    AND s.status <> 'cancelled'`;
  if (options?.tenantId) {
    params.push(options.tenantId);
    where += ` AND sc.tenant_id = $${params.length}::uuid`;
  }
  if (options?.subscriptionId) {
    params.push(options.subscriptionId);
    where += ` AND sc.subscription_id = $${params.length}::uuid`;
  }
  const limit = Math.min(options?.limit ?? 5000, 50000);
  params.push(limit);

  const r = await pool
    .query<LegacyCycleCandidate>(
      `SELECT sc.id::text AS cycle_id,
              sc.tenant_id::text,
              sc.subscription_id::text,
              sc.cycle_date::text AS cycle_date,
              sc.skipped_reason,
              s.status::text AS subscription_status
       FROM subscription_cycles sc
       INNER JOIN subscriptions s ON s.id = sc.subscription_id AND s.tenant_id = sc.tenant_id
       ${where}
       ORDER BY sc.updated_at DESC
       LIMIT $${params.length}`,
      params
    )
    .catch(() => ({ rows: [] as LegacyCycleCandidate[] }));

  return r.rows.filter((row) =>
    isLegacyFalseCancelledCycle({
      cycleStatus: 'cancelled',
      invoiceId: null,
      skippedReason: row.skipped_reason,
      subscriptionStatus: row.subscription_status,
    })
  );
}

export async function repairLegacyFalseCancelledCycles(options?: {
  tenantId?: string;
  subscriptionId?: string;
  dryRun?: boolean;
}): Promise<{ repaired: number; cycle_ids: string[]; cycle_dates: string[] }> {
  const candidates = await listLegacyFalseCancelledCycles({
    tenantId: options?.tenantId,
    subscriptionId: options?.subscriptionId,
  });
  if (options?.dryRun || candidates.length === 0) {
    return {
      repaired: 0,
      cycle_ids: candidates.map((c) => c.cycle_id),
      cycle_dates: candidates.map((c) => c.cycle_date),
    };
  }
  if (!(await isSubscriptionCyclesWriteEnabled())) {
    return { repaired: 0, cycle_ids: [], cycle_dates: [] };
  }

  const cycleIds = candidates.map((c) => c.cycle_id);
  const r = await pool.query<{ id: string; cycle_date: string }>(
    `UPDATE subscription_cycles
     SET status = 'pending',
         skipped_reason = NULL,
         error_message = NULL,
         processed_at = NULL,
         updated_at = now()
     WHERE id = ANY($1::uuid[])
       AND status = 'cancelled'
       AND invoice_id IS NULL
     RETURNING id::text, cycle_date::text`,
    [cycleIds]
  );

  const repaired = r.rowCount ?? 0;
  if (repaired > 0) {
    billingLog('worker', 'legacy_cancelled_cycle_recovery', {
      repaired,
      cycle_ids: r.rows.map((row) => row.id).join(','),
      at: safeTodayYmd(),
    });
  }

  return {
    repaired,
    cycle_ids: r.rows.map((row) => row.id),
    cycle_dates: r.rows.map((row) => row.cycle_date),
  };
}
