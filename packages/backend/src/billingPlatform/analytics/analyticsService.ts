import type { BillingAnalyticsMetricId, BillingAnalyticsSnapshot } from './types.js';

/** Foundation stub — returns empty metric shells without querying billing engine. */
export function buildAnalyticsSnapshotFoundation(tenantId: string): BillingAnalyticsSnapshot {
  const now = new Date().toISOString();
  const periodEnd = now.slice(0, 10);
  const periodStart = periodEnd.slice(0, 8) + '01';

  const metrics: BillingAnalyticsSnapshot['metrics'] = (
    [
      'recurring_revenue',
      'forecast_revenue',
      'lost_revenue',
      'recovered_revenue',
      'average_ticket',
      'financial_churn',
      'monthly_growth',
    ] as BillingAnalyticsMetricId[]
  ).map((metric) => ({
    metric,
    value_cents: null,
    currency: 'BRL',
    period_start: periodStart,
    period_end: periodEnd,
    computed_at: now,
    source: 'foundation_stub' as const,
  }));

  return { tenant_id: tenantId, metrics, status: 'foundation' };
}
