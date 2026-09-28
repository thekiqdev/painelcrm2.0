/**
 * Billing Forecast — projection horizon models (no UI).
 */

export const BILLING_FORECAST_HORIZONS = ['30d', '60d', '90d', '12m'] as const;

export type BillingForecastHorizon = (typeof BILLING_FORECAST_HORIZONS)[number];

export type BillingForecastPoint = {
  horizon: BillingForecastHorizon;
  projected_revenue_cents: number | null;
  currency: string;
  as_of: string;
  status: 'foundation_stub';
};

export type BillingForecastModel = {
  tenant_id: string;
  points: BillingForecastPoint[];
};
