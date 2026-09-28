/**
 * Sprint M3 — analytics comercial read-only (MRR catálogo vs contratado, receita recebida, impacto).
 * Não altera billing, lifecycle nem resolução de overrides (M1).
 */
import {
  applyCommercialOverrideToAmount,
  pickBestCommercialOverride,
} from '../commercial/tenantCommercialOverrideService.js';
import type {
  TenantCommercialBillingInterval,
  TenantCommercialOverrideRow,
  TenantCommercialOverrideType,
} from '../commercial/tenantCommercialTypes.js';
import { tryResolveSaasRenewalAmountFromContractSnapshot } from './billingService.js';
import { pool } from '../utils/db.js';
import { SQL_T_IS_PLATFORM_CUSTOMER } from '../partner/superadminTenantListScope.js';

export type CommercialBreakdownCategoryKey =
  | 'catalog_price'
  | 'percent_discount'
  | 'fixed_discount'
  | 'free_partners'
  | 'white_labels';

export type CommercialBreakdownRow = {
  category: string;
  category_key: CommercialBreakdownCategoryKey;
  count: number;
  total_cents: number;
};

export type CommercialMetrics = {
  mrrCatalog: number;
  mrrContracted: number;
  monthlyRevenue: number;
  commercialImpact: number;
  activeOverrides: number;
  waivedTenants: number;
  breakdown: CommercialBreakdownRow[];
};

export type CommercialOverrideReportRow = {
  tenant_id: string;
  tenant_name: string;
  plan_name: string;
  catalog_mrr_cents: number;
  effective_mrr_cents: number;
  override_type: TenantCommercialOverrideType | 'contract_snapshot' | null;
  monthly_savings_cents: number;
};

type ActiveTenantRow = {
  tenant_id: string;
  tenant_name: string;
  plan_id: string;
  plan_name: string;
  plan_type: string;
  plan_price_cents: string | null;
  plan_billing_interval: string | null;
  max_users_override: string | null;
  subscription_billing_interval: string | null;
  users_count: string | null;
  contracted_plan_price_cents: string | null;
  contracted_price_per_user_cents: string | null;
};

const BREAKDOWN_LABELS: Record<CommercialBreakdownCategoryKey, string> = {
  catalog_price: 'Preço catálogo',
  percent_discount: 'Desconto percentual',
  fixed_discount: 'Desconto fixo',
  free_partners: 'Parceiros gratuitos',
  white_labels: 'White Labels',
};

export function normalizeAmountToMonthlyCents(
  amountCents: number,
  billingInterval: string,
): number {
  const amount = Math.max(0, Math.round(amountCents));
  switch (billingInterval) {
    case 'yearly':
      return Math.floor(amount / 12);
    case 'quarterly':
      return Math.floor(amount / 3);
    case 'semi_annual':
      return Math.floor(amount / 6);
    default:
      return amount;
  }
}

function parseIntSafe(value: string | null | undefined, fallback = 0): number {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function resolveBillingInterval(
  subscriptionInterval: string | null,
  planInterval: string | null,
): TenantCommercialBillingInterval {
  const raw = subscriptionInterval ?? planInterval ?? 'monthly';
  if (raw === 'yearly' || raw === 'quarterly' || raw === 'semi_annual' || raw === 'monthly') {
    return raw;
  }
  return 'monthly';
}

function isWhiteLabelOverride(override: TenantCommercialOverrideRow | null): boolean {
  if (!override) return false;
  const reason = (override.reason ?? '').toLowerCase();
  if (reason.includes('white') && reason.includes('label')) return true;
  const tag = override.metadata_json?.tag;
  if (typeof tag === 'string' && tag.toLowerCase().includes('white_label')) return true;
  const type = override.metadata_json?.type;
  if (typeof type === 'string' && type.toLowerCase().includes('white_label')) return true;
  return false;
}

function overrideMatchesTenantScope(
  override: TenantCommercialOverrideRow,
  planId: string,
  billingInterval: TenantCommercialBillingInterval,
): boolean {
  if (override.plan_id != null && override.plan_id !== planId) return false;
  if (override.billing_interval != null && override.billing_interval !== billingInterval) return false;
  return true;
}

function computeCatalogPeriodCents(input: {
  planType: string;
  planPriceCents: number;
  pricePerUserCents: number | null;
  usersCount: number;
}): number {
  if (input.planType === 'custom') {
    const pu = input.pricePerUserCents ?? 0;
    return Math.max(0, Math.round(pu * Math.max(1, input.usersCount)));
  }
  return Math.max(0, Math.round(input.planPriceCents));
}

function resolveContractedPeriodCents(input: {
  planType: string;
  usersCount: number;
  catalogPeriodCents: number;
  contractedPlanPriceCents: number | null;
  contractedPricePerUserCents: number | null;
  override: TenantCommercialOverrideRow | null;
}): {
  periodCents: number;
  overrideType: TenantCommercialOverrideType | 'contract_snapshot' | null;
} {
  if (input.override) {
    return {
      periodCents: applyCommercialOverrideToAmount(input.catalogPeriodCents, input.override),
      overrideType: input.override.override_type,
    };
  }

  const snap = tryResolveSaasRenewalAmountFromContractSnapshot(
    input.planType,
    input.usersCount,
    input.contractedPlanPriceCents,
    input.contractedPricePerUserCents,
  );
  if (snap) {
    return { periodCents: snap.amountCents, overrideType: 'contract_snapshot' };
  }

  return { periodCents: input.catalogPeriodCents, overrideType: null };
}

function classifyTenantBreakdown(input: {
  override: TenantCommercialOverrideRow | null;
  savingsCents: number;
  effectiveMrrCents: number;
}): CommercialBreakdownCategoryKey {
  if (input.override && isWhiteLabelOverride(input.override)) return 'white_labels';
  if (input.override?.override_type === 'waive' || input.effectiveMrrCents === 0) {
    if (input.savingsCents > 0) return 'free_partners';
  }
  if (input.override?.override_type === 'percent_discount') return 'percent_discount';
  if (
    input.override?.override_type === 'fixed_price' ||
    input.override?.override_type === 'amount_discount'
  ) {
    return 'fixed_discount';
  }
  if (input.savingsCents > 0) return 'fixed_discount';
  return 'catalog_price';
}

function breakdownValueForCategory(
  category: CommercialBreakdownCategoryKey,
  catalogMrrCents: number,
  effectiveMrrCents: number,
  savingsCents: number,
): number {
  if (category === 'catalog_price') return effectiveMrrCents;
  if (category === 'free_partners') return catalogMrrCents;
  return savingsCents;
}

async function loadActiveTenantRows(): Promise<ActiveTenantRow[]> {
  const r = await pool.query<ActiveTenantRow>(
    `SELECT
       t.id::text AS tenant_id,
       t.name AS tenant_name,
       t.plan_id::text AS plan_id,
       p.name AS plan_name,
       COALESCE(p.plan_type, 'standard') AS plan_type,
       p.price_cents::text AS plan_price_cents,
       p.billing_interval AS plan_billing_interval,
       t.max_users_override::text AS max_users_override,
       s.billing_interval AS subscription_billing_interval,
       s.users_count::text AS users_count,
       s.contracted_plan_price_cents::text AS contracted_plan_price_cents,
       s.contracted_price_per_user_cents::text AS contracted_price_per_user_cents
     FROM tenants t
     INNER JOIN plans p ON p.id = t.plan_id
     LEFT JOIN LATERAL (
       SELECT
         sub.billing_interval,
         sub.users_count,
         sub.contracted_plan_price_cents,
         sub.contracted_price_per_user_cents
       FROM subscriptions sub
       WHERE sub.tenant_id = t.id
         AND sub.type = 'saas'
         AND sub.status IN ('active', 'trialing')
       ORDER BY sub.updated_at DESC NULLS LAST, sub.created_at DESC
       LIMIT 1
     ) s ON true
     WHERE t.status = 'active'
       AND ${SQL_T_IS_PLATFORM_CUSTOMER}`,
  );
  return r.rows;
}

async function loadActiveOverrides(at: Date): Promise<TenantCommercialOverrideRow[]> {
  const r = await pool.query(
    `SELECT id, tenant_id, plan_id, billing_interval, override_type,
            value_cents, percent_off, valid_from, valid_until, reason,
            metadata_json, created_by, is_active, created_at, updated_at
     FROM tenant_commercial_overrides
     WHERE is_active = true
       AND valid_from <= $1::timestamptz
       AND (valid_until IS NULL OR valid_until > $1::timestamptz)`,
    [at],
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    plan_id: row.plan_id != null ? String(row.plan_id) : null,
    billing_interval:
      row.billing_interval != null
        ? (String(row.billing_interval) as TenantCommercialBillingInterval)
        : null,
    override_type: String(row.override_type) as TenantCommercialOverrideType,
    value_cents: row.value_cents != null ? Number(row.value_cents) : null,
    percent_off: row.percent_off != null ? Number(row.percent_off) : null,
    valid_from: row.valid_from as Date | string,
    valid_until: row.valid_until != null ? (row.valid_until as Date | string) : null,
    reason: row.reason != null ? String(row.reason) : null,
    metadata_json: (row.metadata_json as Record<string, unknown> | null) ?? null,
    created_by: row.created_by != null ? String(row.created_by) : null,
    is_active: row.is_active === true,
    created_at: row.created_at as Date | string,
    updated_at: row.updated_at as Date | string,
  }));
}

async function loadPlanIntervalPrices(): Promise<Map<string, number>> {
  const r = await pool.query<{ plan_id: string; billing_interval: string; price_per_user_cents: string }>(
    `SELECT plan_id::text, billing_interval, price_per_user_cents::text
     FROM plan_interval_prices`,
  );
  const map = new Map<string, number>();
  for (const row of r.rows) {
    map.set(`${row.plan_id}:${row.billing_interval}`, parseIntSafe(row.price_per_user_cents));
  }
  return map;
}

async function loadMonthlyRevenueLast30Days(): Promise<number> {
  const r = await pool.query<{ total_cents: string }>(
    `SELECT COALESCE(SUM(tb.amount_cents), 0)::text AS total_cents
     FROM tenant_billing tb
     INNER JOIN tenants t ON t.id = tb.tenant_id AND ${SQL_T_IS_PLATFORM_CUSTOMER}
     WHERE tb.status = 'paid'
       AND tb.paid_at >= now() - interval '30 days'`,
  );
  return parseIntSafe(r.rows[0]?.total_cents);
}

type TenantCommercialComputation = {
  tenant_id: string;
  tenant_name: string;
  plan_name: string;
  catalog_mrr_cents: number;
  effective_mrr_cents: number;
  monthly_savings_cents: number;
  override: TenantCommercialOverrideRow | null;
  override_type: TenantCommercialOverrideType | 'contract_snapshot' | null;
  breakdown_category: CommercialBreakdownCategoryKey;
};

async function computeTenantCommercialRows(
  at: Date,
  preloadedOverrides?: TenantCommercialOverrideRow[],
): Promise<TenantCommercialComputation[]> {
  const [tenants, overrides, intervalPrices] = await Promise.all([
    loadActiveTenantRows(),
    preloadedOverrides ? Promise.resolve(preloadedOverrides) : loadActiveOverrides(at),
    loadPlanIntervalPrices(),
  ]);

  const overridesByTenant = new Map<string, TenantCommercialOverrideRow[]>();
  for (const override of overrides) {
    const list = overridesByTenant.get(override.tenant_id) ?? [];
    list.push(override);
    overridesByTenant.set(override.tenant_id, list);
  }

  const results: TenantCommercialComputation[] = [];

  for (const tenant of tenants) {
    const billingInterval = resolveBillingInterval(
      tenant.subscription_billing_interval,
      tenant.plan_billing_interval,
    );
    const usersCount = Math.max(
      1,
      parseIntSafe(tenant.users_count, parseIntSafe(tenant.max_users_override, 1)),
    );
    const pricePerUser =
      intervalPrices.get(`${tenant.plan_id}:${billingInterval}`) ?? null;
    const catalogPeriodCents = computeCatalogPeriodCents({
      planType: tenant.plan_type,
      planPriceCents: parseIntSafe(tenant.plan_price_cents),
      pricePerUserCents: pricePerUser,
      usersCount,
    });
    const catalogMrrCents = normalizeAmountToMonthlyCents(catalogPeriodCents, billingInterval);

    const tenantOverrides = (overridesByTenant.get(tenant.tenant_id) ?? []).filter((o) =>
      overrideMatchesTenantScope(o, tenant.plan_id, billingInterval),
    );
    const activeOverride = pickBestCommercialOverride(
      tenantOverrides,
      tenant.plan_id,
      billingInterval,
    );

    const contracted = resolveContractedPeriodCents({
      planType: tenant.plan_type,
      usersCount,
      catalogPeriodCents,
      contractedPlanPriceCents: parseIntSafe(tenant.contracted_plan_price_cents, -1) >= 0
        ? parseIntSafe(tenant.contracted_plan_price_cents)
        : null,
      contractedPricePerUserCents: parseIntSafe(tenant.contracted_price_per_user_cents, -1) >= 0
        ? parseIntSafe(tenant.contracted_price_per_user_cents)
        : null,
      override: activeOverride,
    });
    const effectiveMrrCents = normalizeAmountToMonthlyCents(contracted.periodCents, billingInterval);
    const savingsCents = Math.max(0, catalogMrrCents - effectiveMrrCents);
    const breakdownCategory = classifyTenantBreakdown({
      override: activeOverride,
      savingsCents,
      effectiveMrrCents,
    });

    results.push({
      tenant_id: tenant.tenant_id,
      tenant_name: tenant.tenant_name,
      plan_name: tenant.plan_name,
      catalog_mrr_cents: catalogMrrCents,
      effective_mrr_cents: effectiveMrrCents,
      monthly_savings_cents: savingsCents,
      override: activeOverride,
      override_type: contracted.overrideType,
      breakdown_category: breakdownCategory,
    });
  }

  return results;
}

function buildBreakdown(rows: TenantCommercialComputation[]): CommercialBreakdownRow[] {
  const buckets = new Map<CommercialBreakdownCategoryKey, { count: number; total: number }>();
  for (const key of Object.keys(BREAKDOWN_LABELS) as CommercialBreakdownCategoryKey[]) {
    buckets.set(key, { count: 0, total: 0 });
  }

  for (const row of rows) {
    const bucket = buckets.get(row.breakdown_category)!;
    bucket.count += 1;
    bucket.total += breakdownValueForCategory(
      row.breakdown_category,
      row.catalog_mrr_cents,
      row.effective_mrr_cents,
      row.monthly_savings_cents,
    );
  }

  return (Object.keys(BREAKDOWN_LABELS) as CommercialBreakdownCategoryKey[]).map((key) => ({
    category: BREAKDOWN_LABELS[key],
    category_key: key,
    count: buckets.get(key)?.count ?? 0,
    total_cents: buckets.get(key)?.total ?? 0,
  }));
}

function logCommercialAnalytics(metrics: CommercialMetrics): void {
  console.info('[commercial_analytics]', {
    mrrCatalog: metrics.mrrCatalog,
    mrrContracted: metrics.mrrContracted,
    commercialImpact: metrics.commercialImpact,
    monthlyRevenue: metrics.monthlyRevenue,
    activeOverrides: metrics.activeOverrides,
    waivedTenants: metrics.waivedTenants,
  });
}

export async function getCommercialMetrics(at: Date = new Date()): Promise<CommercialMetrics> {
  const activeOverrides = await loadActiveOverrides(at);
  const [tenantRows, monthlyRevenue] = await Promise.all([
    computeTenantCommercialRows(at, activeOverrides),
    loadMonthlyRevenueLast30Days(),
  ]);

  const mrrCatalog = tenantRows.reduce((sum, row) => sum + row.catalog_mrr_cents, 0);
  const mrrContracted = tenantRows.reduce((sum, row) => sum + row.effective_mrr_cents, 0);
  const commercialImpact = mrrCatalog - mrrContracted;
  const waivedTenants = tenantRows.filter((row) => row.override?.override_type === 'waive').length;

  const metrics: CommercialMetrics = {
    mrrCatalog,
    mrrContracted,
    monthlyRevenue,
    commercialImpact,
    activeOverrides: activeOverrides.length,
    waivedTenants,
    breakdown: buildBreakdown(tenantRows),
  };

  logCommercialAnalytics(metrics);
  return metrics;
}

export async function getCommercialOverridesReport(
  at: Date = new Date(),
): Promise<CommercialOverrideReportRow[]> {
  const tenantRows = await computeTenantCommercialRows(at);
  return tenantRows
    .filter((row) => row.monthly_savings_cents > 0 || row.override != null)
    .map((row) => ({
      tenant_id: row.tenant_id,
      tenant_name: row.tenant_name,
      plan_name: row.plan_name,
      catalog_mrr_cents: row.catalog_mrr_cents,
      effective_mrr_cents: row.effective_mrr_cents,
      override_type: row.override_type,
      monthly_savings_cents: row.monthly_savings_cents,
    }))
    .sort((a, b) => b.monthly_savings_cents - a.monthly_savings_cents);
}
