import { describe, it, expect } from 'vitest';
import { resolveHistoryRowState } from '@/lib/billingStateMachine';
import { createFinancialEventStore } from '@/lib/subscriptionFinancialEventStore';
import { buildGoldenDetail, timelineRow } from '../golden-dataset';

const today = '2026-06-30';

/**
 * Regressões permanentes — Sprint 4.2P (State Machine Blueprint).
 * Invariante: statusPt do histórico alinha com resolveHistoryRowState.
 */
describe('Regression 4.2P — Unified presentation state', () => {
  it('histórico re-aplica resolveHistoryRowState (store L167–176)', () => {
    const detail = buildGoldenDetail({
      timeline: [
        timelineRow({
          cycle_id: 'c-paid',
          invoice_id: 'inv-1',
          invoice_status: 'paid',
          operational_state: 'paid',
          status_pt: 'Pago',
        }),
      ],
    });
    const store = createFinancialEventStore(detail, today);
    const row = store.getHistoryRows().find((r) => r.cycleId === 'c-paid');
    expect(row).toBeDefined();
    const state = resolveHistoryRowState(row!, today);
    expect(row!.statusPt).toBe(state.label === '—' ? row!.statusPt : state.label);
  });

  it('gateway_failed mapeia para estado de falha na state machine', () => {
    const detail = buildGoldenDetail({
      timeline: [
        timelineRow({
          cycle_id: 'c-gw',
          operational_state: 'gateway_failed',
          invoice_id: 'inv-gw',
          invoice_status: 'gateway_failed',
        }),
      ],
    });
    const store = createFinancialEventStore(detail, today);
    const row = store.getHistoryRows().find((r) => r.cycleId === 'c-gw');
    expect(row?.visual === 'overdue' || row?.statusPt.toLowerCase().includes('falh')).toBe(true);
  });
});
