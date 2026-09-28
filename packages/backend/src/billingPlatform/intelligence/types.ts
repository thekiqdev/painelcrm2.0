/**
 * Billing Intelligence — architecture contracts (future rules).
 */

export type BillingIntelligenceSignalId =
  | 'churn_risk'
  | 'likely_delay'
  | 'payment_forecast'
  | 'recurring_customer'
  | 'financial_score';

export type BillingIntelligenceSignal = {
  signal: BillingIntelligenceSignalId;
  score: number | null;
  confidence: number | null;
  label: string;
  status: 'not_implemented';
};

export type BillingIntelligenceProfile = {
  tenant_id: string;
  customer_id?: string | null;
  subscription_id?: string | null;
  signals: BillingIntelligenceSignal[];
  evaluated_at: string;
};
