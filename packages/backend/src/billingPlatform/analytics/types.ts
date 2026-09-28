/**
 * Billing Platform Analytics — metric contracts (no engine changes).
 */

export const BILLING_ANALYTICS_METRICS = [
  'recurring_revenue',
  'forecast_revenue',
  'lost_revenue',
  'recovered_revenue',
  'average_ticket',
  'financial_churn',
  'monthly_growth',
] as const;

export type BillingAnalyticsMetricId = (typeof BILLING_ANALYTICS_METRICS)[number];

export type BillingAnalyticsMetricValue = {
  metric: BillingAnalyticsMetricId;
  value_cents: number | null;
  currency: string;
  period_start: string;
  period_end: string;
  computed_at: string;
  source: 'foundation_stub';
};

export type BillingAnalyticsSnapshot = {
  tenant_id: string;
  metrics: BillingAnalyticsMetricValue[];
  status: 'foundation';
};
