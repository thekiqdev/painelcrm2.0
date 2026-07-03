import { describe, it, expect } from 'vitest';
import { createFinancialEventStore } from '@/lib/subscriptionFinancialEventStore';
import { isProjectedFinancialEvent } from '@/lib/subscriptionFinancialProjection';
import { buildGoldenDetail } from '../golden-dataset';

const today = '2026-06-30';

/**
 * Regressões permanentes — Sprint 4.2O (Architecture Simplification).
 * Invariante: apresentação deriva de cycles_raw + timeline merge, não de jobs isolados.
 */
describe('Regression 4.2O — Presentation SSOT', () => {
  it('store ignora job mismatch para decisão de Gerar (usa cycles_raw)', () => {
    const detail = buildGoldenDetail({
      recent_jobs: [
        {
          id: 'job-orphan',
          cycle_key: '2099-01-01',
          status: 'pending',
          scheduled_at: '2099-01-01T08:00:00Z',
          retry_at: null,
          attempts: 0,
          max_attempts: 3,
          result_invoice_id: null,
          error_message: null,
          completion_outcome: null,
          completion_detail: null,
          updated_at: '2026-06-30T08:00:00Z',
        },
      ],
    });
    const store = createFinancialEventStore(detail, today);
    expect(store.getHistoryRows().some((r) => r.canGenerateNow)).toBe(true);
  });

  it('projeções não entram em realEvents', () => {
    const detail = buildGoldenDetail({ timeline: [], cycles_raw: [] });
    const store = createFinancialEventStore(detail, today);
    expect(store.realEvents.every((e) => !isProjectedFinancialEvent(e))).toBe(true);
    expect(store.events.length).toBeGreaterThan(store.realEvents.length);
  });
});
