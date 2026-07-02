/**
 * Billing Reports — report contracts (no full implementation).
 */

export const BILLING_REPORT_TYPES = [
  'revenue',
  'mrr',
  'arr',
  'ltv',
  'churn',
  'recovery',
  'gateway',
  'taxes',
] as const;

export type BillingReportType = (typeof BILLING_REPORT_TYPES)[number];

export type BillingReportContract = {
  report_type: BillingReportType;
  available: false;
  status: 'contract_only';
  description: string;
};

const REPORT_DESCRIPTIONS: Record<BillingReportType, string> = {
  revenue: 'Receita consolidada',
  mrr: 'Monthly Recurring Revenue',
  arr: 'Annual Recurring Revenue',
  ltv: 'Lifetime Value',
  churn: 'Churn financeiro',
  recovery: 'Recuperação de inadimplência',
  gateway: 'Performance de gateway',
  taxes: 'Tributos e impostos',
};

export function listReportContracts(): BillingReportContract[] {
  return BILLING_REPORT_TYPES.map((report_type) => ({
    report_type,
    available: false as const,
    status: 'contract_only' as const,
    description: REPORT_DESCRIPTIONS[report_type],
  }));
}
