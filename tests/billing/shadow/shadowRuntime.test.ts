import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFinancialEventStore } from '@/lib/subscriptionFinancialEventStore';
import {
  clearLastShadowExecutionReport,
  getLastShadowExecutionReport,
  isBillingShadowModeEnabled,
  setBillingShadowModeForTests,
  runBillingShadowSideEffect,
  buildLegacyShadowSnapshot,
  buildAggregateShadowSnapshot,
} from '@/lib/billingShadow';
import { buildBillingAggregateFromDetail } from '@/lib/billingAggregate';
import { buildGoldenDetail, timelineRow } from '../golden-dataset';

describe('Billing Shadow Mode Runtime', () => {
  beforeEach(() => {
    clearLastShadowExecutionReport();
    setBillingShadowModeForTests(null);
  });

  afterEach(() => {
    setBillingShadowModeForTests(null);
    clearLastShadowExecutionReport();
  });

  it('flag default desligada', () => {
    expect(isBillingShadowModeEnabled()).toBe(false);
  });

  it('com flag off, createFinancialEventStore não gera report', () => {
    setBillingShadowModeForTests(false);
    const store = createFinancialEventStore(buildGoldenDetail(), '2026-06-30');
    expect(store.getHistoryRows().length).toBeGreaterThanOrEqual(0);
    expect(getLastShadowExecutionReport()).toBeNull();
  });

  it('com flag on, Aggregate executa em paralelo e UI recebe store legado', () => {
    setBillingShadowModeForTests(true);
    const detail = buildGoldenDetail({
      timeline: [timelineRow({ cycle_id: 'c-shadow', due_date: '2026-07-14' })],
    });
    const store = createFinancialEventStore(detail, '2026-06-30');

    expect(store.subscriptionId).toBe(detail.subscription.id);
    expect(store.getHistoryRows().some((r) => r.cycleId === 'c-shadow')).toBe(true);

    const report = getLastShadowExecutionReport();
    expect(report).not.toBeNull();
    expect(report!.enabled).toBe(true);
    expect(report!.snapshots.legacy.engine).toBe('legacy');
    expect(report!.snapshots.aggregate?.engine).toBe('aggregate');
    expect(report!.performance.legacyMs).toBeGreaterThanOrEqual(0);
    expect(report!.performance.aggregateMs).toBeGreaterThanOrEqual(0);
    expect(report!.aggregateError).toBeNull();
  });

  it('runBillingShadowSideEffect nunca altera o store legado', () => {
    const detail = buildGoldenDetail();
    const store = createFinancialEventStore(detail, '2026-06-30');
    const historyBefore = store.getHistoryRows().map((r) => r.id);
    const report = runBillingShadowSideEffect(detail, store, 1.5);
    expect(store.getHistoryRows().map((r) => r.id)).toEqual(historyBefore);
    expect(report.performance.legacyMs).toBe(1.5);
    expect(report.snapshots.legacy.realEventCount).toBe(store.realEvents.length);
  });

  it('snapshots são serializáveis (JSON)', () => {
    const detail = buildGoldenDetail();
    const store = createFinancialEventStore(detail, '2026-06-30');
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    const legacy = buildLegacyShadowSnapshot(store);
    const agg = buildAggregateShadowSnapshot(aggregate);
    expect(() => JSON.stringify({ legacy, agg })).not.toThrow();
    expect(JSON.parse(JSON.stringify(legacy)).engine).toBe('legacy');
    expect(JSON.parse(JSON.stringify(agg)).engine).toBe('aggregate');
  });

  it('falha do Aggregate não quebra o store (isolamento)', () => {
    const detail = buildGoldenDetail();
    const store = createFinancialEventStore(detail, '2026-06-30');
    const broken = {
      ...detail,
      subscription: { ...detail.subscription, id: '' },
    };
    // buildBillingAggregateFromDetail com id vazio lança na validação
    const report = runBillingShadowSideEffect(broken, store, 0.1);
    expect(report.aggregateError).toBeTruthy();
    expect(report.snapshots.aggregate).toBeNull();
    expect(report.snapshots.legacy.subscriptionId).toBe(detail.subscription.id);
    expect(store.getHistoryRows()).toBeDefined();
  });
});
