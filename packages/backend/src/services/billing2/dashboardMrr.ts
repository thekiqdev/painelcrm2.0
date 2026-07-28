/**
 * Billing 2.0 Sprint 6 — MRR/ARR contratado vs catálogo (PRD §12).
 *
 * Flag `dashboard_mrr_contracted`:
 * - OFF (default) → KPI principal = catálogo (comportamento legado)
 * - ON → KPI principal = contratos em `subscriptions` (active + past_due)
 */
import { pool } from '../../utils/db.js';
import { isBilling2FlagEnabled } from './billingFeatureFlags.js';

export type DashboardMrrSource = 'catalog' | 'contracted';

export type DashboardMrrSnapshot = {
  mrr_cents: number;
  mrr_catalog_cents: number;
  mrr_contracted_cents: number;
  arr_cents: number;
  mrr_source: DashboardMrrSource;
  saas_active_count: number;
  saas_past_due_count: number;
  renewals_due_30d_count: number;
  renewals_due_30d_cents: number;
  /** Estoque overdue (valor em risco operacional) */
  value_at_risk_cents: number;
  definitions: {
    mrr: string;
    arr: string;
    mrr_catalog: string;
    mrr_contracted: string;
    value_at_risk: string;
    inadimplencia: string;
  };
};

/** Mensaliza valor de período conforme intervalo de cobrança. */
export function monthlyizePeriodCents(periodCents: number, interval: string | null | undefined): number {
  const cents = Number.isFinite(periodCents) ? Math.max(0, Math.trunc(periodCents)) : 0;
  const iv = (interval ?? 'monthly').trim().toLowerCase();
  switch (iv) {
    case 'yearly':
    case 'annual':
      return Math.floor(cents / 12);
    case 'quarterly':
      return Math.floor(cents / 3);
    case 'semi_annual':
    case 'semiannual':
      return Math.floor(cents / 6);
    case 'weekly':
      return Math.floor((cents * 52) / 12);
    default:
      return cents;
  }
}

export const DASHBOARD_KPI_DEFINITIONS = {
  mrr: 'MRR = soma mensalizada do valor contratado das assinaturas SaaS (active + past_due). Não usa só o preço de lista do catálogo.',
  arr: 'ARR = MRR × 12 (projeção anual a partir do MRR exibido).',
  mrr_catalog:
    'MRR catálogo = tenants active × preço do plano (lista). Pode divergir do valor realmente cobrado.',
  mrr_contracted:
    'MRR contratado = subscriptions SaaS (active + past_due) usando COALESCE(contracted_plan_price_cents, amount_cents), mensalizado pelo intervalo do contrato.',
  value_at_risk: 'Valor em risco = estoque de cobranças overdue / vencidas em aberto (tenant_billing).',
  inadimplencia: 'Inadimplência = mesmas cobranças overdue/vencidas (estoque), não confundir com subscription.past_due.',
} as const;

/**
 * Soma MRR catálogo (legado dashboard): tenants active × plans.price_cents mensalizado.
 */
export async function computeCatalogMrrCents(): Promise<number> {
  const r = await pool.query<{ mrr_cents: string }>(
    `SELECT
       COALESCE(
         SUM(
           CASE
             WHEN COALESCE(p.billing_interval, 'monthly') = 'yearly' THEN FLOOR(COALESCE(p.price_cents, 0)::numeric / 12)
             WHEN COALESCE(p.billing_interval, 'monthly') = 'quarterly' THEN FLOOR(COALESCE(p.price_cents, 0)::numeric / 3)
             WHEN COALESCE(p.billing_interval, 'monthly') = 'semi_annual' THEN FLOOR(COALESCE(p.price_cents, 0)::numeric / 6)
             WHEN COALESCE(p.billing_interval, 'monthly') = 'weekly' THEN FLOOR((COALESCE(p.price_cents, 0)::numeric * 52) / 12)
             ELSE COALESCE(p.price_cents, 0)::numeric
           END
         ),
         0
       )::bigint::text AS mrr_cents
     FROM tenants t
     INNER JOIN plans p ON p.id = t.plan_id
     WHERE t.status = 'active'`
  );
  return Number.parseInt(r.rows[0]?.mrr_cents ?? '0', 10) || 0;
}

type ContractedRow = {
  period_cents: string;
  billing_interval: string | null;
};

/**
 * MRR contratado a partir de subscriptions SaaS active + past_due.
 */
export async function computeContractedMrrFromSubscriptions(): Promise<{
  mrr_cents: number;
  active_count: number;
  past_due_count: number;
}> {
  const [sums, counts] = await Promise.all([
    pool.query<ContractedRow>(
      `SELECT
         COALESCE(s.contracted_plan_price_cents, s.amount_cents, 0)::text AS period_cents,
         COALESCE(NULLIF(TRIM(s.contracted_billing_interval), ''), s.billing_interval) AS billing_interval
       FROM subscriptions s
       WHERE s.type = 'saas'
         AND s.status IN ('active', 'past_due')`
    ),
    pool.query<{ active_count: string; past_due_count: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active')::text AS active_count,
         COUNT(*) FILTER (WHERE status = 'past_due')::text AS past_due_count
       FROM subscriptions
       WHERE type = 'saas'
         AND status IN ('active', 'past_due')`
    ),
  ]);

  let mrr = 0;
  for (const row of sums.rows) {
    mrr += monthlyizePeriodCents(Number.parseInt(row.period_cents, 10) || 0, row.billing_interval);
  }

  return {
    mrr_cents: mrr,
    active_count: Number.parseInt(counts.rows[0]?.active_count ?? '0', 10) || 0,
    past_due_count: Number.parseInt(counts.rows[0]?.past_due_count ?? '0', 10) || 0,
  };
}

export async function computeRenewalsDue30d(): Promise<{ count: number; cents: number }> {
  const r = await pool.query<{ c: string; cents: string }>(
    `SELECT
       COUNT(*)::text AS c,
       COALESCE(SUM(COALESCE(s.contracted_plan_price_cents, s.amount_cents, 0)), 0)::text AS cents
     FROM subscriptions s
     WHERE s.type = 'saas'
       AND s.status IN ('active', 'past_due')
       AND s.next_billing_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`
  );
  return {
    count: Number.parseInt(r.rows[0]?.c ?? '0', 10) || 0,
    cents: Number.parseInt(r.rows[0]?.cents ?? '0', 10) || 0,
  };
}

/**
 * Snapshot completo para o dashboard. `valueAtRiskCents` vem do estoque overdue já calculado.
 */
export async function getDashboardMrrSnapshot(valueAtRiskCents: number): Promise<DashboardMrrSnapshot> {
  const useContracted = await isBilling2FlagEnabled('dashboard_mrr_contracted');
  const [catalog, contracted, renewals] = await Promise.all([
    computeCatalogMrrCents(),
    computeContractedMrrFromSubscriptions(),
    computeRenewalsDue30d(),
  ]);

  const mrr_source: DashboardMrrSource = useContracted ? 'contracted' : 'catalog';
  const mrr_cents = useContracted ? contracted.mrr_cents : catalog;

  return {
    mrr_cents,
    mrr_catalog_cents: catalog,
    mrr_contracted_cents: contracted.mrr_cents,
    arr_cents: mrr_cents * 12,
    mrr_source,
    saas_active_count: contracted.active_count,
    saas_past_due_count: contracted.past_due_count,
    renewals_due_30d_count: renewals.count,
    renewals_due_30d_cents: renewals.cents,
    value_at_risk_cents: Math.max(0, Math.trunc(valueAtRiskCents)),
    definitions: { ...DASHBOARD_KPI_DEFINITIONS },
  };
}
