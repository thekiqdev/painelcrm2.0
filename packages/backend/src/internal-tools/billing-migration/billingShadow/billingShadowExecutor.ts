/**
 * Archived — Sprint 3.2B: shadow comparison desligado (produção não invoca).
 */
import type { BillingRenewalResult } from '../../../services/billingRenewalEngine/types.js';
import type { SubscriptionRow } from '../../../services/billingSubscriptionService.js';
import type { BillingShadowReport } from './types.js';

export type RunBillingShadowComparisonInput = {
  subscription: SubscriptionRow;
  cycleKey: string;
  periodStartYmd: string;
  periodEndYmd?: string | null;
  executionMode: BillingRenewalResult['executionMode'];
  correlationId: string;
  renewalResult: BillingRenewalResult;
};

export async function runBillingShadowComparison(
  _input: RunBillingShadowComparisonInput
): Promise<BillingShadowReport | null> {
  return null;
}
