import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../platform/featureFlagRegistry.js', () => ({
  featureFlagRegistry: {
    resolve: vi.fn(),
  },
}));

import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';
import { isApiKeysEnabled } from './apiKeyFlags.js';

describe('apiKeyFlags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.API_KEYS_V1;
  });

  it('ON no Super Admin', async () => {
    vi.mocked(featureFlagRegistry.resolve).mockResolvedValue({
      key: 'api.keys_v1',
      enabled: true,
      shadow: false,
      reason: 'tenant_override',
    });
    await expect(isApiKeysEnabled({ tenantId: 't1' })).resolves.toBe(true);
  });

  it('OFF no banco ignora env', async () => {
    process.env.API_KEYS_V1 = 'true';
    vi.mocked(featureFlagRegistry.resolve).mockResolvedValue({
      key: 'api.keys_v1',
      enabled: false,
      shadow: false,
      reason: 'rollout_off',
    });
    await expect(isApiKeysEnabled()).resolves.toBe(false);
  });

  it('env só se a flag não existe no DB', async () => {
    process.env.API_KEYS_V1 = 'true';
    vi.mocked(featureFlagRegistry.resolve).mockResolvedValue({
      key: 'api.keys_v1',
      enabled: false,
      shadow: false,
      reason: 'unknown_flag',
    });
    await expect(isApiKeysEnabled()).resolves.toBe(true);
  });

  it('ausente → off', async () => {
    vi.mocked(featureFlagRegistry.resolve).mockResolvedValue({
      key: 'api.keys_v1',
      enabled: false,
      shadow: false,
      reason: 'unknown_flag',
    });
    await expect(isApiKeysEnabled()).resolves.toBe(false);
  });
});
