import { describe, it, expect } from 'vitest';
import { buildFinancialEvents } from '@/lib/subscriptionFinancialEventBuilder';
import { buildGoldenDetail, lifecycleRow, timelineRow } from '../golden-dataset';

const today = '2026-06-30';

/**
 * Regressões permanentes — Sprint 4.2K (Lifecycle Forensic).
 * Documenta: materialização lazy de ciclos; lifecycle não participa de cobrança.
 */
describe('Regression 4.2K — Lifecycle', () => {
  it('assinatura pausada não emite upcoming_cycle real sem cycles_raw', () => {
    const detail = buildGoldenDetail({
      subscription: { status: 'paused' },
      timeline: [lifecycleRow('pause')],
      cycles_raw: [],
    });
    expect(buildFinancialEvents(detail, today)).toHaveLength(0);
  });

  it('retomada com ciclo pendente emite eventos reais', () => {
    const detail = buildGoldenDetail({
      timeline: [
        lifecycleRow('resume', { due_date: '2026-06-15' }),
        timelineRow({ cycle_id: 'c-after-resume', due_date: '2026-07-14' }),
      ],
    });
    expect(buildFinancialEvents(detail, today).length).toBeGreaterThan(0);
  });
});
