import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../platform/featureFlagRepository.js', () => ({
  loadAllPlatformFeatureFlags: vi.fn(),
}));

vi.mock('../../modules/payments/gatewayCapabilities.js', () => ({
  gatewaySupports: vi.fn((gatewayKey: string, cap: string) => {
    return gatewayKey === 'asaas' && cap === 'pixAutomatic';
  }),
}));

import { loadAllPlatformFeatureFlags } from '../../platform/featureFlagRepository.js';
import {
  canOfferCrmPixAutomatic,
  isCrmPixAutomaticEnabled,
  CRM_PIX_AUTOMATIC_PLATFORM_FLAG_KEY,
} from './crmPixAutomaticFlags.js';

describe('crmPixAutomaticFlags (CRM0)', () => {
  beforeEach(() => {
    vi.mocked(loadAllPlatformFeatureFlags).mockReset();
  });

  it('default OFF quando flag ausente no DB e sem env', async () => {
    vi.mocked(loadAllPlatformFeatureFlags).mockResolvedValue([]);
    await expect(isCrmPixAutomaticEnabled({})).resolves.toBe(false);
  });

  it('respeita default_enabled do DB', async () => {
    vi.mocked(loadAllPlatformFeatureFlags).mockResolvedValue([
      {
        key: CRM_PIX_AUTOMATIC_PLATFORM_FLAG_KEY,
        namespace: 'crm',
        description: null,
        default_enabled: true,
        kill_switch_key: null,
        rollout_type: 'off',
        rollout_percent: 0,
        shadow_mode: false,
        updated_at: null,
      } as never,
    ]);
    await expect(isCrmPixAutomaticEnabled({})).resolves.toBe(true);
  });

  it('canOffer: flag OFF → unavailable', async () => {
    vi.mocked(loadAllPlatformFeatureFlags).mockResolvedValue([]);
    const r = await canOfferCrmPixAutomatic({ gatewayKey: 'asaas' });
    expect(r).toMatchObject({ available: false, reason: 'flag_off' });
  });

  it('canOffer: flag ON + asaas → available', async () => {
    vi.mocked(loadAllPlatformFeatureFlags).mockResolvedValue([
      {
        key: CRM_PIX_AUTOMATIC_PLATFORM_FLAG_KEY,
        namespace: 'crm',
        default_enabled: true,
      } as never,
    ]);
    const r = await canOfferCrmPixAutomatic({ gatewayKey: 'asaas' });
    expect(r).toMatchObject({ available: true, reason: 'ok' });
  });

  it('canOffer: flag ON + mercado_pago → gateway_unsupported', async () => {
    vi.mocked(loadAllPlatformFeatureFlags).mockResolvedValue([
      {
        key: CRM_PIX_AUTOMATIC_PLATFORM_FLAG_KEY,
        namespace: 'crm',
        default_enabled: true,
      } as never,
    ]);
    const r = await canOfferCrmPixAutomatic({ gatewayKey: 'mercado_pago' });
    expect(r).toMatchObject({ available: false, reason: 'gateway_unsupported' });
  });
});
