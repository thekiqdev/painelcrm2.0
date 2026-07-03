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

  it('aggregate completo até capabilities (5.0-12–5.0-20)', () => {
    for (const scenario of GOLDEN_SCENARIOS) {
      const detail = scenario.build();
      const aggregate = buildBillingAggregateFromDetail(detail, scenario.todayYmd);
      expect(Array.isArray(aggregate.alerts)).toBe(true);
      expect(aggregate.subscription.id).toBe(detail.subscription.id);
      expect(aggregate.cycles).toHaveLength(detail.cycles_raw.length);
      expect(aggregate.events).toHaveLength(aggregate.cycles.length);
      expect(aggregate.history).toHaveLength(aggregate.events.length);
      expect(aggregate.calendar).toHaveLength(aggregate.events.length);
      expect(aggregate.sidebar.eventCount).toBe(aggregate.events.length);
      expect(aggregate.sidebar.subscriptionStatus).toBe(aggregate.subscription.status);
      expect(aggregate.capabilities.canOpenSubscription).toBe(true);
      expect(aggregate.capabilities.metadata.subscriptionId).toBe(aggregate.subscription.id);
      expect(aggregate.capabilities.metadata.eventCount).toBe(aggregate.events.length);
      expect(aggregate.cycles.map((c) => c.id)).toEqual(detail.cycles_raw.map((c) => c.id));
      expect(aggregate.cycles.map((c) => c.status)).toEqual(detail.cycles_raw.map((c) => c.status));
      if (aggregate.cycles.length > 0) {
        expect(aggregate.events.every((e) => e.cycleId)).toBe(true);
        const eventIds = new Set(aggregate.events.map((e) => e.id));
        expect(aggregate.history.every((r) => eventIds.has(r.eventId))).toBe(true);
        expect(aggregate.calendar.every((e) => eventIds.has(e.eventId))).toBe(true);
        expect(aggregate.nextInvoice).not.toBeNull();
        expect(eventIds.has(aggregate.nextInvoice!.eventId)).toBe(true);
      } else {
        expect(aggregate.events).toEqual([]);
        expect(aggregate.history).toEqual([]);
        expect(aggregate.calendar).toEqual([]);
        expect(aggregate.sidebar.lastEventDate).toBeNull();
        expect(aggregate.nextInvoice).toBeNull();
        expect(aggregate.alerts.some((a) => a.kind === 'no_events')).toBe(true);
      }
    }
  });
});
