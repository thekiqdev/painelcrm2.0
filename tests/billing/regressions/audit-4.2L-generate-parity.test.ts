import { describe, it, expect } from 'vitest';
import { createFinancialEventStore } from '@/lib/subscriptionFinancialEventStore';
import { cycleSupportsManualGenerate } from '@/lib/subscriptionCyclesSource';
import { resolveInvoiceCapabilities } from '@/lib/invoiceCapabilities';
import { buildGoldenDetail, timelineRow } from '../golden-dataset';

const today = '2026-06-30';

/**
 * Regressões permanentes — Sprint 4.2L (Generate Action Forensic).
 * Bugs: divergência canGenerateNow vs supportsGenerate; Gerar oculto com cycle elegível.
 */
describe('Regression 4.2L — Generate action parity', () => {
  it('histórico e calendário concordam em cycleIds elegíveis para Gerar (jul+out gap)', () => {
    const detail = buildGoldenDetail({
      timeline: [
        timelineRow({ cycle_id: 'c-jul', due_date: '2026-07-14' }),
        timelineRow({ cycle_id: 'c-oct', due_date: '2026-10-14' }),
      ],
    });
    const store = createFinancialEventStore(detail, today);
    const historyGenerate = store
      .getHistoryRows()
      .filter((r) => r.canGenerateNow)
      .map((r) => r.cycleId)
      .sort();
    const calendarGenerate = store
      .getCalendarEvents()
      .filter((ev) => {
        const source = store.events.find((e) => e.id === ev.id);
        return resolveInvoiceCapabilities({
          invoiceId: ev.invoiceId,
          eventType: source?.type ?? null,
          cycleId: ev.cycleId,
        }).supportsGenerate;
      })
      .map((ev) => ev.cycleId)
      .filter(Boolean)
      .sort();
    expect(historyGenerate).toEqual(['c-jul', 'c-oct']);
    expect(calendarGenerate).toEqual(expect.arrayContaining(['c-jul', 'c-oct']));
  });

  it('ciclo com invoice_id não exibe Gerar no histórico (4.2L truth table)', () => {
    const detail = buildGoldenDetail({
      timeline: [
        timelineRow({
          cycle_id: 'c-with-inv',
          invoice_id: 'inv-1',
          operational_state: 'generated',
          invoice_status: 'pending',
        }),
        timelineRow({ cycle_id: 'c-open', due_date: '2026-10-14' }),
      ],
    });
    const store = createFinancialEventStore(detail, today);
    const withInv = store.getHistoryRows().find((r) => r.cycleId === 'c-with-inv');
    const open = store.getHistoryRows().find((r) => r.cycleId === 'c-open');
    expect(withInv?.canGenerateNow).toBe(false);
    expect(open?.canGenerateNow).toBe(true);
    expect(cycleSupportsManualGenerate(detail, 'c-with-inv')).toBe(false);
    expect(cycleSupportsManualGenerate(detail, 'c-open')).toBe(true);
  });

  it('supportsGenerate exige cycle_id (projeção sem ciclo)', () => {
    const detail = buildGoldenDetail({ timeline: [], cycles_raw: [] });
    const store = createFinancialEventStore(detail, today);
    const projected = store.getCalendarEvents().filter((e) => e.isProjected);
    expect(projected.length).toBeGreaterThan(0);
    for (const ev of projected) {
      expect(
        resolveInvoiceCapabilities({ eventType: 'upcoming_cycle', cycleId: ev.cycleId }).supportsGenerate
      ).toBe(false);
    }
  });
});
