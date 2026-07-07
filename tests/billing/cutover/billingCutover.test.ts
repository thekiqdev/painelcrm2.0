import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildBillingAggregateFromDetail } from '@/lib/billingAggregate';
import { buildStoreEventsFromAggregate } from '@/lib/billingCutover/billingViewAdapter';
import {
  createBillingExperienceStore,
} from '@/lib/billingCutover/createBillingExperienceStore';
import {
  setBillingUseAggregateForTests,
  setBillingShadowModeForTests,
} from '@/lib/billingCutover/featureFlag';
import { buildGoldenDetail, timelineRow } from '../golden-dataset';

describe('Billing Cutover (5.0-22)', () => {
  beforeEach(() => {
    setBillingUseAggregateForTests(null);
    setBillingShadowModeForTests(null);
  });

  afterEach(() => {
    setBillingUseAggregateForTests(null);
    setBillingShadowModeForTests(null);
  });

  it('VITE_BILLING_USE_AGGREGATE default produz store com eventos do Aggregate', () => {
    setBillingUseAggregateForTests(true);
    const detail = buildGoldenDetail({
      timeline: [
        timelineRow({
          cycle_id: 'c-paid',
          due_date: '2026-06-14',
          invoice_id: 'inv-paid',
          invoice_status: 'paid',
          operational_state: 'paid',
        }),
      ],
    });
    const store = createBillingExperienceStore(detail, '2026-06-30');
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    const expected = buildStoreEventsFromAggregate(aggregate, detail);
    expect(store.realEvents.map((e) => e.id).sort()).toEqual(
      expected.realEvents.map((e) => e.id).sort()
    );
  });

  it('rollback flag usa motor legado (buildFinancialEvents)', () => {
    setBillingUseAggregateForTests(false);
    const detail = buildGoldenDetail();
    const store = createBillingExperienceStore(detail, '2026-06-30');
    expect(store.realEvents.length).toBeGreaterThan(0);
    expect(store.getSidebarSummary().openAmount).toBeDefined();
  });

  it('adapter produz projeções no calendário', () => {
    const detail = buildGoldenDetail();
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    const { events } = buildStoreEventsFromAggregate(aggregate, detail);
    expect(events.some((e) => e.kind === 'projected')).toBe(true);
  });
});
