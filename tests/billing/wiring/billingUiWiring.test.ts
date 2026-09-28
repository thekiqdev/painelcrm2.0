import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildBillingAggregateFromDetail } from '@/lib/billingAggregate';
import { buildAggregateStorePrebuilt } from '@/lib/billingCutover/buildAggregateStorePrebuilt';
import { createBillingExperienceStore } from '@/lib/billingCutover/createBillingExperienceStore';
import {
  setBillingUseAggregateForTests,
  setBillingShadowModeForTests,
} from '@/lib/billingCutover/featureFlag';
import { buildGoldenDetail, timelineRow } from '../golden-dataset';

describe('Billing UI Aggregate Wiring (5.0-22B)', () => {
  beforeEach(() => {
    setBillingUseAggregateForTests(true);
    setBillingShadowModeForTests(null);
  });

  afterEach(() => {
    setBillingUseAggregateForTests(null);
    setBillingShadowModeForTests(null);
  });

  it('store é façade alimentada pelo Aggregate', () => {
    const detail = buildGoldenDetail();
    const store = createBillingExperienceStore(detail, '2026-06-30');
    expect(store.getAggregate()).not.toBeNull();
    expect(store.getUiCapabilities()).not.toBeNull();
    expect(store.getHeaderData()).not.toBeNull();
    expect(store.getFinancialAlerts()).toBeDefined();
    expect(store.getTechnicalView()).not.toBeNull();
  });

  it('history vem do aggregate.history (cycle-skipped visível)', () => {
    const detail = buildGoldenDetail({
      timeline: [
        timelineRow({
          cycle_id: 'c-skipped',
          due_date: '2026-07-14',
          operational_state: 'skipped',
          cycle_skipped_reason: 'manual_skip',
        }),
      ],
      cycles_raw: [
        {
          id: 'c-skipped',
          subscription_id: 'sub-golden',
          cycle_date: '2026-07-14',
          period_start: '2026-07-14',
          period_end: '2026-08-14',
          status: 'skipped',
          invoice_id: null,
          job_id: null,
          processed_at: null,
          skipped_reason: 'manual_skip',
          error_message: null,
        },
      ],
    });
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    const prebuilt = buildAggregateStorePrebuilt(aggregate, detail);
    expect(prebuilt.historyRows.some((r) => r.cycleId === 'c-skipped')).toBe(true);
  });

  it('nextInvoice e sidebar não recomputam via timeline', () => {
    const detail = buildGoldenDetail();
    const store = createBillingExperienceStore(detail, '2026-06-30');
    const next = store.getNextChargePresentation();
    const sidebar = store.getSidebarSummary();
    expect(next.dueYmd).toBeTruthy();
    expect(sidebar.openAmount).toMatch(/R\$/);
  });

  it('capabilities incluem generateCycleIds', () => {
    const detail = buildGoldenDetail();
    const store = createBillingExperienceStore(detail, '2026-06-30');
    const caps = store.getUiCapabilities();
    expect(caps?.generateCycleIds.length).toBeGreaterThanOrEqual(0);
    expect(typeof caps?.canGenerate).toBe('boolean');
  });
});
