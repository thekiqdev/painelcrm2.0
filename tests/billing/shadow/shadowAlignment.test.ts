import { describe, it, expect } from 'vitest';
import { buildBillingAggregateFromDetail } from '@/lib/billingAggregate';
import { FinancialEventStore } from '@/lib/subscriptionFinancialEventStore';
import { buildGoldenDetail, timelineRow } from '../golden-dataset';

/**
 * Sprint 5.0-21B — testes das correções P0 documentadas na certificação 5.0-21A.
 */
describe('Shadow Alignment P0', () => {
  it('History ordena dueYmd desc como o legado', () => {
    const detail = buildGoldenDetail({
      cycles_raw: [
        {
          id: 'c-late',
          cycle_date: '2026-09-14',
          period_start: '2026-09-07',
          period_end: '2026-10-07',
          status: 'pending',
          invoice_id: null,
          job_id: null,
          processed_at: null,
          skipped_reason: null,
          error_message: null,
        },
        {
          id: 'c-early',
          cycle_date: '2026-07-14',
          period_start: '2026-07-07',
          period_end: '2026-08-07',
          status: 'paid',
          invoice_id: 'inv-1',
          job_id: null,
          processed_at: '2026-07-14T12:00:00Z',
          skipped_reason: null,
          error_message: null,
        },
      ],
    });
    const store = new FinancialEventStore(detail, '2026-06-30');
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(aggregate.history.map((r) => r.cycleId)).toEqual(
      store.getHistoryRows().map((r) => r.cycleId)
    );
  });

  it('NextInvoice usa first eligible cycle (não earliest paid)', () => {
    const detail = buildGoldenDetail({
      cycles_raw: [
        {
          id: 'c-paid',
          cycle_date: '2026-07-14',
          period_start: '2026-07-07',
          period_end: '2026-08-07',
          status: 'paid',
          invoice_id: 'inv-1',
          job_id: null,
          processed_at: '2026-07-14T12:00:00Z',
          skipped_reason: null,
          error_message: null,
        },
        {
          id: 'c-pending',
          cycle_date: '2026-09-14',
          period_start: '2026-09-07',
          period_end: '2026-10-07',
          status: 'pending',
          invoice_id: null,
          job_id: null,
          processed_at: null,
          skipped_reason: null,
          error_message: null,
        },
      ],
    });
    const store = new FinancialEventStore(detail, '2026-06-30');
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    const legacyNext = store.getNextChargePresentation();
    expect(aggregate.nextInvoice?.cycleId).toBe(legacyNext.cycleId);
    expect(aggregate.nextInvoice?.isProjected).toBe(false);
  });

  it('Capabilities.canGenerate alinha com histórico legado', () => {
    const detail = buildGoldenDetail({
      timeline: [timelineRow({ cycle_id: 'c-gen', due_date: '2026-07-14' })],
    });
    const store = new FinancialEventStore(detail, '2026-06-30');
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    const legacyCanGenerate = store.getHistoryRows().some((r) => r.canGenerateNow);
    expect(aggregate.capabilities.canGenerate).toBe(legacyCanGenerate);
  });

  it('Calendar inclui projeções quando não há ciclo futuro', () => {
    const detail = buildGoldenDetail({ timeline: [], cycles_raw: [] });
    const store = new FinancialEventStore(detail, '2026-06-30');
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(aggregate.calendar.filter((e) => e.isProjected).length).toBe(
      store.getCalendarEvents().filter((e) => e.isProjected).length
    );
  });
});
