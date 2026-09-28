import { describe, expect, it } from 'vitest';
import { effectiveContractedSeats } from './tenantSeatCommercialService.js';

describe('effectiveContractedSeats', () => {
  it('prioriza override', () => {
    expect(
      effectiveContractedSeats({ max_users_override: 8, subscription_users_count: 3 })
    ).toBe(8);
  });

  it('cai para users_count da assinatura', () => {
    expect(
      effectiveContractedSeats({ max_users_override: null, subscription_users_count: 4 })
    ).toBe(4);
  });

  it('mínimo 1', () => {
    expect(
      effectiveContractedSeats({ max_users_override: null, subscription_users_count: null })
    ).toBe(1);
  });
});
