import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../platform/featureFlagRegistry.js', () => ({
  featureFlagRegistry: {
    resolve: vi.fn(),
  },
}));

import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';
import {
  isPartnerChannelEnabled,
  isPartnerDomainVerifyBypassEnabled,
} from './partnerFlags.js';

describe('partnerFlags (Super Admin registry)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PARTNER_CHANNEL_V1;
    delete process.env.PARTNER_DOMAIN_VERIFY_BYPASS;
  });

  it('channel: Enabled ON no Super Admin', async () => {
    vi.mocked(featureFlagRegistry.resolve).mockResolvedValue({
      key: 'partner.channel_v1',
      enabled: true,
      shadow: false,
      reason: 'rollout_global',
    });
    await expect(isPartnerChannelEnabled()).resolves.toBe(true);
  });

  it('channel: Enabled OFF ignora env', async () => {
    process.env.PARTNER_CHANNEL_V1 = 'true';
    vi.mocked(featureFlagRegistry.resolve).mockResolvedValue({
      key: 'partner.channel_v1',
      enabled: false,
      shadow: false,
      reason: 'rollout_off',
    });
    await expect(isPartnerChannelEnabled()).resolves.toBe(false);
  });

  it('channel: env só se flag ausente no DB', async () => {
    process.env.PARTNER_CHANNEL_V1 = 'true';
    vi.mocked(featureFlagRegistry.resolve).mockResolvedValue({
      key: 'partner.channel_v1',
      enabled: false,
      shadow: false,
      reason: 'unknown_flag',
    });
    await expect(isPartnerChannelEnabled()).resolves.toBe(true);
  });

  it('domain bypass: Super Admin ON', async () => {
    vi.mocked(featureFlagRegistry.resolve).mockResolvedValue({
      key: 'partner.domain_verify_bypass',
      enabled: true,
      shadow: false,
      reason: 'rollout_global',
    });
    await expect(isPartnerDomainVerifyBypassEnabled()).resolves.toBe(true);
  });

  it('domain bypass: OFF por default', async () => {
    vi.mocked(featureFlagRegistry.resolve).mockResolvedValue({
      key: 'partner.domain_verify_bypass',
      enabled: false,
      shadow: false,
      reason: 'rollout_off',
    });
    await expect(isPartnerDomainVerifyBypassEnabled()).resolves.toBe(false);
  });
});
