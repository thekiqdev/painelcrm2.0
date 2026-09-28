import type { BillingForecastHorizon, BillingForecastModel } from './types.js';
import { BILLING_FORECAST_HORIZONS } from './types.js';

export function buildForecastModelFoundation(tenantId: string): BillingForecastModel {
  const as_of = new Date().toISOString();
  const points = BILLING_FORECAST_HORIZONS.map((horizon: BillingForecastHorizon) => ({
    horizon,
    projected_revenue_cents: null,
    currency: 'BRL',
    as_of,
    status: 'foundation_stub' as const,
  }));

  return { tenant_id: tenantId, points };
}
