/**
 * Sprint 5.0-24C/24E — transições oficiais de lifecycle de subscription_cycle.
 * INV-19: invoiced ⇒ invoice_id válido (estado estável).
 * INV-20: purge de invoice ⇒ invoiced → pending via reopenCycle.
 * INV-21: competência reaberta ⇒ job executável (orquestrado via billingJobExecutionResetService).
 */
import { pool } from '../utils/db.js';
import { billingLog } from './billingLogger.js';
import { isSubscriptionCyclesWriteEnabled } from './subscriptionCyclesWriteFlagService.js';
import type { DbQueryable } from './subscriptionCycleMaterializer.js';
import {
  repairJobExecutionForOpenCycles,
  resetJobExecutionForReopenedCompetencies,
} from './billingJobExecutionResetService.js';

export type ReopenCycleAfterInvoiceRemovedResult = {
  cycle_ids: string[];
  cycle_dates: string[];
  jobs_reset: number;
};

export type RepairInvoicedInvariantResult = {
  cycles_reopened: number;
  cycle_ids: string[];
  cycle_dates: string[];
  jobs_reset: number;
};

function isMissingSubscriptionCyclesTable(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const msg = e instanceof Error ? e.message : String(e);
  return (
    code === '42P01' ||
    /relation\s+["']?subscription_cycles["']?\s+does not exist/i.test(msg)
  );
}

function buildReopenMetadata(reason: string, invoiceId: string | null): Record<string, unknown> {
  return {
    lifecycle: 'reopen_after_invoice_removed',
    reopen_reason: reason,
    reopened_at: new Date().toISOString(),
    ...(invoiceId ? { previous_invoice_id: invoiceId } : {}),
  };
}

type ReopenedCycleRow = {
  id: string;
  cycle_date: string;
  subscription_id: string;
  tenant_id?: string;
};

/** Orquestra reset de job após ciclo(s) reaberto(s) — Opção C. */
async function syncJobExecutionAfterCycleReopen(
  db: DbQueryable,
  rows: ReopenedCycleRow[],
  reason: string,
  defaultTenantId?: string
): Promise<number> {
  if (rows.length === 0) return 0;

  const groups = new Map<string, { tenantId: string; subscriptionId: string; dates: string[] }>();
  for (const row of rows) {
    const tenantId = row.tenant_id ?? defaultTenantId;
    if (!tenantId) continue;
    const key = `${tenantId}:${row.subscription_id}`;
    const group = groups.get(key) ?? { tenantId, subscriptionId: row.subscription_id, dates: [] };
    group.dates.push(row.cycle_date);
    groups.set(key, group);
  }

  let total = 0;
  for (const group of groups.values()) {
    const jobReset = await resetJobExecutionForReopenedCompetencies(db, {
      tenantId: group.tenantId,
      subscriptionId: group.subscriptionId,
      cycleDatesYmd: group.dates,
      reason,
    });
    total += jobReset.jobs_reset;
  }
  return total;
}

/**
 * Transição oficial: invoice removida ⇒ ciclo volta a pending + job resetado.
 * Chamado pelo invoice admin **antes** do DELETE físico da fatura.
 */
export async function reopenCyclesAfterInvoiceRemoved(
  tenantId: string,
  invoiceId: string,
  options?: { reason?: string; db?: DbQueryable }
): Promise<ReopenCycleAfterInvoiceRemovedResult> {
  if (!(await isSubscriptionCyclesWriteEnabled())) {
    return { cycle_ids: [], cycle_dates: [], jobs_reset: 0 };
  }

  const db = options?.db ?? pool;
  const reason = options?.reason ?? 'invoice_purged';
  const auditMeta = JSON.stringify(buildReopenMetadata(reason, invoiceId));

  try {
    const r = await db.query<ReopenedCycleRow>(
      `UPDATE subscription_cycles
       SET invoice_id = NULL,
           status = 'pending',
           processed_at = NULL,
           skipped_reason = NULL,
           error_message = NULL,
           metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
           updated_at = now()
       WHERE tenant_id = $1::uuid
         AND invoice_id = $2::uuid
       RETURNING id::text, cycle_date::text, subscription_id::text`,
      [tenantId, invoiceId, auditMeta]
    );

    const cycle_ids = r.rows.map((row) => row.id);
    const cycle_dates = r.rows.map((row) => row.cycle_date);
    const jobs_reset = await syncJobExecutionAfterCycleReopen(db, r.rows, reason, tenantId);

    if (cycle_ids.length > 0) {
      billingLog('worker', 'subscription_cycle_reopened', {
        tenant_id: tenantId,
        invoice_id: invoiceId,
        reason,
        cycle_ids: cycle_ids.join(','),
        cycle_dates: cycle_dates.join(','),
        jobs_reset,
      });
    }

    return { cycle_ids, cycle_dates, jobs_reset };
  } catch (e: unknown) {
    if (isMissingSubscriptionCyclesTable(e)) {
      return { cycle_ids: [], cycle_dates: [], jobs_reset: 0 };
    }
    throw e;
  }
}

/**
 * Repara violação INV-19: status=invoiced sem invoice_id (legado / ON DELETE SET NULL).
 * Sincroniza jobs (INV-21) para competências reabertas e ciclos já abertos bloqueados.
 */
export async function repairInvoicedCyclesWithoutInvoice(
  tenantId: string,
  subscriptionId: string,
  options?: { reason?: string; cycleId?: string | null; db?: DbQueryable }
): Promise<RepairInvoicedInvariantResult> {
  if (!(await isSubscriptionCyclesWriteEnabled())) {
    return { cycles_reopened: 0, cycle_ids: [], cycle_dates: [], jobs_reset: 0 };
  }

  const db = options?.db ?? pool;
  const reason = options?.reason ?? 'invoiced_without_invoice_invariant';
  const auditMeta = JSON.stringify(buildReopenMetadata(reason, null));

  const params: unknown[] = [tenantId, subscriptionId, auditMeta];
  let cycleFilter = '';
  if (options?.cycleId?.trim()) {
    params.push(options.cycleId.trim());
    cycleFilter = `AND id = $${params.length}::uuid`;
  }

  try {
    const r = await db.query<ReopenedCycleRow>(
      `UPDATE subscription_cycles
       SET status = 'pending',
           processed_at = NULL,
           skipped_reason = NULL,
           error_message = NULL,
           metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
           updated_at = now()
       WHERE tenant_id = $1::uuid
         AND subscription_id = $2::uuid
         AND status = 'invoiced'
         AND invoice_id IS NULL
         ${cycleFilter}
       RETURNING id::text, cycle_date::text, subscription_id::text`,
      params
    );

    const cycle_ids = r.rows.map((row) => row.id);
    const cycle_dates = r.rows.map((row) => row.cycle_date);

    let jobs_reset = await syncJobExecutionAfterCycleReopen(db, r.rows, reason, tenantId);

    const openJobRepair = await repairJobExecutionForOpenCycles(db, {
      tenantId,
      subscriptionId,
      cycleId: options?.cycleId ?? null,
      reason: `${reason}_inv21`,
    });
    jobs_reset += openJobRepair.jobs_reset;

    if (cycle_ids.length > 0 || jobs_reset > 0) {
      billingLog('worker', 'subscription_cycle_invariant_repair', {
        tenant_id: tenantId,
        subscription_id: subscriptionId,
        reason,
        cycle_ids: cycle_ids.join(','),
        cycle_dates: cycle_dates.join(','),
        jobs_reset,
      });
    }

    return {
      cycles_reopened: cycle_ids.length,
      cycle_ids,
      cycle_dates,
      jobs_reset,
    };
  } catch (e: unknown) {
    if (isMissingSubscriptionCyclesTable(e)) {
      return { cycles_reopened: 0, cycle_ids: [], cycle_dates: [], jobs_reset: 0 };
    }
    throw e;
  }
}

/** Reparo em lote (billing recovery / superadmin). */
export async function repairInvoicedCyclesWithoutInvoiceBatch(options?: {
  tenantId?: string;
  limit?: number;
  reason?: string;
  db?: DbQueryable;
}): Promise<RepairInvoicedInvariantResult> {
  if (!(await isSubscriptionCyclesWriteEnabled())) {
    return { cycles_reopened: 0, cycle_ids: [], cycle_dates: [], jobs_reset: 0 };
  }

  const db = options?.db ?? pool;
  const limit = Math.min(options?.limit ?? 500, 5000);
  const reason = options?.reason ?? 'batch_invoiced_without_invoice_invariant';
  const auditMeta = JSON.stringify(buildReopenMetadata(reason, null));

  try {
    const r = await db.query<ReopenedCycleRow>(
      `WITH targets AS (
         SELECT id
         FROM subscription_cycles
         WHERE status = 'invoiced'
           AND invoice_id IS NULL
           AND ($1::uuid IS NULL OR tenant_id = $1::uuid)
         LIMIT $2
       )
       UPDATE subscription_cycles sc
       SET status = 'pending',
           processed_at = NULL,
           skipped_reason = NULL,
           error_message = NULL,
           metadata = COALESCE(sc.metadata, '{}'::jsonb) || $3::jsonb,
           updated_at = now()
       FROM targets t
       WHERE sc.id = t.id
       RETURNING sc.id::text, sc.cycle_date::text, sc.subscription_id::text, sc.tenant_id::text`,
      [options?.tenantId ?? null, limit, auditMeta]
    );

    const cycle_ids = r.rows.map((row) => row.id);
    const cycle_dates = r.rows.map((row) => row.cycle_date);
    const jobs_reset = await syncJobExecutionAfterCycleReopen(db, r.rows, reason);

    return {
      cycles_reopened: cycle_ids.length,
      cycle_ids,
      cycle_dates,
      jobs_reset,
    };
  } catch (e: unknown) {
    if (isMissingSubscriptionCyclesTable(e)) {
      return { cycles_reopened: 0, cycle_ids: [], cycle_dates: [], jobs_reset: 0 };
    }
    throw e;
  }
}
