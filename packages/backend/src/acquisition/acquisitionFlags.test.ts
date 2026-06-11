import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../platform/signupStrategyService.js', () => ({
  getSignupStrategy: vi.fn(),
}));

vi.mock('../platform/featureFlagRegistry.js', () => ({
  featureFlagRegistry: {
    refresh: vi.fn(),
    resolve: vi.fn(),
  },
}));

vi.mock('../platform/featureFlagRepository.js', () => ({
  findPlatformFeatureFlagByKey: vi.fn(),
}));

import { getSignupStrategy } from '../platform/signupStrategyService.js';
import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';
import {
  getAcquisitionPublicConfig,
  isAcquisitionSignupFlowEnabled,
  isAcquisitionSignupFlowFlagEnabled,
} from './acquisitionFlags.js';

describe('acquisitionFlags E3.2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(featureFlagRegistry.resolve).mockResolvedValue({
      key: 'x',
      enabled: false,
      shadow: false,
      reason: 'rollout_off',
    });
  });

  it('isAcquisitionSignupFlowEnabled segue active_signup_flow', async () => {
    vi.mocked(getSignupStrategy).mockResolvedValue({
      flow: 'exclusive_signup',
      entry_url: '/cadastro',
      closed_trial: true,
      features: {} as never,
    });
    await expect(isAcquisitionSignupFlowEnabled()).resolves.toBe(true);

    vi.mocked(getSignupStrategy).mockResolvedValue({
      flow: 'checkout',
      entry_url: '/checkout',
      closed_trial: false,
      features: {} as never,
    });
    await expect(isAcquisitionSignupFlowEnabled()).resolves.toBe(false);
  });

  it('signup_flow_v1 na config pública espelha a estratégia', async () => {
    vi.mocked(getSignupStrategy).mockResolvedValue({
      flow: 'exclusive_signup',
      entry_url: '/cadastro',
      closed_trial: true,
      features: {} as never,
    });
    const cfg = await getAcquisitionPublicConfig();
    expect(cfg.signup_flow_v1).toBe(true);
  });

  it('flag legada permanece consultável sem bloquear o wizard', async () => {
    vi.mocked(featureFlagRegistry.resolve).mockResolvedValue({
      key: 'acquisition.signup_flow_v1',
      enabled: false,
      shadow: true,
      reason: 'shadow_mode',
    });
    await expect(isAcquisitionSignupFlowFlagEnabled()).resolves.toBe(false);
  });
});
