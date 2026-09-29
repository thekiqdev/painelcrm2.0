import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../platform/featureFlagRegistry.js', () => ({
  featureFlagRegistry: {
    resolve: vi.fn(),
  },
}));

import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';
import {
  TENANT_CUSTOM_DOMAIN_CNAME_FALLBACK,
  getTenantCustomDomainBlockedHosts,
  getTenantCustomDomainCnameTarget,
  isTenantCustomDomainEnabled,
  isTenantDomainVerifyBypassEnabled,
  isTenantHostRole,
} from './tenantDomainFlags.js';

describe('tenantDomainFlags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TENANT_CUSTOM_DOMAIN_V1;
    delete process.env.TENANT_DOMAIN_VERIFY_BYPASS;
    delete process.env.TENANT_CUSTOM_DOMAIN_BLOCKED_HOSTS;
    delete process.env.TENANT_CUSTOM_DOMAIN_CNAME_TARGET;
    delete process.env.PARTNER_WL_CNAME_TARGET;
    delete process.env.PUBLIC_APP_URL;
    delete process.env.FRONTEND_URL;
    delete process.env.FRONTEND_URLS;
    vi.mocked(featureFlagRegistry.resolve).mockResolvedValue({
      key: 'tenant.master_off',
      enabled: false,
      shadow: false,
      reason: 'rollout_off',
    });
  });

  it('isTenantHostRole aceita store|support', () => {
    expect(isTenantHostRole('store')).toBe(true);
    expect(isTenantHostRole('support')).toBe(true);
    expect(isTenantHostRole('app')).toBe(false);
    expect(isTenantHostRole(null)).toBe(false);
  });

  it('custom_domain: ON por padrão (sem env)', async () => {
    await expect(isTenantCustomDomainEnabled()).resolves.toBe(true);
  });

  it('custom_domain: kill switch master_off desliga', async () => {
    vi.mocked(featureFlagRegistry.resolve).mockResolvedValue({
      key: 'tenant.master_off',
      enabled: true,
      shadow: false,
      reason: 'rollout_global',
    });
    await expect(isTenantCustomDomainEnabled()).resolves.toBe(false);
  });

  it('custom_domain: TENANT_CUSTOM_DOMAIN_V1=false desliga', async () => {
    process.env.TENANT_CUSTOM_DOMAIN_V1 = 'false';
    await expect(isTenantCustomDomainEnabled()).resolves.toBe(false);
  });

  it('domain bypass: Super Admin ON', async () => {
    vi.mocked(featureFlagRegistry.resolve).mockImplementation(async (key: string) => {
      if (key === 'tenant.domain_verify_bypass') {
        return {
          key,
          enabled: true,
          shadow: false,
          reason: 'rollout_global' as const,
        };
      }
      return { key, enabled: false, shadow: false, reason: 'rollout_off' as const };
    });
    await expect(isTenantDomainVerifyBypassEnabled()).resolves.toBe(true);
  });

  it('cname target: env tenant tem prioridade', () => {
    process.env.TENANT_CUSTOM_DOMAIN_CNAME_TARGET = 'edge.custom.com';
    expect(getTenantCustomDomainCnameTarget()).toBe('edge.custom.com');
  });

  it('cname target: PARTNER_WL_CNAME_TARGET se tenant env vazio', () => {
    process.env.PARTNER_WL_CNAME_TARGET = 'edge.parceiro-target.com';
    expect(getTenantCustomDomainCnameTarget()).toBe('edge.parceiro-target.com');
  });

  it('cname target: hostname de FRONTEND_URL sem env CNAME', () => {
    process.env.FRONTEND_URL = 'https://painelcrm.com';
    expect(getTenantCustomDomainCnameTarget()).toBe('painelcrm.com');
  });

  it('cname target: fallback painelcrm.com sem env', () => {
    expect(getTenantCustomDomainCnameTarget()).toBe(TENANT_CUSTOM_DOMAIN_CNAME_FALLBACK);
  });

  it('blocked hosts inclui defaults + env + cname target', () => {
    process.env.TENANT_CUSTOM_DOMAIN_BLOCKED_HOSTS = 'staging.example.com';
    process.env.TENANT_CUSTOM_DOMAIN_CNAME_TARGET = 'wl.plataforma.com';
    const hosts = getTenantCustomDomainBlockedHosts();
    expect(hosts).toContain('localhost');
    expect(hosts).toContain('staging.example.com');
    expect(hosts).toContain('wl.plataforma.com');
  });
});
