import { describe, it, expect } from 'vitest';
import { computeFinalNextBillingForCompletedCycle } from './recurringBillingJobService.js';

describe('computeFinalNextBillingForCompletedCycle', () => {
  it('mensal: ciclo 24/04 com next igual ao ciclo avança para 24/05', () => {
    const r = computeFinalNextBillingForCompletedCycle({
      cycleDateYmd: '2026-04-24',
      billingInterval: 'monthly',
      oldNextBillingRaw: '2026-04-24',
    });
    expect(r.cycleDate).toBe('2026-04-24');
    expect(r.computedNextYmd).toBe('2026-05-24');
    expect(r.finalNextYmd).toBe('2026-05-24');
    expect(r.reason).toBe('old_next_on_or_before_cycle_apply_computed');
    expect(r.skippedAlreadyAhead).toBe(false);
  });

  it('mensal: next inválido usa computed', () => {
    const r = computeFinalNextBillingForCompletedCycle({
      cycleDateYmd: '2026-04-24',
      billingInterval: 'monthly',
      oldNextBillingRaw: '',
    });
    expect(r.finalNextYmd).toBe('2026-05-24');
    expect(r.reason).toBe('old_next_invalid_use_computed');
  });

  it('anual: avança um ano mantendo dia', () => {
    const r = computeFinalNextBillingForCompletedCycle({
      cycleDateYmd: '2026-04-24',
      billingInterval: 'yearly',
      oldNextBillingRaw: '2026-04-24',
    });
    expect(r.finalNextYmd).toBe('2027-04-24');
  });

  it('semanal: avança 7 dias', () => {
    const r = computeFinalNextBillingForCompletedCycle({
      cycleDateYmd: '2026-06-01',
      billingInterval: 'weekly',
      oldNextBillingRaw: '2026-06-01',
    });
    expect(r.finalNextYmd).toBe('2026-06-08');
  });

  it('proteção anti-regressão: next já à frente do computado mantém', () => {
    const r = computeFinalNextBillingForCompletedCycle({
      cycleDateYmd: '2026-04-24',
      billingInterval: 'monthly',
      oldNextBillingRaw: '2026-06-24',
    });
    expect(r.computedNextYmd).toBe('2026-05-24');
    expect(r.finalNextYmd).toBe('2026-06-24');
    expect(r.skippedAlreadyAhead).toBe(true);
    expect(r.reason).toBe('kept_subscription_ahead_no_regress');
  });

  it('next já no próximo mês (reagendamento): max com computed', () => {
    const r = computeFinalNextBillingForCompletedCycle({
      cycleDateYmd: '2026-04-24',
      billingInterval: 'monthly',
      oldNextBillingRaw: '2026-05-24',
    });
    expect(r.finalNextYmd).toBe('2026-05-24');
    expect(r.reason).toBe('old_next_after_cycle_max_with_computed');
    expect(r.skippedAlreadyAhead).toBe(false);
  });
});
