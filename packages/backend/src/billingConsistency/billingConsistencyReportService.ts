/**
 * Billing Engine V2 — Sprint 2.3B: serviço de consistência (admin + shadow).
 */
import { getBillingConsistencyReportTtlDays } from '../config/billingEnv.js';
import { billingConsistencyValidator } from './billingConsistencyValidator.js';
import { billingConsistencyReportRepository } from './billingConsistencyReportRepository.js';
import type { BillingConsistencyDashboard, BillingConsistencyResult } from './types.js';

import type { BillingExecutionContext } from '../billingExecutionContext/types.js';

export async function runBillingConsistencyValidation(params: {
  subscriptionId: string;
  tenantId: string;
  correlationId?: string;
  cycleKey?: string;
  periodStartYmd?: string;
  executionContext?: BillingExecutionContext;
  persist?: boolean;
}): Promise<BillingConsistencyResult> {
  const result = await billingConsistencyValidator.validate({
    subscriptionId: params.subscriptionId,
    tenantId: params.tenantId,
    correlationId: params.correlationId,
    cycleKey: params.cycleKey,
    periodStartYmd: params.periodStartYmd,
    executionContext: params.executionContext,
  });

  if (params.persist !== false) {
    await billingConsistencyReportRepository.insert(result);
    void billingConsistencyReportRepository
      .purgeOlderThan(getBillingConsistencyReportTtlDays())
      .catch(() => {});
  }

  return result;
}

export async function getBillingConsistencyReportForSubscription(
  subscriptionId: string,
  historyLimit = 20
): Promise<{
  subscription_id: string;
  latest: Awaited<ReturnType<typeof billingConsistencyReportRepository.findLatestBySubscription>>;
  history: Awaited<ReturnType<typeof billingConsistencyReportRepository.findHistoryBySubscription>>;
}> {
  const [latest, history] = await Promise.all([
    billingConsistencyReportRepository.findLatestBySubscription(subscriptionId),
    billingConsistencyReportRepository.findHistoryBySubscription(subscriptionId, historyLimit),
  ]);
  return { subscription_id: subscriptionId, latest, history };
}

export async function getBillingConsistencyDashboard(): Promise<BillingConsistencyDashboard> {
  return billingConsistencyReportRepository.getDashboardStats();
}

export async function getBillingConsistencyHealthStats() {
  return billingConsistencyReportRepository.getHealthStats();
}
