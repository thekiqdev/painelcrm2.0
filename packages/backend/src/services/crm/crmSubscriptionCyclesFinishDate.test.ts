import { describe, expect, it } from 'vitest';
import {
  computePixAutomaticFinishDateYmd,
  remainingChargeSlots,
} from './crmSubscriptionCyclesFinishDate.js';

describe('computePixAutomaticFinishDateYmd', () => {
  it('omite quando ilimitado', () => {
    expect(
      computePixAutomaticFinishDateYmd({
        startDateYmd: '2026-07-01',
        billingInterval: 'monthly',
        maxCycles: 12,
        cyclesUnlimited: true,
        consumedBeforeAuth: 0,
      })
    ).toBeNull();
  });

  it('12 ciclos mensais a partir de Jul → finish Jun+1y-1m = Jun 2027', () => {
    // remaining 12: Jul..Jun = start + 11 months → 2027-06-01
    expect(
      computePixAutomaticFinishDateYmd({
        startDateYmd: '2026-07-01',
        billingInterval: 'monthly',
        maxCycles: 12,
        cyclesUnlimited: false,
        consumedBeforeAuth: 0,
      })
    ).toBe('2027-06-01');
  });

  it('último ciclo restante → finishDate = startDate', () => {
    expect(
      computePixAutomaticFinishDateYmd({
        startDateYmd: '2026-10-01',
        billingInterval: 'monthly',
        maxCycles: 3,
        cyclesUnlimited: false,
        consumedBeforeAuth: 2,
      })
    ).toBe('2026-10-01');
  });
});

describe('remainingChargeSlots', () => {
  it('ilimitado → null', () => {
    expect(remainingChargeSlots({ cyclesUnlimited: true, maxCycles: null, emitted: 5 })).toBeNull();
  });

  it('finito', () => {
    expect(remainingChargeSlots({ cyclesUnlimited: false, maxCycles: 12, emitted: 3 })).toBe(9);
    expect(remainingChargeSlots({ cyclesUnlimited: false, maxCycles: 3, emitted: 3 })).toBe(0);
  });
});
