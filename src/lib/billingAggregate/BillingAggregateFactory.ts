import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { createEmptyBillingAggregate } from './BillingAggregate';
import { runBillingAggregatePipeline } from './BillingAggregateBuilder';
import {
  assertValidBillingContext,
  createBillingContext,
  validateBillingContext,
} from './BillingContext';
import type { BillingAggregate, BillingContext } from './types';

/**
 * Factory canônica do Billing Aggregate (Billing 5.0).
 * Sprint 5.0-11: retorna estrutura vazia — sem regras de negócio migradas.
 */
export function buildBillingAggregate(context: BillingContext): BillingAggregate {
  assertValidBillingContext(context);
  const empty = createEmptyBillingAggregate(context);
  return runBillingAggregatePipeline(context, empty);
}

/** Atalho para fixtures e test harness. */
export function buildBillingAggregateFromDetail(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): BillingAggregate {
  return buildBillingAggregate(createBillingContext(detail, todayYmd));
}

export { validateBillingContext, createBillingContext };
