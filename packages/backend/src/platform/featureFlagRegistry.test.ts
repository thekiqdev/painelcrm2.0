import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./featureFlagRepository.js', () => ({
  loadAllPlatformFeatureFlags: vi.fn(),
  loadTenantOverridesForFlags: vi.fn(),
}));

import { loadAllPlatformFeatureFlags, loadTenantOverridesForFlags } from './featureFlagRepository.js';
import { featureFlagRegistry } from './featureFlagRegistry.js';

describe('featureFlagRegistry', () => {
  beforeEach(() => {
    featureFlagRegistry.invalidateCache();
    vi.mocked(loadTenantOverridesForFlags).mockResolvedValue(new Map());
  });

  it('returns rollout_off when flag default off', async () => {
    vi.mocked(loadAllPlatformFeatureFlags).mockResolvedValue([
      {
        key: 'outbox.write_v1',
        namespace: 'outbox',
        description: '',
        default_enabled: false,
        kill_switch_key: 'outbox.master_off',
        rollout_type: 'off',
        rollout_percent: 0,
        shadow_mode: true,
        schema_version: 1,
      },
      {
        key: 'outbox.master_off',
        namespace: 'outbox',
        description: '',
        default_enabled: false,
        kill_switch_key: null,
        rollout_type: 'off',
        rollout_percent: 0,
        shadow_mode: false,
        schema_version: 1,
      },
    ]);

    const res = await featureFlagRegistry.resolve('outbox.write_v1', { tenantId: 'tenant-a' });
    expect(res.enabled).toBe(false);
    expect(res.shadow).toBe(true);
    expect(res.reason).toBe('shadow_mode');
  });

  it('respects kill switch', async () => {
    vi.mocked(loadAllPlatformFeatureFlags).mockResolvedValue([
      {
        key: 'outbox.master_off',
        namespace: 'outbox',
        description: '',
        default_enabled: true,
        kill_switch_key: null,
        rollout_type: 'global',
        rollout_percent: 100,
        shadow_mode: false,
        schema_version: 1,
      },
      {
        key: 'outbox.write_v1',
        namespace: 'outbox',
        description: '',
        default_enabled: true,
        kill_switch_key: 'outbox.master_off',
        rollout_type: 'global',
        rollout_percent: 100,
        shadow_mode: false,
        schema_version: 1,
      },
    ]);

    const res = await featureFlagRegistry.resolve('outbox.write_v1', {});
    expect(res.enabled).toBe(false);
    expect(res.reason).toBe('kill_switch');
  });

  it('applies tenant override', async () => {
    vi.mocked(loadAllPlatformFeatureFlags).mockResolvedValue([
      {
        key: 'communication.gateway_v1',
        namespace: 'communication',
        description: '',
        default_enabled: false,
        kill_switch_key: null,
        rollout_type: 'off',
        rollout_percent: 0,
        shadow_mode: true,
        schema_version: 1,
      },
    ]);
    vi.mocked(loadTenantOverridesForFlags).mockResolvedValue(
      new Map([['communication.gateway_v1', true]]),
    );

    const res = await featureFlagRegistry.resolve('communication.gateway_v1', {
      tenantId: 't1',
    });
    expect(res.enabled).toBe(true);
    expect(res.reason).toBe('tenant_override');
  });
});
