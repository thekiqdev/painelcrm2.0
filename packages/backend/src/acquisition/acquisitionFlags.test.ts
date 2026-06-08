import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../platform/featureFlagRegistry.js', () => ({
  featureFlagRegistry: {
    refresh: vi.fn(),
    resolve: vi.fn(),
  },
}));

vi.mock('../platform/featureFlagRepository.js', () => ({
  findPlatformFeatureFlagByKey: vi.fn(),
}));

import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';
import { findPlatformFeatureFlagByKey } from '../platform/featureFlagRepository.js';
import {
  getAcquisitionPublicConfig,
  isAcquisitionSignupFlowEnabled,
} from './acquisitionFlags.js';

describe('acquisitionFlags public surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(featureFlagRegistry.resolve).mockImplementation(async (key: string) => {
      if (key === 'acquisition.master_off') {
        return { key, enabled: false, shadow: false, reason: 'rollout_off' };
      }
      if (key === 'acquisition.signup_flow_v1') {
        return { key, enabled: false, shadow: true, reason: 'shadow_mode' };
      }
      return { key, enabled: false, shadow: false, reason: 'rollout_off' };
    });
    vi.mocked(findPlatformFeatureFlagByKey).mockImplementation(async (key: string) => {
      if (key === 'acquisition.signup_flow_v1') {
        return {
          key,
          namespace: 'acquisition',
          description: '',
          default_enabled: true,
          kill_switch_key: 'acquisition.master_off',
          rollout_type: 'off',
          rollout_percent: 0,
          shadow_mode: true,
          schema_version: 1,
        };
      }
      return null;
    });
  });

  it('treats default_enabled ON as public enabled when registry is in shadow_mode', async () => {
    const enabled = await isAcquisitionSignupFlowEnabled();
    expect(enabled).toBe(true);
  });

  it('exposes signup_flow_v1 true in public config under shadow + default_enabled', async () => {
    vi.mocked(featureFlagRegistry.resolve).mockImplementation(async (key: string) => {
      const shadowKeys = new Set([
        'acquisition.pre_signup_v1',
        'acquisition.signup_flow_v1',
        'acquisition.trial_flow_v1',
        'acquisition.recovery_v1',
        'acquisition.activation_tracking_v1',
        'acquisition.activation_score_v1',
        'acquisition.onboarding_kickoff_v1',
      ]);
      if (key === 'acquisition.master_off') {
        return { key, enabled: false, shadow: false, reason: 'rollout_off' };
      }
      if (shadowKeys.has(key)) {
        return { key, enabled: false, shadow: true, reason: 'shadow_mode' };
      }
      return { key, enabled: false, shadow: false, reason: 'rollout_off' };
    });
    vi.mocked(findPlatformFeatureFlagByKey).mockImplementation(async (key: string) => ({
      key,
      namespace: 'acquisition',
      description: '',
      default_enabled: key === 'acquisition.trial_flow_v1' ? false : true,
      kill_switch_key: 'acquisition.master_off',
      rollout_type: 'off',
      rollout_percent: 0,
      shadow_mode: true,
      schema_version: 1,
    }));

    const cfg = await getAcquisitionPublicConfig();
    expect(cfg.signup_flow_v1).toBe(true);
    expect(cfg.pre_signup_v1).toBe(true);
    expect(cfg.trial_flow_v1).toBe(false);
  });
});
