import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../utils/db.js', () => ({
  pool: { query: (...a: unknown[]) => query(...a) },
}));

vi.mock('./tenantDomainService.js', () => ({
  getTenantHostByRole: vi.fn(),
}));

import { getTenantHostByRole } from './tenantDomainService.js';
import {
  buildCanonicalStoreUrl,
  buildCanonicalSupportPortalUrl,
} from './tenantPublicUrls.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('tenantPublicUrls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PUBLIC_APP_URL = 'https://app.platform.test';
  });

  it('store: host active → https://hostname (raiz)', async () => {
    vi.mocked(getTenantHostByRole).mockResolvedValue({
      id: 'h1',
      tenant_id: TENANT_ID,
      hostname: 'loja.empresa.com',
      role: 'store',
      status: 'active',
      verification_token: 't',
      verified_at: null,
      activated_at: null,
      last_check_at: null,
      last_error: null,
      created_at: '',
      updated_at: '',
    });

    const r = await buildCanonicalStoreUrl({ tenantId: TENANT_ID, storeSlug: 'minha-loja' });
    expect(r.onCustomDomain).toBe(true);
    expect(r.url).toBe('https://loja.empresa.com');
  });

  it('store: sem host → path legado na platform', async () => {
    vi.mocked(getTenantHostByRole).mockResolvedValue(null);
    const r = await buildCanonicalStoreUrl({ tenantId: TENANT_ID, storeSlug: 'minha-loja' });
    expect(r.onCustomDomain).toBe(false);
    expect(r.url).toBe('https://app.platform.test/minha-loja/loja');
  });

  it('support: host active → raiz do host', async () => {
    vi.mocked(getTenantHostByRole).mockResolvedValue({
      id: 'h2',
      tenant_id: TENANT_ID,
      hostname: 'suporte.empresa.com',
      role: 'support',
      status: 'active',
      verification_token: 't',
      verified_at: null,
      activated_at: null,
      last_check_at: null,
      last_error: null,
      created_at: '',
      updated_at: '',
    });
    const r = await buildCanonicalSupportPortalUrl({
      tenantId: TENANT_ID,
      portalSlug: 'empresa',
    });
    expect(r.url).toBe('https://suporte.empresa.com');
  });

  it('support: sem host → /suporte/slug', async () => {
    vi.mocked(getTenantHostByRole).mockResolvedValue(null);
    const r = await buildCanonicalSupportPortalUrl({
      tenantId: TENANT_ID,
      portalSlug: 'Empresa',
    });
    expect(r.url).toBe('https://app.platform.test/suporte/empresa');
  });
});
