/**
 * Billing Engine V2 — Sprint 2.3C: serviço admin + health.
 */
import { billingExecutionContextBuilder } from './billingExecutionContextBuilder.js';
import { getContextDashboardStats, getContextHealthStats } from './contextMetrics.js';
import { serializeBillingExecutionContext } from './serializeContext.js';
import type { BillingExecutionContext, BuildBillingExecutionContextInput } from './types.js';

export async function buildBillingExecutionContext(
  input: BuildBillingExecutionContextInput
): Promise<BillingExecutionContext> {
  return billingExecutionContextBuilder.build(input);
}

export async function getBillingExecutionContextForSubscription(params: {
  subscriptionId: string;
  tenantId: string;
  cycleKey?: string;
  periodStartYmd?: string;
  correlationId?: string;
  skipCache?: boolean;
}): Promise<{ context: Record<string, unknown>; built_at: string }> {
  const cycleKey =
    params.cycleKey ??
    params.periodStartYmd ??
    new Date().toISOString().slice(0, 10);
  const periodStartYmd = params.periodStartYmd ?? cycleKey;

  const context = await billingExecutionContextBuilder.build({
    subscriptionId: params.subscriptionId,
    tenantId: params.tenantId,
    cycleKey,
    periodStartYmd,
    correlationId: params.correlationId,
    skipCache: params.skipCache ?? false,
  });

  return {
    context: serializeBillingExecutionContext(context),
    built_at: new Date().toISOString(),
  };
}

export async function rebuildBillingExecutionContext(
  input: BuildBillingExecutionContextInput
): Promise<BillingExecutionContext> {
  return billingExecutionContextBuilder.build({ ...input, skipCache: true });
}

export {
  getContextDashboardStats as getBillingExecutionContextDashboard,
  getContextHealthStats as getBillingExecutionContextHealthStats,
};
