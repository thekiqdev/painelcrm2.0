/**
 * Sprint 5.0-22 — Factory única da experiência financeira na UI.
 * Cutover: BillingAggregate (default). Rollback: FinancialEventStore legado.
 */
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { buildBillingAggregateFromDetail } from '@/lib/billingAggregate';
import { runBillingShadowSideEffect } from '@/lib/billingShadow/shadowRuntime';
import {
  FinancialEventStore,
} from '@/lib/subscriptionFinancialEventStore';
import { buildStoreEventsFromAggregate } from './billingViewAdapter';
import { buildAggregateStorePrebuilt } from './buildAggregateStorePrebuilt';
import { isBillingShadowModeEnabled, isBillingUseAggregateEnabled } from './featureFlag';

function createLegacyFinancialEventStore(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): FinancialEventStore {
  if (!isBillingShadowModeEnabled()) {
    return new FinancialEventStore(detail, todayYmd);
  }

  const legacyStart = performance.now();
  const store = new FinancialEventStore(detail, todayYmd);
  const legacyMs = performance.now() - legacyStart;

  try {
    runBillingShadowSideEffect(detail, store, legacyMs);
  } catch {
    // shadow nunca quebra a UI
  }

  return store;
}

function createAggregateFinancialEventStore(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): FinancialEventStore {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  const aggregateStart = performance.now();
  const aggregate = buildBillingAggregateFromDetail(detail, today);
  const aggregateMs = performance.now() - aggregateStart;
  const prebuilt = buildAggregateStorePrebuilt(aggregate, detail);
  const store = new FinancialEventStore(detail, today, prebuilt);

  if (isBillingShadowModeEnabled()) {
    try {
      const legacyStart = performance.now();
      const legacyStore = new FinancialEventStore(detail, today);
      const legacyMs = performance.now() - legacyStart;
      runBillingShadowSideEffect(detail, legacyStore, legacyMs);
      void aggregateMs;
    } catch {
      // diagnóstico only
    }
  }

  return store;
}

/**
 * Fonte oficial da UI após Sprint 5.0-22.
 * VITE_BILLING_USE_AGGREGATE=false → rollback imediato para motor legado.
 */
export function createBillingExperienceStore(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): FinancialEventStore {
  if (isBillingUseAggregateEnabled()) {
    return createAggregateFinancialEventStore(detail, todayYmd);
  }
  return createLegacyFinancialEventStore(detail, todayYmd);
}
