import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { buildBillingAggregateFromDetail } from '@/lib/billingAggregate';
import type { FinancialEventStore } from '@/lib/subscriptionFinancialEventStore';
import {
  buildAggregateShadowSnapshot,
  buildLegacyShadowSnapshot,
  type AggregateShadowSnapshot,
  type ShadowSnapshotPair,
} from './shadowSnapshot';

export type ShadowPerformanceMetrics = {
  legacyMs: number;
  aggregateMs: number | null;
  totalMs: number;
};

export type ShadowExecutionReport = {
  enabled: boolean;
  subscriptionId: string;
  todayYmd: string;
  executedAt: string;
  performance: ShadowPerformanceMetrics;
  snapshots: ShadowSnapshotPair;
  aggregateError: string | null;
};

let lastShadowReport: ShadowExecutionReport | null = null;

export function getLastShadowExecutionReport(): ShadowExecutionReport | null {
  return lastShadowReport;
}

export function clearLastShadowExecutionReport(): void {
  lastShadowReport = null;
}

function logShadowReport(report: ShadowExecutionReport): void {
  try {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.info('[BillingShadowMode]', {
      subscriptionId: report.subscriptionId,
      todayYmd: report.todayYmd,
      performance: report.performance,
      legacy: {
        realEvents: report.snapshots.legacy.realEventCount,
        history: report.snapshots.legacy.historyCount,
        calendar: report.snapshots.legacy.calendarCount,
      },
      aggregate: report.snapshots.aggregate
        ? {
            events: report.snapshots.aggregate.eventCount,
            history: report.snapshots.aggregate.historyCount,
            calendar: report.snapshots.aggregate.calendarCount,
          }
        : null,
      aggregateError: report.aggregateError,
    });
  } catch {
    // nunca quebrar a UI por falha de log
  }
}

/**
 * Executa o BillingAggregate em paralelo ao store legado já construído.
 * Nunca altera o store nem propaga erros para a UI.
 */
export function runBillingShadowSideEffect(
  detail: CrmSubscriptionDetailPayload,
  store: FinancialEventStore,
  legacyMs: number
): ShadowExecutionReport {
  const totalStart = performance.now();

  let aggregateSnapshot: AggregateShadowSnapshot | null = null;
  let aggregateMs: number | null = null;
  let aggregateError: string | null = null;

  try {
    const aggregateStart = performance.now();
    const aggregate = buildBillingAggregateFromDetail(detail, store.today);
    aggregateMs = performance.now() - aggregateStart;
    aggregateSnapshot = buildAggregateShadowSnapshot(aggregate);
  } catch (err) {
    aggregateError = err instanceof Error ? err.message : String(err);
  }

  const report: ShadowExecutionReport = {
    enabled: true,
    subscriptionId: detail.subscription.id,
    todayYmd: store.today,
    executedAt: new Date().toISOString(),
    performance: {
      legacyMs,
      aggregateMs,
      totalMs: performance.now() - totalStart + legacyMs,
    },
    snapshots: {
      legacy: buildLegacyShadowSnapshot(store),
      aggregate: aggregateSnapshot,
    },
    aggregateError,
  };

  lastShadowReport = report;
  logShadowReport(report);
  return report;
}
