import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../utils/db.js', () => ({
  pool: { query: (...a: unknown[]) => query(...a) },
}));

import { resolveTenantHostByHostname } from './tenantHostResolver.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HOST_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('tenantHostResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna null se host desconhecido', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(resolveTenantHostByHostname('desconhecido.com')).resolves.toBeNull();
  });

  it('resolve role=store com store_slug', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            host_id: HOST_ID,
            tenant_id: TENANT_ID,
            hostname: 'loja.empresa.com',
            role: 'store',
            status: 'active',
            tenant_name: 'Empresa',
            tenant_slug: 'empresa',
            logo_url: null,
            logo_light_url: 'https://cdn/logo.png',
            account_type: 'platform_customer',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ store_slug: 'minha-loja' }] });

    const resolved = await resolveTenantHostByHostname('https://Loja.Empresa.com');
    expect(resolved).toMatchObject({
      role: 'store',
      store_slug: 'minha-loja',
      tenant_id: TENANT_ID,
      logo_url: 'https://cdn/logo.png',
    });
    expect(resolved?.support_portal_slug).toBeNull();
  });

  it('resolve role=support com portal slug', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            host_id: HOST_ID,
            tenant_id: TENANT_ID,
            hostname: 'suporte.empresa.com',
            role: 'support',
            status: 'active',
            tenant_name: 'Empresa',
            tenant_slug: 'empresa',
            logo_url: null,
            logo_light_url: null,
            account_type: 'platform_customer',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ enabled: true }] });

    const resolved = await resolveTenantHostByHostname('suporte.empresa.com');
    expect(resolved).toMatchObject({
      role: 'support',
      support_portal_slug: 'empresa',
      support_portal_enabled: true,
      store_slug: null,
    });
  });
});
