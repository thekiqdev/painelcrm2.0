import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./signupStrategyService.js', () => ({
  getSignupStrategy: vi.fn(),
}));

import { getSignupStrategy } from './signupStrategyService.js';
import {
  EXCLUSIVE_SIGNUP_INACTIVE_CODE,
  buildExclusiveSignupInactivePayload,
  isExclusiveSignupFlowActive,
} from './exclusiveSignupFlowGate.js';

describe('exclusiveSignupFlowGate E3.2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exclusive_signup ativo', async () => {
    vi.mocked(getSignupStrategy).mockResolvedValue({
      flow: 'exclusive_signup',
      entry_url: '/cadastro',
      closed_trial: true,
      features: {} as never,
    });
    await expect(isExclusiveSignupFlowActive()).resolves.toBe(true);
  });

  it('checkout inativo para /cadastro', async () => {
    vi.mocked(getSignupStrategy).mockResolvedValue({
      flow: 'checkout',
      entry_url: '/checkout',
      closed_trial: false,
      features: {} as never,
    });
    await expect(isExclusiveSignupFlowActive()).resolves.toBe(false);
    const payload = buildExclusiveSignupInactivePayload();
    expect(payload.code).toBe(EXCLUSIVE_SIGNUP_INACTIVE_CODE);
    expect(payload.fallback_path).toBe('/checkout');
  });
});
