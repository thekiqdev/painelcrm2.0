/**
 * Sprint fix — liga fatura CRM a subscription_cycles (1ª fatura / repair legado).
 * Sem isto, histórico e calendário (SSOT cycles_raw) ficam vazios.
 *
 * Sprint 1 (PLAN_CYCLES…): após a 1ª fatura, seeda C+1 (`next_billing_date`) como pending
 * para a UI mostrar «Gerar próxima» (espelha 23E post-manual materialize).
 */
import { pool } from '../../utils/db.js';
import {
  normalizeBillingCycleKeyYmd,
  normalizeSubscriptionNextBillingYmd,
} from '../../utils/billingCycleKey.js';
import {
  ensureSubscriptionCycle,
  updateSubscriptionCycleLifecycle,
  type SubscriptionCycleMaterializeSource,
} from '../subscriptionCycleMaterializer.js';
import { billingLog } from '../billingLogger.js';

export async function attachCustomerInvoiceToSubscriptionCycle(opts: {
  tenantId: string;
  subscriptionId: string;
  invoiceId: string;
  /** Prefer period_start; fallback due_date. */
  cycleDateYmd: string;
  source?: Extract<SubscriptionCycleMaterializeSource, 'crm_first_invoice' | 'runtime_repair' | 'manual_generate'>;
}): Promise<{ ok: true; cycleId: string | null } | { ok: false; detail: string }> {
  const cycleDate = normalizeBillingCycleKeyYmd(opts.cycleDateYmd);
  if (!cycleDate || !/^\d{4}-\d{2}-\d{2}$/.test(cycleDate)) {
    return { ok: false, detail: 'invalid_cycle_date' };
  }

  const source = opts.source ?? 'crm_first_invoice';
  try {
    const ensured = await ensureSubscriptionCycle(pool, {
      tenantId: opts.tenantId,
      subscriptionId: opts.subscriptionId,
      cycleDateYmd: cycleDate,
      source,
      schedulingMeta: { invoice_id: opts.invoiceId },
    });

    await updateSubscriptionCycleLifecycle(pool, {
      tenantId: opts.tenantId,
      subscriptionId: opts.subscriptionId,
      cycleDate,
      status: 'invoiced',
      jobId: null,
      invoiceId: opts.invoiceId,
      processedAt: true,
      skippedReason: null,
      errorMessage: null,
      extraMeta: { materializer_source: source, crm_invoice_attach: true },
    });

    return { ok: true, cycleId: ensured?.cycleId ?? null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    billingLog('job', 'crm_attach_invoice_to_cycle_error', {
      subscription_id: opts.subscriptionId,
      invoice_id: opts.invoiceId,
      error: msg.slice(0, 500),
    });
    return { ok: false, detail: msg.slice(0, 200) };
  }
}

/**
 * Repair lazy: faturas da assinatura sem ciclo (ou ciclo sem invoice_id) → materializa/liga.
 * Idempotente; fail-open (não bloqueia o GET).
 */
export async function repairOrphanCustomerInvoicesWithoutCycles(opts: {
  tenantId: string;
  subscriptionId: string;
}): Promise<{ repaired: number }> {
  try {
    const r = await pool.query<{
      id: string;
      period_start: string | null;
      due_date: string;
    }>(
      `SELECT ci.id::text AS id,
              ci.period_start::text AS period_start,
              ci.due_date::text AS due_date
       FROM customer_invoices ci
       WHERE ci.tenant_id = $1::uuid
         AND ci.subscription_id = $2::uuid
         AND ci.invoice_type IS DISTINCT FROM 'child'
         AND NOT EXISTS (
           SELECT 1 FROM subscription_cycles sc
           WHERE sc.subscription_id = ci.subscription_id
             AND sc.invoice_id = ci.id
         )
       ORDER BY COALESCE(ci.period_start, ci.due_date::date) ASC, ci.created_at ASC`,
      [opts.tenantId, opts.subscriptionId]
    );

    let repaired = 0;
    for (const inv of r.rows) {
      const cycleDateYmd = normalizeBillingCycleKeyYmd(inv.period_start) || normalizeBillingCycleKeyYmd(inv.due_date);
      if (!cycleDateYmd) continue;
      const res = await attachCustomerInvoiceToSubscriptionCycle({
        tenantId: opts.tenantId,
        subscriptionId: opts.subscriptionId,
        invoiceId: inv.id,
        cycleDateYmd,
        source: 'runtime_repair',
      });
      if (res.ok) repaired += 1;
    }
    if (repaired > 0) {
      billingLog('job', 'crm_orphan_invoice_cycles_repaired', {
        subscription_id: opts.subscriptionId,
        repaired,
      });
    }

    // Após ligar órfãs, tenta seed C+1 (assinaturas antigas sem pending).
    await seedNextPendingCycleIfEligible({
      tenantId: opts.tenantId,
      subscriptionId: opts.subscriptionId,
      source: 'runtime_repair',
    });

    return { repaired };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    billingLog('job', 'crm_orphan_invoice_cycles_repair_error', {
      subscription_id: opts.subscriptionId,
      error: msg.slice(0, 500),
    });
    return { repaired: 0 };
  }
}

/**
 * Materializa a competência de `next_billing_date` como pending (sem invoice),
 * se ainda houver ciclos disponíveis no contrato.
 * Idempotente; fail-open no caller.
 */
export async function seedNextPendingCycleIfEligible(opts: {
  tenantId: string;
  subscriptionId: string;
  source?: Extract<
    SubscriptionCycleMaterializeSource,
    'crm_first_invoice' | 'runtime_repair' | 'manual_generate'
  >;
}): Promise<{
  ok: true;
  seeded: boolean;
  cycleDate: string | null;
  detail: string;
}> {
  const source = opts.source ?? 'crm_first_invoice';
  try {
    const subR = await pool.query<{
      status: string;
      next_billing_date: string | null;
      cycles_unlimited: boolean | null;
      max_cycles: number | null;
    }>(
      `SELECT status::text AS status,
              next_billing_date::text AS next_billing_date,
              COALESCE(cycles_unlimited, true) AS cycles_unlimited,
              max_cycles
       FROM subscriptions
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND type = 'customer'
       LIMIT 1`,
      [opts.subscriptionId, opts.tenantId]
    );
    const sub = subR.rows[0];
    if (!sub) {
      return { ok: true, seeded: false, cycleDate: null, detail: 'subscription_not_found' };
    }
    if (sub.status === 'cancelled' || sub.status === 'completed') {
      return { ok: true, seeded: false, cycleDate: null, detail: 'subscription_cancelled' };
    }

    const nextYmd =
      normalizeBillingCycleKeyYmd(sub.next_billing_date) ||
      normalizeSubscriptionNextBillingYmd(sub.next_billing_date);
    if (!nextYmd || !/^\d{4}-\d{2}-\d{2}$/.test(nextYmd)) {
      return { ok: true, seeded: false, cycleDate: null, detail: 'next_billing_unresolvable' };
    }

    const unlimited = sub.cycles_unlimited !== false;
    const maxCycles =
      sub.max_cycles != null && Number.isFinite(Number(sub.max_cycles))
        ? Math.trunc(Number(sub.max_cycles))
        : null;

    const countR = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n
       FROM subscription_cycles
       WHERE tenant_id = $1::uuid
         AND subscription_id = $2::uuid
         AND invoice_id IS NOT NULL`,
      [opts.tenantId, opts.subscriptionId]
    );
    const consumed = countR.rows[0]?.n ?? 0;
    if (!unlimited && maxCycles != null && maxCycles >= 1 && consumed >= maxCycles) {
      return { ok: true, seeded: false, cycleDate: nextYmd, detail: 'max_cycles_exhausted' };
    }

    const existing = await pool.query<{ invoice_id: string | null }>(
      `SELECT invoice_id::text AS invoice_id
       FROM subscription_cycles
       WHERE tenant_id = $1::uuid
         AND subscription_id = $2::uuid
         AND cycle_date = $3::date
       LIMIT 1`,
      [opts.tenantId, opts.subscriptionId, nextYmd]
    );
    const existingRow = existing.rows[0];
    if (existingRow?.invoice_id?.trim()) {
      return { ok: true, seeded: false, cycleDate: nextYmd, detail: 'next_already_invoiced' };
    }
    if (existingRow) {
      return { ok: true, seeded: false, cycleDate: nextYmd, detail: 'already_pending' };
    }

    await ensureSubscriptionCycle(pool, {
      tenantId: opts.tenantId,
      subscriptionId: opts.subscriptionId,
      cycleDateYmd: nextYmd,
      source,
    });

    billingLog('job', 'crm_seed_next_pending_cycle', {
      subscription_id: opts.subscriptionId,
      cycle_date: nextYmd,
      source,
      consumed,
      max_cycles: maxCycles ?? undefined,
    });

    return { ok: true, seeded: true, cycleDate: nextYmd, detail: 'seeded' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    billingLog('job', 'crm_seed_next_pending_cycle_error', {
      subscription_id: opts.subscriptionId,
      error: msg.slice(0, 500),
    });
    return { ok: true, seeded: false, cycleDate: null, detail: msg.slice(0, 200) };
  }
}
