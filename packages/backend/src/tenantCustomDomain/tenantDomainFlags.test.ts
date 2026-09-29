import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../platform/featureFlagRegistry.js', () => ({
  featureFlagRegistry: {
    resolve: vi.fn(),
  },
}));

import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';
import {
  getTenantCustomDomainBlockedHosts,
  getTenantCustomDomainCnameTarget,
  isTenantCustomDomainEnabled,
  isTenantDomainVerifyBypassEnabled,
  isTenantHostRole,
} from './tenantDomainFlags.js';

describe('tenantDomainFlags (TD S0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TENANT_CUSTOM_DOMAIN_V1;
    delete process.env.TENANT_DOMAIN_VERIFY_BYPASS;
    delete process.env.TENANT_CUSTOM_DOMAIN_BLOCKED_HOSTS;
    delete process.env.TENANT_CUSTOM_DOMAIN_CNAME_TARGET;
    delete process.env.PARTNER_WL_CNAME_TARGET;
  });

  it('isTenantHostRole aceita store|support', () => {
    expect(isTenantHostRole('store')).toBe(true);
    expect(isTenantHostRole('support')).toBe(true);
    expect(isTenantHostRole('app')).toBe(false);
    expect(isTenantHostRole(null)).toBe(false);
  });

  it('custom_domain: Enabled ON no Super Admin', async () => {
    vi.mocked(featureFlagRegistry.resolve).mockResolvedValue({
      key: 'tenant.custom_domain_v1',
      enabled: true,
      shadow: false,
      reason: 'rollout_global',
    });
    await expect(isTenantCustomDomainEnabled()).resolves.toBe(true);
  });

  it('custom_domain: Enabled OFF ignora env', async () => {
    process.env.TENANT_CUSTOM_DOMAIN_V1 = 'true';
    vi.mocked(featureFlagRegistry.resolve).mockResolvedValue({
      key: 'tenant.custom_domain_v1',
      enabled: false,
      shadow: false,
      reason: 'rollout_off',
    });
    await expect(isTenantCustomDomainEnabled()).resolves.toBe(false);
  });

  it('custom_domain: env só se flag ausente no DB', async () => {
    process.env.TENANT_CUSTOM_DOMAIN_V1 = 'true';
    vi.mocked(featureFlagRegistry.resolve).mockResolvedValue({
      key: 'tenant.custom_domain_v1',
      enabled: false,
      shadow: false,
      reason: 'unknown_flag',
    });
    await expect(isTenantCustomDomainEnabled()).resolves.toBe(true);
  });

  it('custom_domain: ausente no DB e sem env → ON por padrão', async () => {
    vi.mocked(featureFlagRegistry.resolve).mockResolvedValue({
      key: 'tenant.custom_domain_v1',
      enabled: false,
      shadow: false,
      reason: 'unknown_flag',
    });
    await expect(isTenantCustomDomainEnabled()).resolves.toBe(true);
  });

  it('domain bypass: Super Admin ON', async () => {
    vi.mocked(featureFlagRegistry.resolve).mockResolvedValue({
      key: 'tenant.domain_verify_bypass',
      enabled: true,
      shadow: false,
      reason: 'rollout_global',
    });
    await expect(isTenantDomainVerifyBypassEnabled()).resolves.toBe(true);
  });

  it('blocked hosts inclui defaults + env + cname target', () => {
    process.env.TENANT_CUSTOM_DOMAIN_BLOCKED_HOSTS = 'staging.example.com';
    process.env.TENANT_CUSTOM_DOMAIN_CNAME_TARGET = 'wl.plataforma.com';
    const hosts = getTenantCustomDomainBlockedHosts();
    expect(hosts).toContain('localhost');
    expect(hosts).toContain('staging.example.com');
    expect(hosts).toContain('wl.plataforma.com');
  });

  it('cname target reusa PARTNER_WL_CNAME_TARGET se tenant env vazio', () => {
    process.env.PARTNER_WL_CNAME_TARGET = 'edge.parceiro-target.com';
    expect(getTenantCustomDomainCnameTarget()).toBe('edge.parceiro-target.com');
  });
});
