/**
 * Projeção de receita de assinaturas CRM (leitura) para relatórios financeiros.
 * Não altera o motor de geração de faturas.
 */
import { pool } from '../utils/db.js';
import { calculateNextBillingDate } from './subscriptionService.js';
import type { BillingInterval } from './billingService.js';
import { isSubscriptionCyclesReadEnabled } from './subscriptionCyclesReadFlagService.js';

const PENDING_INVOICE = new Set(['pending', 'waiting_payment', 'processing', 'overdue']);

function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}

function ymd(s: string | null | undefined): string | null {
  if (!s || s.length < 10) return null;
  return s.slice(0, 10);
}

function ymOfYmd(ymd: string): string {
  return ymd.slice(0, 7);
}

function cmpYmd(a: string, b: string): number {
  return a.localeCompare(b);
}

function billingIntervalLabelPt(interval: string): string {
  const m: Record<string, string> = {
    monthly: 'Mensal',
    quarterly: 'Trimestral',
    semi_annual: 'Semestral',
    yearly: 'Anual',
  };
  return m[interval] ?? interval;
}

function subscriptionStatusLabelPt(row: {
  status: string;
  cancel_at_period_end: boolean;
}): string {
  if (row.status === 'cancelled') return 'Encerrada';
  if (row.status !== 'active') return row.status;
  if (row.cancel_at_period_end) return 'Ativa (encerra ao fim do período)';
  return 'Ativa';
}

export interface SubscriptionProjectionMonthRow {
  month: string;
  /** Faturas de assinatura pagas no mês (paid_at). */
  subscription_revenue_realized: number;
  /** Faturas de assinatura emitidas e não pagas com vencimento no mês. */
  subscription_revenue_pending: number;
  /** Ciclos futuros sem fatura, âncora no mês. */
  subscription_revenue_projected: number;
}

export interface SubscriptionProjectionTableRow {
  subscription_id: string;
  client_id: string | null;
  client_name: string;
  amount_recurring: number;
  billing_interval: string;
  periodicity_label_pt: string;
  next_billing_date: string;
  paid_cycles_in_period: number;
  pending_cycles_in_period: number;
  projected_revenue_in_period: number;
  status: string;
  cycles_unlimited: boolean;
  max_cycles: number | null;
}

export interface SubscriptionsProjectionBlock {
  active_subscriptions_count: number;
  projected_subscription_revenue: number;
  pending_subscription_revenue: number;
  paid_subscription_revenue: number;
  projected_cycles_count: number;
  paid_cycles_count: number;
  pending_cycles_count: number;
  potential_subscription_revenue: number;
  cycles_read_used: boolean;
  by_month: SubscriptionProjectionMonthRow[];
  rows: SubscriptionProjectionTableRow[];
}

type SubRow = {
  id: string;
  customer_id: string | null;
  client_name: string | null;
  amount_cents: number;
  billing_interval: string;
  billing_anchor_day: number | null;
  next_billing_date: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  cycles_unlimited: boolean;
  max_cycles: number | null;
};

type InvRow = {
  subscription_id: string;
  amount_cents: number;
  status: string;
  due_date: string | null;
  period_start: string | null;
  paid_at: string | null;
};

type CycleRow = {
  subscription_id: string;
  cycle_date: string;
  status: string;
  invoice_id: string | null;
};

function isMissingSubscriptionCyclesTable(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const msg = e instanceof Error ? e.message : String(e);
  return code === '42P01' || /subscription_cycles/i.test(msg);
}

function isMissingCyclesColumns(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /cycles_unlimited|max_cycles/i.test(msg);
}

export async function buildSubscriptionsProjection(
  tenantId: string,
  range: { from: string; to: string },
  monthlyMonthKeys: string[]
): Promise<SubscriptionsProjectionBlock> {
  const { from, to } = range;
  const cyclesRead = await isSubscriptionCyclesReadEnabled();

  let subsR;
  try {
    subsR = await pool.query<SubRow>(
      `SELECT s.id::text,
              s.customer_id::text,
              c.name AS client_name,
              s.amount_cents,
              s.billing_interval::text,
              s.billing_anchor_day,
              s.next_billing_date::text,
              s.status::text,
              s.cancel_at_period_end,
              s.current_period_end::text,
              COALESCE(s.cycles_unlimited, true) AS cycles_unlimited,
              s.max_cycles
       FROM subscriptions s
       LEFT JOIN clients c ON c.id = s.customer_id
         AND EXISTS (SELECT 1 FROM users u WHERE u.id = c.user_id AND u.tenant_id = s.tenant_id)
       WHERE s.tenant_id = $1 AND s.type = 'customer' AND s.status = 'active'
       ORDER BY s.created_at DESC`,
      [tenantId]
    );
  } catch (e: unknown) {
    if (isMissingCyclesColumns(e)) {
      subsR = await pool.query<SubRow>(
        `SELECT s.id::text,
                s.customer_id::text,
                c.name AS client_name,
                s.amount_cents,
                s.billing_interval::text,
                s.billing_anchor_day,
                s.next_billing_date::text,
                s.status::text,
                s.cancel_at_period_end,
                s.current_period_end::text,
                true AS cycles_unlimited,
                NULL::int AS max_cycles
         FROM subscriptions s
         LEFT JOIN clients c ON c.id = s.customer_id
           AND EXISTS (SELECT 1 FROM users u WHERE u.id = c.user_id AND u.tenant_id = s.tenant_id)
         WHERE s.tenant_id = $1 AND s.type = 'customer' AND s.status = 'active'
         ORDER BY s.created_at DESC`,
        [tenantId]
      );
    } else {
      throw e;
    }
  }

  const subs = subsR.rows;
  const subIds = subs.map((s) => s.id);

  const invR = await pool.query<InvRow>(
    `SELECT subscription_id::text,
            amount_cents,
            status::text,
            due_date::text,
            period_start::text,
            paid_at::text
     FROM customer_invoices
     WHERE tenant_id = $1
       AND subscription_id IS NOT NULL
       AND invoice_type IS DISTINCT FROM 'child'
       AND status IS DISTINCT FROM 'cancelled'`,
    [tenantId]
  );
  const invBySub = new Map<string, InvRow[]>();
  for (const row of invR.rows) {
    const arr = invBySub.get(row.subscription_id) ?? [];
    arr.push(row);
    invBySub.set(row.subscription_id, arr);
  }

  let cycles: CycleRow[] = [];
  if (cyclesRead && subIds.length > 0) {
    try {
      const cycR = await pool.query<CycleRow>(
        `SELECT subscription_id::text, cycle_date::text, status::text, invoice_id::text
         FROM subscription_cycles
         WHERE tenant_id = $1 AND subscription_id = ANY($2::uuid[])`,
        [tenantId, subIds]
      );
      cycles = cycR.rows;
    } catch (e: unknown) {
      if (!isMissingSubscriptionCyclesTable(e)) throw e;
      cycles = [];
    }
  }
  const cyclesBySub = new Map<string, CycleRow[]>();
  for (const c of cycles) {
    const arr = cyclesBySub.get(c.subscription_id) ?? [];
    arr.push(c);
    cyclesBySub.set(c.subscription_id, arr);
  }

  const monthPaid = new Map<string, number>();
  const monthPending = new Map<string, number>();
  const monthProjected = new Map<string, number>();
  for (const m of monthlyMonthKeys) {
    monthPaid.set(m, 0);
    monthPending.set(m, 0);
    monthProjected.set(m, 0);
  }

  let totalPaid = 0;
  let totalPending = 0;
  let totalProjected = 0;
  let paidCyclesPeriod = 0;
  let pendingCyclesPeriod = 0;
  let projectedCycles = 0;

  const tableRows: SubscriptionProjectionTableRow[] = [];

  for (const sub of subs) {
    const invs = invBySub.get(sub.id) ?? [];
    const cycList = cyclesBySub.get(sub.id) ?? [];
    const anchor = sub.billing_anchor_day ?? (ymd(sub.next_billing_date) ? parseInt(sub.next_billing_date.slice(8, 10), 10) : 1);
    const interval = sub.billing_interval as BillingInterval;

    const invoiceCount = invs.length;
    const capRemaining = sub.cycles_unlimited ? Number.POSITIVE_INFINITY : Math.max(0, (sub.max_cycles ?? 0) - invoiceCount);
    let usedProjectedSlots = 0;
    let subPaidPeriod = 0;
    let subPendingPeriod = 0;
    let subProjectedPeriod = 0;

    /** Datas de cobrança já cobertas por fatura ou ciclo (não projetar de novo). */
    const blocked = new Set<string>();
    for (const inv of invs) {
      const ps = ymd(inv.period_start);
      const due = ymd(inv.due_date);
      if (ps) blocked.add(ps);
      if (due) blocked.add(due);
    }

    if (cyclesRead && cycList.length > 0) {
      for (const c of cycList) {
        const cd = ymd(c.cycle_date);
        if (!cd) continue;
        if (c.invoice_id || c.status === 'invoiced' || c.status === 'failed') {
          blocked.add(cd);
        }
      }
      for (const c of cycList) {
        const cd = ymd(c.cycle_date);
        if (!cd) continue;
        if (c.invoice_id || c.status === 'invoiced') continue;
        if (!['pending', 'queued', 'processing'].includes(c.status)) continue;
        if (cmpYmd(cd, from) < 0 || cmpYmd(cd, to) > 0) continue;
        if (blocked.has(cd)) continue;
        if (usedProjectedSlots >= capRemaining) break;
        const ym = ymOfYmd(cd);
        if (!monthProjected.has(ym)) continue;
        monthProjected.set(ym, (monthProjected.get(ym) ?? 0) + sub.amount_cents);
        totalProjected += sub.amount_cents;
        projectedCycles += 1;
        usedProjectedSlots += 1;
        subProjectedPeriod += sub.amount_cents;
        blocked.add(cd);
      }
    }

    for (const inv of invs) {
      const paidAt = ymd(inv.paid_at);
      if (inv.status === 'paid' && paidAt && cmpYmd(paidAt, from) >= 0 && cmpYmd(paidAt, to) <= 0) {
        const ym = ymOfYmd(paidAt);
        if (monthPaid.has(ym)) {
          monthPaid.set(ym, (monthPaid.get(ym) ?? 0) + inv.amount_cents);
        }
        totalPaid += inv.amount_cents;
        paidCyclesPeriod += 1;
        subPaidPeriod += 1;
      } else if (PENDING_INVOICE.has(inv.status)) {
        const due = ymd(inv.due_date);
        if (due && cmpYmd(due, from) >= 0 && cmpYmd(due, to) <= 0) {
          const ym = ymOfYmd(due);
          if (monthPending.has(ym)) {
            monthPending.set(ym, (monthPending.get(ym) ?? 0) + inv.amount_cents);
          }
          totalPending += inv.amount_cents;
          pendingCyclesPeriod += 1;
          subPendingPeriod += 1;
        }
      }
    }

    let nextProj = ymd(sub.next_billing_date);
    if (!nextProj) {
      tableRows.push({
        subscription_id: sub.id,
        client_id: sub.customer_id,
        client_name: sub.client_name?.trim() || 'Cliente',
        amount_recurring: centsToReais(sub.amount_cents),
        billing_interval: sub.billing_interval,
        periodicity_label_pt: billingIntervalLabelPt(sub.billing_interval),
        next_billing_date: '',
        paid_cycles_in_period: subPaidPeriod,
        pending_cycles_in_period: subPendingPeriod,
        projected_revenue_in_period: centsToReais(subProjectedPeriod),
        status: subscriptionStatusLabelPt(sub),
        cycles_unlimited: sub.cycles_unlimited,
        max_cycles: sub.max_cycles,
      });
      continue;
    }

    let guard = 0;
    const periodEndCap = sub.cancel_at_period_end ? ymd(sub.current_period_end) : null;

    while (guard < 480 && cmpYmd(nextProj, to) <= 0) {
      guard += 1;
      if (periodEndCap && cmpYmd(nextProj, periodEndCap) > 0) break;
      if (usedProjectedSlots >= capRemaining) break;

      if (!blocked.has(nextProj) && cmpYmd(nextProj, from) >= 0 && cmpYmd(nextProj, to) <= 0) {
        const ym = ymOfYmd(nextProj);
        if (monthProjected.has(ym)) {
          monthProjected.set(ym, (monthProjected.get(ym) ?? 0) + sub.amount_cents);
        }
        totalProjected += sub.amount_cents;
        projectedCycles += 1;
        usedProjectedSlots += 1;
        subProjectedPeriod += sub.amount_cents;
      }
      blocked.add(nextProj);
      nextProj = calculateNextBillingDate(nextProj, interval, anchor);
    }

    tableRows.push({
      subscription_id: sub.id,
      client_id: sub.customer_id,
      client_name: sub.client_name?.trim() || 'Cliente',
      amount_recurring: centsToReais(sub.amount_cents),
      billing_interval: sub.billing_interval,
      periodicity_label_pt: billingIntervalLabelPt(sub.billing_interval),
      next_billing_date: sub.next_billing_date.slice(0, 10),
      paid_cycles_in_period: subPaidPeriod,
      pending_cycles_in_period: subPendingPeriod,
      projected_revenue_in_period: centsToReais(subProjectedPeriod),
      status: subscriptionStatusLabelPt(sub),
      cycles_unlimited: sub.cycles_unlimited,
      max_cycles: sub.max_cycles,
    });
  }

  const by_month: SubscriptionProjectionMonthRow[] = monthlyMonthKeys.map((month) => ({
    month,
    subscription_revenue_realized: centsToReais(monthPaid.get(month) ?? 0),
    subscription_revenue_pending: centsToReais(monthPending.get(month) ?? 0),
    subscription_revenue_projected: centsToReais(monthProjected.get(month) ?? 0),
  }));

  const potential = totalPaid + totalPending + totalProjected;

  return {
    active_subscriptions_count: subs.length,
    projected_subscription_revenue: centsToReais(totalProjected),
    pending_subscription_revenue: centsToReais(totalPending),
    paid_subscription_revenue: centsToReais(totalPaid),
    projected_cycles_count: projectedCycles,
    paid_cycles_count: paidCyclesPeriod,
    pending_cycles_count: pendingCyclesPeriod,
    potential_subscription_revenue: centsToReais(potential),
    cycles_read_used: cyclesRead && subIds.length > 0 && cycles.length > 0,
    by_month,
    rows: tableRows,
  };
}
