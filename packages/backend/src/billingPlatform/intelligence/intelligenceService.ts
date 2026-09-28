import type { BillingIntelligenceProfile, BillingIntelligenceSignalId } from './types.js';

const SIGNAL_LABELS: Record<BillingIntelligenceSignalId, string> = {
  churn_risk: 'Risco de churn',
  likely_delay: 'Atraso provável',
  payment_forecast: 'Previsão de pagamento',
  recurring_customer: 'Cliente recorrente',
  financial_score: 'Score financeiro',
};

export function buildIntelligenceProfileFoundation(params: {
  tenantId: string;
  customerId?: string | null;
  subscriptionId?: string | null;
}): BillingIntelligenceProfile {
  const evaluated_at = new Date().toISOString();
  const signals = (Object.keys(SIGNAL_LABELS) as BillingIntelligenceSignalId[]).map((signal) => ({
    signal,
    score: null,
    confidence: null,
    label: SIGNAL_LABELS[signal],
    status: 'not_implemented' as const,
  }));

  return {
    tenant_id: params.tenantId,
    customer_id: params.customerId ?? null,
    subscription_id: params.subscriptionId ?? null,
    signals,
    evaluated_at,
  };
}
