import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../utils/db.js', () => ({
  pool: { query: (...a: unknown[]) => query(...a) },
}));

vi.mock('../config/partnerCloudflareSaasEnv.js', () => ({
  isCloudflareSaasApiConfigured: vi.fn(),
}));

vi.mock('./tenantDomainFlags.js', () => ({
  isTenantEdgeCloudflareSaasEnabled: vi.fn(),
}));

vi.mock('../partner/cloudflareCustomHostnameClient.js', () => ({
  CloudflareApiError: class CloudflareApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  createCustomHostname: vi.fn(),
  deleteCustomHostname: vi.fn(),
  findCustomHostnameByHostname: vi.fn(),
  getCustomHostname: vi.fn(),
}));

import { isCloudflareSaasApiConfigured } from '../config/partnerCloudflareSaasEnv.js';
import {
  createCustomHostname,
  findCustomHostnameByHostname,
} from '../partner/cloudflareCustomHostnameClient.js';
import { isTenantEdgeCloudflareSaasEnabled } from './tenantDomainFlags.js';
import { provisionTenantCloudflareHostname } from './tenantCloudflareHostnameService.js';

const HOST_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('tenantCloudflareHostnameService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue({ rows: [{}] });
  });

  it('provision: no-op se flag OFF', async () => {
    vi.mocked(isTenantEdgeCloudflareSaasEnabled).mockResolvedValue(false);
    await provisionTenantCloudflareHostname({
      hostId: HOST_ID,
      tenantId: TENANT_ID,
      hostname: 'loja.empresa.com',
    });
    expect(createCustomHostname).not.toHaveBeenCalled();
  });

  it('provision: cria hostname quando flag ON', async () => {
    vi.mocked(isTenantEdgeCloudflareSaasEnabled).mockResolvedValue(true);
    vi.mocked(isCloudflareSaasApiConfigured).mockReturnValue(true);
    query.mockResolvedValueOnce({ rows: [{}] });
    vi.mocked(findCustomHostnameByHostname).mockResolvedValue(null);
    vi.mocked(createCustomHostname).mockResolvedValue({
      id: 'cf-t1',
      hostname: 'loja.empresa.com',
      status: 'pending',
      ssl: { status: 'pending_validation' },
    });
    query.mockResolvedValueOnce({ rows: [] });

    await provisionTenantCloudflareHostname({
      hostId: HOST_ID,
      tenantId: TENANT_ID,
      hostname: 'loja.empresa.com',
    });

    expect(createCustomHostname).toHaveBeenCalledWith('loja.empresa.com');
  });
});
