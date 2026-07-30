import { describe, expect, it } from 'vitest';
import { assertCyclesConfigPatchAllowed } from './crmSubscriptionCyclesConfigRules.js';

describe('assertCyclesConfigPatchAllowed', () => {
  it('permite ilimitado', () => {
    expect(() =>
      assertCyclesConfigPatchAllowed({
        cycles_unlimited: true,
        max_cycles: null,
        current_unlimited: false,
        current_max_cycles: 12,
        consumed: 3,
      })
    ).not.toThrow();
  });

  it('permite aumentar max', () => {
    expect(() =>
      assertCyclesConfigPatchAllowed({
        cycles_unlimited: false,
        max_cycles: 15,
        current_unlimited: false,
        current_max_cycles: 12,
        consumed: 3,
      })
    ).not.toThrow();
  });

  it('bloqueia reduzir max', () => {
    expect(() =>
      assertCyclesConfigPatchAllowed({
        cycles_unlimited: false,
        max_cycles: 10,
        current_unlimited: false,
        current_max_cycles: 12,
        consumed: 3,
      })
    ).toThrow(/aumentar/);
  });

  it('bloqueia max abaixo dos emitidos', () => {
    expect(() =>
      assertCyclesConfigPatchAllowed({
        cycles_unlimited: false,
        max_cycles: 2,
        current_unlimited: true,
        current_max_cycles: null,
        consumed: 3,
      })
    ).toThrow(/já emitidos/);
  });

  it('permite ∞ → finito com max >= consumidos', () => {
    expect(() =>
      assertCyclesConfigPatchAllowed({
        cycles_unlimited: false,
        max_cycles: 3,
        current_unlimited: true,
        current_max_cycles: null,
        consumed: 3,
      })
    ).not.toThrow();
  });
});
