/**
 * Analytics read-only de assinaturas CRM (type=customer).
 * Compõe buildSubscriptionsProjection + consultas SQL leves — sem motor paralelo.
 */
import { pool } from '../utils/db.js';
import { resolveSummaryRange } from '../controllers/financialController.js';
import {
  buildSubscriptionsProjection,
  crmSubscriptionArrFromMonthlyCents,
  normalizeCrmSubscriptionAmountToMonthlyCents,
  type SubscriptionsProjectionBlock,
} from './financialReportsSubscriptionProjection.js';
import { computeMrrWithPendingChanges } from './crmSubscriptionsPendingMrr.js';

export type CrmSubscriptionsAnalyticsRange = { from: string; to: string; preset?: string };

export type CrmSubscriptionsIntervalBucket = {
  billing_interval: string;
  label_pt: string;
  count: number;
  mrr_cents: number;
};

export type CrmSubscriptionsTopClient = {
  client_id: string | null;
  client_name: string;
  mrr_cents: number;
};

export type CrmSubscriptionsLastPayment = {
  client_id: string | null;
  client_name: string;
  amount_cents: number;
  paid_at: string;
} | null;

export type CrmSubscriptionsGrowthMonth = {
  month: string;
  new_count: number;
  cancelled_count: number;
};

export type CrmSubscriptionsAnalytics = {
  period: CrmSubscriptionsAnalyticsRange;
  mrr_cents: number;
  /** MRR projetado após aplicar `metadata.pending_crm_contract` nas assinaturas ativas. */
  mrr_after_pending_cents: number;
  /** Diferença entre MRR após pendências e MRR atual. */
  mrr_pending_delta_cents: number;
  arr_cents: number;
  active_count: number;
  paused_count: number;
  paused_mrr_cents: number;
  paused_arr_cents: number;
  new_count: number;
  cancelled_count: number;
  net_growth: number;
  average_ticket_cents: number;
  upcoming_7d_cents: number;
  last_payment: CrmSubscriptionsLastPayment;
  annual_projection_cents: number;
  by_interval: CrmSubscriptionsIntervalBucket[];
  top_clients: CrmSubscriptionsTopClient[];
  growth_by_month: CrmSubscriptionsGrowthMonth[];
  subscriptions_projection: SubscriptionsProjectionBlock;
  projection_12m: SubscriptionsProjectionBlock;
};

/** Periodicidades de cobrança suportadas em assinaturas CRM (ordem fixa na distribuição). */
export const CRM_SUBSCRIPTION_BILLING_INTERVALS = [
  'weekly',
  'monthly',
  'quarterly',
  'semi_annual',
  'yearly',
] as const;

const INTERVAL_LABEL_PT: Record<string, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semi_annual: 'Semestral',
  yearly: 'Anual',
};

function addDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function todayYmdUtc(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function monthKeysBetween(fromYmd: string, toYmd: string): string[] {
  let y = parseInt(fromYmd.slice(0, 4), 10);
  let m = parseInt(fromYmd.slice(5, 7), 10);
  const endY = parseInt(toYmd.slice(0, 4), 10);
  const endM = parseInt(toYmd.slice(5, 7), 10);
  const keys: string[] = [];
  while (y < endY || (y === endY && m <= endM)) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

/** Presets do período (financeiro + trimestre/semestre para dashboard de assinaturas). */
export function resolveCrmSubscriptionsAnalyticsRange(
  q: Record<string, unknown>
): CrmSubscriptionsAnalyticsRange {
  const preset = typeof q.preset === 'string' ? q.preset.trim() : '';
  const now = new Date();
  const y = now.getUTCFullYear();
  const m0 = now.getUTCMonth();

  if (preset === 'current_quarter') {
    const qStart = Math.floor(m0 / 3) * 3;
    const from = `${y}-${String(qStart + 1).padStart(2, '0')}-01`;
    const last = new Date(Date.UTC(y, qStart + 3, 0)).getUTCDate();
    const to = `${y}-${String(qStart + 3).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    return { from, to, preset };
  }
  if (preset === 'current_semester') {
    const h1 = m0 < 6;
    const from = h1 ? `${y}-01-01` : `${y}-07-01`;
    const to = h1 ? `${y}-06-30` : `${y}-12-31`;
    return { from, to, preset };
  }
  if (preset === 'current_week') {
    const to = todayYmdUtc();
    const from = addDaysYmd(to, -6);
    return { from, to, preset };
  }

  return resolveSummaryRange(q);
}

function reaisToCents(reais: number): number {
  return Math.round(reais * 100);
}

function sumProjectionCashCents(block: SubscriptionsProjectionBlock): number {
  let total = 0;
  for (const row of block.by_month) {
    total += reaisToCents(row.subscription_revenue_pending + row.subscription_revenue_projected);
  }
  return total;
}

export async function getCrmSubscriptionsAnalytics(
  tenantId: string,
  range: CrmSubscriptionsAnalyticsRange
): Promise<CrmSubscriptionsAnalytics> {
  const { from, to } = range;
  const periodMonthKeys = monthKeysBetween(from, to);

  const today = todayYmdUtc();
  const projection12To = addDaysYmd(today, 365);
  const projection12MonthKeys = monthKeysBetween(today.slice(0, 7) + '-01', projection12To);

  const [
    activeSubsR,
    pausedSubsR,
    newCountR,
    cancelledCountR,
    upcoming7dR,
    lastPaymentR,
    growthNewR,
    growthCancelledR,
    subscriptions_projection,
    projection_12m,
  ] = await Promise.all([
    pool.query<{ amount_cents: string; billing_interval: string; metadata: unknown }>(
      `SELECT amount_cents::text, billing_interval::text, metadata
       FROM subscriptions
       WHERE tenant_id = $1 AND type = 'customer' AND status = 'active'`,
      [tenantId]
    ),
    pool.query<{ amount_cents: string; billing_interval: string }>(
      `SELECT amount_cents::text, billing_interval::text
       FROM subscriptions
       WHERE tenant_id = $1 AND type = 'customer' AND status = 'paused'`,
      [tenantId]
    ),
    pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c
       FROM subscriptions
       WHERE tenant_id = $1 AND type = 'customer'
         AND created_at::date >= $2::date AND created_at::date <= $3::date`,
      [tenantId, from, to]
    ),
    pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c
       FROM subscriptions
       WHERE tenant_id = $1 AND type = 'customer'
         AND status = 'cancelled'
         AND cancelled_at IS NOT NULL
         AND cancelled_at::date >= $2::date AND cancelled_at::date <= $3::date`,
      [tenantId, from, to]
    ),
    pool.query<{ s: string }>(
      `SELECT COALESCE(SUM(ci.amount_cents), 0)::text AS s
       FROM customer_invoices ci
       WHERE ci.tenant_id = $1
         AND ci.subscription_id IS NOT NULL
         AND ci.status IN ('pending', 'overdue')
         AND ci.due_date >= CURRENT_DATE
         AND ci.due_date <= (CURRENT_DATE + INTERVAL '7 day')`,
      [tenantId]
    ),
    pool.query<{
      client_id: string | null;
      client_name: string | null;
      amount_cents: string;
      paid_at: string;
    }>(
      `SELECT ci.client_id::text,
              TRIM(COALESCE(
                NULLIF(TRIM(c.name), ''),
                NULLIF(TRIM(c.company), ''),
                NULLIF(TRIM(c.email), ''),
                'Cliente'
              )) AS client_name,
              ci.amount_cents::text,
              ci.paid_at::text
       FROM customer_invoices ci
       LEFT JOIN clients c ON c.id = ci.client_id
         AND EXISTS (SELECT 1 FROM users u WHERE u.id = c.user_id AND u.tenant_id = ci.tenant_id)
       WHERE ci.tenant_id = $1
         AND ci.subscription_id IS NOT NULL
         AND ci.status = 'paid'
         AND ci.paid_at IS NOT NULL
       ORDER BY ci.paid_at DESC
       LIMIT 1`,
      [tenantId]
    ),
    pool.query<{ month: string; c: string }>(
      `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
              COUNT(*)::text AS c
       FROM subscriptions
       WHERE tenant_id = $1 AND type = 'customer'
         AND created_at::date >= $2::date AND created_at::date <= $3::date
       GROUP BY 1
       ORDER BY 1`,
      [tenantId, from, to]
    ),
    pool.query<{ month: string; c: string }>(
      `SELECT to_char(date_trunc('month', cancelled_at), 'YYYY-MM') AS month,
              COUNT(*)::text AS c
       FROM subscriptions
       WHERE tenant_id = $1 AND type = 'customer'
         AND status = 'cancelled'
         AND cancelled_at IS NOT NULL
         AND cancelled_at::date >= $2::date AND cancelled_at::date <= $3::date
       GROUP BY 1
       ORDER BY 1`,
      [tenantId, from, to]
    ),
    buildSubscriptionsProjection(tenantId, { from, to }, periodMonthKeys),
    buildSubscriptionsProjection(tenantId, { from: today, to: projection12To }, projection12MonthKeys),
  ]);

  const mrrInputs = activeSubsR.rows.map((row) => ({
    amount_cents: parseInt(row.amount_cents, 10) || 0,
    billing_interval: row.billing_interval,
    metadata: row.metadata,
  }));
  const mrrPending = computeMrrWithPendingChanges(mrrInputs);
  const mrr_cents = mrrPending.mrr_cents;
  const mrr_after_pending_cents = mrrPending.mrr_after_pending_cents;
  const mrr_pending_delta_cents = mrrPending.mrr_pending_delta_cents;

  const active_count = activeSubsR.rows.length;
  const paused_count = pausedSubsR.rows.length;
  let paused_mrr_cents = 0;
  for (const row of pausedSubsR.rows) {
    paused_mrr_cents += normalizeCrmSubscriptionAmountToMonthlyCents(
      parseInt(row.amount_cents, 10) || 0,
      row.billing_interval || 'monthly'
    );
  }
  const paused_arr_cents = crmSubscriptionArrFromMonthlyCents(paused_mrr_cents);
  const arr_cents = crmSubscriptionArrFromMonthlyCents(mrr_cents);
  const new_count = parseInt(newCountR.rows[0]?.c ?? '0', 10);
  const cancelled_count = parseInt(cancelledCountR.rows[0]?.c ?? '0', 10);
  const net_growth = new_count - cancelled_count;
  const average_ticket_cents = active_count > 0 ? Math.floor(mrr_cents / active_count) : 0;
  const upcoming_7d_cents = parseInt(upcoming7dR.rows[0]?.s ?? '0', 10);

  const lp = lastPaymentR.rows[0];
  const last_payment: CrmSubscriptionsLastPayment = lp
    ? {
        client_id: lp.client_id,
        client_name: lp.client_name?.trim() || 'Cliente',
        amount_cents: parseInt(lp.amount_cents, 10) || 0,
        paid_at: lp.paid_at,
      }
    : null;

  const intervalAcc = new Map<string, { count: number; mrr_cents: number }>();
  for (const row of activeSubsR.rows) {
    const interval = row.billing_interval || 'monthly';
    const cur = intervalAcc.get(interval) ?? { count: 0, mrr_cents: 0 };
    cur.count += 1;
    cur.mrr_cents += normalizeCrmSubscriptionAmountToMonthlyCents(
      parseInt(row.amount_cents, 10) || 0,
      interval
    );
    intervalAcc.set(interval, cur);
  }
  const by_interval: CrmSubscriptionsIntervalBucket[] = CRM_SUBSCRIPTION_BILLING_INTERVALS.map(
    (billing_interval) => {
      const v = intervalAcc.get(billing_interval) ?? { count: 0, mrr_cents: 0 };
      return {
        billing_interval,
        label_pt: INTERVAL_LABEL_PT[billing_interval] ?? billing_interval,
        count: v.count,
        mrr_cents: v.mrr_cents,
      };
    }
  );

  const topMap = new Map<string, CrmSubscriptionsTopClient>();
  for (const row of subscriptions_projection.rows) {
    const key = row.client_id ?? `__none__:${row.subscription_id}`;
    const addCents = reaisToCents(row.amount_recurring);
    const existing = topMap.get(key);
    if (existing) {
      existing.mrr_cents += addCents;
    } else {
      topMap.set(key, {
        client_id: row.client_id,
        client_name: row.client_name?.trim() || 'Cliente',
        mrr_cents: addCents,
      });
    }
  }
  const top_clients = [...topMap.values()]
    .sort((a, b) => b.mrr_cents - a.mrr_cents)
    .slice(0, 10);

  const growthNewMap = new Map(growthNewR.rows.map((r) => [r.month, parseInt(r.c, 10) || 0]));
  const growthCancelledMap = new Map(
    growthCancelledR.rows.map((r) => [r.month, parseInt(r.c, 10) || 0])
  );
  const growth_by_month: CrmSubscriptionsGrowthMonth[] = periodMonthKeys.map((month) => ({
    month,
    new_count: growthNewMap.get(month) ?? 0,
    cancelled_count: growthCancelledMap.get(month) ?? 0,
  }));

  const annual_projection_cents = sumProjectionCashCents(projection_12m);

  return {
    period: range,
    mrr_cents,
    mrr_after_pending_cents,
    mrr_pending_delta_cents,
    arr_cents,
    active_count,
    paused_count,
    paused_mrr_cents,
    paused_arr_cents,
    new_count,
    cancelled_count,
    net_growth,
    average_ticket_cents,
    upcoming_7d_cents,
    last_payment,
    annual_projection_cents,
    by_interval,
    top_clients,
    growth_by_month,
    subscriptions_projection,
    projection_12m,
  };
}
