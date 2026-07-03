import { describe, it, expect } from 'vitest';
import { buildBillingAggregateFromDetail, billingAggregateSignature } from '@/lib/billingAggregate';
import { financialEventStoreSignature } from '@/lib/subscriptionFinancialEventStore';
import { GOLDEN_SCENARIOS } from '../golden-dataset';

/**
 * Test harness — executa o novo Aggregate em paralelo ao Golden Dataset
 * sem alterar o motor legado (FinancialEventStore).
 */
describe('Billing Aggregate — Golden Dataset harness', () => {
  it.each(GOLDEN_SCENARIOS.map((s) => [s.id, s] as const))(
    '%s — factory produz aggregate estável',
    (_id, scenario) => {
      const detail = scenario.build();
      const aggregate = buildBillingAggregateFromDetail(detail, scenario.todayYmd);

      expect(aggregate.subscriptionId).toBe(detail.subscription.id);
      expect(aggregate.todayYmd).toBe(scenario.todayYmd);
      expect(aggregate.sourceSignature).toBe(financialEventStoreSignature(detail));

      const again = buildBillingAggregateFromDetail(detail, scenario.todayYmd);
      expect(billingAggregateSignature(aggregate)).toBe(billingAggregateSignature(again));
    }
  );

  it('40 cenários golden cobertos', () => {
    expect(GOLDEN_SCENARIOS.length).toBeGreaterThanOrEqual(40);
  });

  it('views permanecem vazias; subscription e cycles espelham source (5.0-12/5.0-13)', () => {
    for (const scenario of GOLDEN_SCENARIOS) {
      const detail = scenario.build();
      const aggregate = buildBillingAggregateFromDetail(detail, scenario.todayYmd);
      expect(aggregate.history).toEqual([]);
      expect(aggregate.calendar).toEqual([]);
      expect(aggregate.events).toEqual([]);
      expect(aggregate.alerts).toEqual([]);
      expect(aggregate.subscription.id).toBe(detail.subscription.id);
      expect(aggregate.cycles).toHaveLength(detail.cycles_raw.length);
      expect(aggregate.cycles.map((c) => c.id)).toEqual(detail.cycles_raw.map((c) => c.id));
      expect(aggregate.cycles.map((c) => c.status)).toEqual(detail.cycles_raw.map((c) => c.status));
    }
  });
});
