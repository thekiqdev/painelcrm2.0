import { describe, it, expect } from 'vitest';
import { buildFinancialEvents } from '@/lib/subscriptionFinancialEventBuilder';
import { createFinancialEventStore } from '@/lib/subscriptionFinancialEventStore';
import { buildGoldenDetail, timelineRow } from '../golden-dataset';

const today = '2026-06-30';

/**
 * Regressões permanentes — Sprint 4.2M (Runtime Causality).
 * Bugs: payment ymd ≠ processed_at; ciclo failed sem evento; 0 eventos por operational_state.
 */
describe('Regression 4.2M — Runtime causality', () => {
  it('payment ymd usa due_date, não processed_at (fix 07/07)', () => {
    const detail = buildGoldenDetail({
      timeline: [
        timelineRow({
          cycle_id: 'c-pay',
          due_date: '2026-07-07',
          invoice_id: 'inv-pay',
          invoice_status: 'paid',
          operational_state: 'paid',
          processed_at: '2026-07-10T12:00:00Z',
        }),
      ],
    });
    const pay = buildFinancialEvents(detail, today).find((e) => e.invoiceId === 'inv-pay');
    expect(pay?.type).toBe('payment');
    expect(pay?.ymd).toBe('2026-07-07');
  });

  it('ciclo failed recuperável emite upcoming_cycle (não invoice_failed)', () => {
    const detail = buildGoldenDetail({
      timeline: [
        timelineRow({
          cycle_id: 'c-fail',
          operational_state: 'failed',
          invoice_id: null,
          job_error_snippet: 'timeout',
          due_date: '2026-07-14',
        }),
      ],
    });
    const events = buildFinancialEvents(detail, today);
    expect(events.some((e) => e.cycleId === 'c-fail' && e.type === 'upcoming_cycle')).toBe(true);
    expect(events.some((e) => e.cycleId === 'c-fail' && e.type === 'invoice_failed')).toBe(false);
    const store = createFinancialEventStore(detail, today);
    expect(store.getHistoryRows().find((r) => r.cycleId === 'c-fail')?.canGenerateNow).toBe(true);
  });

  it('falha definitiva no passado emite invoice_failed', () => {
    const detail = buildGoldenDetail({
      timeline: [
        timelineRow({
          cycle_id: 'c-past-fail',
          due_date: '2026-05-01',
          cycle_date: '2026-05-01',
          operational_state: 'failed',
          invoice_id: null,
          job_error_snippet: 'timeout',
        }),
      ],
    });
    expect(buildFinancialEvents(detail, today).some((e) => e.type === 'invoice_failed')).toBe(true);
  });

  it('lifecycle rows não geram FinancialEvent (merge_source lifecycle)', () => {
    const detail = buildGoldenDetail({
      timeline: [
        timelineRow({
          merge_source: 'lifecycle',
          lifecycle_event: 'pause',
          operational_state: 'lifecycle_event',
          cycle_id: null,
        }),
      ],
      cycles_raw: [],
    });
    expect(buildFinancialEvents(detail, today)).toHaveLength(0);
  });

  it('invoice_only na timeline não gera realEvents (gap documentado 4.2M/4.2Q)', () => {
    const detail = buildGoldenDetail({
      timeline: [
        timelineRow({
          cycle_id: null,
          merge_source: 'invoice_only',
          invoice_id: 'inv-orphan',
          invoice_status: 'pending',
          operational_state: 'generated',
          due_date: '2026-06-15',
        }),
      ],
      cycles_raw: [],
    });
    expect(buildFinancialEvents(detail, today)).toHaveLength(0);
    const store = createFinancialEventStore(detail, today);
    expect(store.realEvents).toHaveLength(0);
    expect(store.getHistoryRows()).toHaveLength(0);
  });
});
