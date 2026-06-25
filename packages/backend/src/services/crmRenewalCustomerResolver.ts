/**
 * Resolve a fatura anterior usada como template na renovação CRM.
 * Corrige desalinhamento entre `subscriptions.current_period_start` e `customer_invoices.period_start`
 * (comum após mudança de periodicidade — ex. mensal → semanal).
 */
import type { BillingInterval } from './billingSubscriptionService.js';
import {
  findCustomerInvoiceBySubscriptionAndPeriod,
  type CustomerInvoiceRow,
} from './customerInvoiceService.js';
import { calculateNextBillingDate } from './subscriptionService.js';

type DbQueryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

export type CrmRenewalPreviousInvoiceResolution =
  | {
      ok: true;
      invoice: CustomerInvoiceRow;
      resolved_via:
        | 'current_period_start_exact'
        | 'computed_previous_cycle'
        | 'latest_before_cycle';
      lookup_period_start: string;
    }
  | {
      ok: false;
      reason: 'missing_current_period_start' | 'no_prior_invoice';
      lookup_attempts: string[];
    };

function subtractCalendarDays(ymd: string, days: number): string {
  const d = Math.max(0, Math.floor(days));
  const [yS, mS, dS] = ymd.slice(0, 10).split('-');
  const dt = new Date(Date.UTC(parseInt(yS, 10), parseInt(mS, 10) - 1, parseInt(dS, 10)));
  dt.setUTCDate(dt.getUTCDate() - d);
  return dt.toISOString().slice(0, 10);
}

function previousCycleStartYmd(cycleStartYmd: string, interval: BillingInterval): string {
  if (interval === 'weekly') {
    return subtractCalendarDays(cycleStartYmd, 7);
  }
  const d = new Date(`${cycleStartYmd.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const probe = d.toISOString().slice(0, 10);
  const next = calculateNextBillingDate(probe, interval, null);
  if (next === cycleStartYmd) {
    return probe;
  }
  let cursor = subtractCalendarDays(cycleStartYmd, 28);
  for (let i = 0; i < 400; i++) {
    const n = calculateNextBillingDate(cursor, interval, null);
    if (n === cycleStartYmd) return cursor;
    if (n > cycleStartYmd) break;
    cursor = n;
  }
  return subtractCalendarDays(cycleStartYmd, interval === 'monthly' ? 31 : 93);
}

async function findLatestSubscriptionInvoiceBefore(
  db: DbQueryable,
  subscriptionId: string,
  beforePeriodStart: string
): Promise<CustomerInvoiceRow | null> {
  const r = await db.query(
    `SELECT ci.id, ci.tenant_id, ci.client_id, ci.subscription_id,
            ci.period_start, ci.period_end, ci.amount_cents, ci.due_date,
            ci.status, ci.paid_at, ci.invoice_number, ci.gateway,
            ci.payment_method, ci.gateway_reference_id, ci.gateway_metadata,
            ci.gateway_status, ci.idempotency_key, ci.origin, ci.invoice_type,
            ci.description, ci.payment_token, ci.charge_id, ci.created_at, ci.updated_at
     FROM customer_invoices ci
     WHERE ci.subscription_id = $1::uuid
       AND ci.origin = 'subscription'
       AND COALESCE(ci.invoice_type, '') <> 'child'
       AND ci.period_start IS NOT NULL
       AND ci.period_start < $2::date
     ORDER BY ci.period_start DESC, ci.created_at DESC
     LIMIT 1`,
    [subscriptionId, beforePeriodStart]
  );
  return (r.rows[0] as CustomerInvoiceRow | undefined) ?? null;
}

export async function resolveCrmRenewalPreviousInvoice(
  db: DbQueryable,
  params: {
    subscriptionId: string;
    cyclePeriodStartYmd: string;
    subscriptionCurrentPeriodStart: string | null | undefined;
    billingInterval: BillingInterval;
  }
): Promise<CrmRenewalPreviousInvoiceResolution> {
  const cycle = params.cyclePeriodStartYmd.slice(0, 10);
  const attempts: string[] = [];

  const current = params.subscriptionCurrentPeriodStart?.trim().slice(0, 10) ?? '';
  if (current) {
    attempts.push(current);
    const exact = await findCustomerInvoiceBySubscriptionAndPeriod(params.subscriptionId, current);
    if (exact) {
      return {
        ok: true,
        invoice: exact,
        resolved_via: 'current_period_start_exact',
        lookup_period_start: current,
      };
    }
  } else {
    return {
      ok: false,
      reason: 'missing_current_period_start',
      lookup_attempts: attempts,
    };
  }

  const computedPrev = previousCycleStartYmd(cycle, params.billingInterval);
  if (computedPrev && computedPrev !== current) {
    attempts.push(computedPrev);
    const byComputed = await findCustomerInvoiceBySubscriptionAndPeriod(
      params.subscriptionId,
      computedPrev
    );
    if (byComputed) {
      return {
        ok: true,
        invoice: byComputed,
        resolved_via: 'computed_previous_cycle',
        lookup_period_start: computedPrev,
      };
    }
  }

  const latest = await findLatestSubscriptionInvoiceBefore(db, params.subscriptionId, cycle);
  if (latest?.period_start) {
    attempts.push(latest.period_start);
    return {
      ok: true,
      invoice: latest,
      resolved_via: 'latest_before_cycle',
      lookup_period_start: latest.period_start,
    };
  }

  return {
    ok: false,
    reason: 'no_prior_invoice',
    lookup_attempts: attempts,
  };
}
