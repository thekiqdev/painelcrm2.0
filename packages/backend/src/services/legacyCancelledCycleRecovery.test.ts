import { describe, it, expect } from 'vitest';
import {
  hasOfficialCycleCancellation,
  isLegacyFalseCancelledCycle,
} from './legacyCancelledCycleRecovery.js';
import { buildSubscriptionTimeline } from './subscriptionTimelineUx.js';

describe('legacyCancelledCycleRecovery', () => {
  it('detecta ciclo cancelled sem invoice em assinatura ativa como legado', () => {
    expect(
      isLegacyFalseCancelledCycle({
        cycleStatus: 'cancelled',
        invoiceId: null,
        skippedReason: null,
        subscriptionStatus: 'active',
      })
    ).toBe(true);
  });

  it('mantém cancelamento oficial quando assinatura está cancelled', () => {
    expect(
      isLegacyFalseCancelledCycle({
        cycleStatus: 'cancelled',
        invoiceId: null,
        skippedReason: null,
        subscriptionStatus: 'cancelled',
      })
    ).toBe(false);
    expect(
      hasOfficialCycleCancellation({
        cycleStatus: 'cancelled',
        invoiceId: null,
        subscriptionStatus: 'cancelled',
      })
    ).toBe(true);
  });

  it('respeita skipped_reason de cancelamento manual', () => {
    expect(
      isLegacyFalseCancelledCycle({
        cycleStatus: 'cancelled',
        invoiceId: null,
        skippedReason: 'manual_cancel',
        subscriptionStatus: 'active',
      })
    ).toBe(false);
  });

  it('não recupera ciclo com invoice', () => {
    expect(
      isLegacyFalseCancelledCycle({
        cycleStatus: 'cancelled',
        invoiceId: 'inv-1',
        invoiceStatus: 'cancelled',
        subscriptionStatus: 'active',
      })
    ).toBe(false);
  });

  it('timeline UX reinterpreta cancelled legado como Prevista', () => {
    const rows = buildSubscriptionTimeline(
      [
        {
          id: 'c1',
          cycle_date: '2026-07-15',
          period_start: '2026-07-01',
          period_end: '2026-07-31',
          status: 'cancelled',
          invoice_id: null,
          job_id: null,
          processed_at: null,
          skipped_reason: null,
          error_message: null,
        },
      ],
      [],
      10000,
      true,
      [],
      [],
      'active'
    );
    expect(rows[0]?.operational_state).toBe('awaiting_generation');
    expect(rows[0]?.status_pt).toBe('Prevista');
  });
});
