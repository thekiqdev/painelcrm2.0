import { describe, it, expect } from 'vitest';
import {
  isLegacyFalseCancelledTimelineRow,
  normalizeDetailForLegacyCycleRecovery,
} from '@/lib/legacyCycleRecovery';
import { createFinancialEventStore } from '@/lib/subscriptionFinancialEventStore';
import { buildGoldenDetail, timelineRow } from '../golden-dataset';

const today = '2026-06-30';

/**
 * Regressões permanentes — Sprint 4.2N (Timeline Causality).
 * Bugs: operational_state cancelled legado bloqueia Gerar; timeline vs cycles_raw divergem.
 */
describe('Regression 4.2N — Timeline causality', () => {
  it('cancelled legado em assinatura ativa é falso cancelamento', () => {
    const row = timelineRow({
      cycle_id: 'c-legacy',
      operational_state: 'cancelled',
      cycle_status: 'cancelled',
      invoice_id: null,
    });
    expect(isLegacyFalseCancelledTimelineRow(row, 'active')).toBe(true);
  });

  it('cancelled legado normalizado permite Gerar no próximo ciclo', () => {
    const detail = buildGoldenDetail({
      subscription: { status: 'active' },
      timeline: [
        timelineRow({
          cycle_id: 'c-legacy',
          operational_state: 'cancelled',
          cycle_status: 'cancelled',
          invoice_id: null,
        }),
        timelineRow({ cycle_id: 'c-next', due_date: '2026-08-14' }),
      ],
    });
    const normalized = normalizeDetailForLegacyCycleRecovery(detail);
    const store = createFinancialEventStore(normalized, today);
    expect(store.getHistoryRows().find((r) => r.cycleId === 'c-legacy')?.canGenerateNow).toBe(true);
  });

  it('histórico deriva de realEvents, não de projeções', () => {
    const detail = buildGoldenDetail({ timeline: [], cycles_raw: [] });
    const store = createFinancialEventStore(detail, today);
    expect(store.getHistoryRows().every((r) => !r.isProjected)).toBe(true);
    expect(store.getCalendarEvents().some((e) => e.isProjected)).toBe(true);
  });
});
