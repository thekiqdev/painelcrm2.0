import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../utils/db.js', () => ({
  pool: { query: (...a: unknown[]) => query(...a) },
}));

vi.mock('../config/partnerCloudflareSaasEnv.js', () => ({
  isCloudflareSaasApiConfigured: vi.fn(),
}));

vi.mock('./partnerFlags.js', () => ({
  isPartnerEdgeCloudflareSaasEnabled: vi.fn(),
}));

vi.mock('./cloudflareCustomHostnameClient.js', () => ({
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
  deleteCustomHostname,
  findCustomHostnameByHostname,
  getCustomHostname,
} from './cloudflareCustomHostnameClient.js';
import { isPartnerEdgeCloudflareSaasEnabled } from './partnerFlags.js';
import {
  deprovisionPartnerCloudflareHostname,
  provisionPartnerCloudflareHostname,
} from './partnerCloudflareHostnameService.js';

const PARTNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('partnerCloudflareHostnameService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue({ rows: [{}] });
  });

  it('provision: no-op se flag OFF', async () => {
    vi.mocked(isPartnerEdgeCloudflareSaasEnabled).mockResolvedValue(false);
    await provisionPartnerCloudflareHostname({
      partnerTenantId: PARTNER_ID,
      hostname: 'crm.parceiro.com',
    });
    expect(createCustomHostname).not.toHaveBeenCalled();
  });

  it('provision: cria hostname quando flag ON', async () => {
    vi.mocked(isPartnerEdgeCloudflareSaasEnabled).mockResolvedValue(true);
    vi.mocked(isCloudflareSaasApiConfigured).mockReturnValue(true);
    query.mockResolvedValueOnce({ rows: [{}] }); // load snapshot
    vi.mocked(findCustomHostnameByHostname).mockResolvedValue(null);
    vi.mocked(createCustomHostname).mockResolvedValue({
      id: 'cf-1',
      hostname: 'crm.parceiro.com',
      status: 'pending',
      ssl: { status: 'pending_validation' },
    });
    query.mockResolvedValueOnce({ rows: [] }); // persist

    await provisionPartnerCloudflareHostname({
      partnerTenantId: PARTNER_ID,
      hostname: 'crm.parceiro.com',
    });

    expect(createCustomHostname).toHaveBeenCalledWith('crm.parceiro.com');
    expect(query).toHaveBeenCalled();
  });

  it('provision: falha CF grava erro e não throw', async () => {
    vi.mocked(isPartnerEdgeCloudflareSaasEnabled).mockResolvedValue(true);
    vi.mocked(isCloudflareSaasApiConfigured).mockReturnValue(true);
    query.mockResolvedValueOnce({ rows: [{}] });
    vi.mocked(findCustomHostnameByHostname).mockRejectedValue(new Error('cf down'));
    query.mockResolvedValueOnce({ rows: [] });

    await expect(
      provisionPartnerCloudflareHostname({
        partnerTenantId: PARTNER_ID,
        hostname: 'crm.parceiro.com',
      })
    ).resolves.toBeUndefined();
  });

  it('deprovision: apaga Custom Hostname e limpa espelho', async () => {
    vi.mocked(isCloudflareSaasApiConfigured).mockReturnValue(true);
    query
      .mockResolvedValueOnce({
        rows: [{ cf_custom_hostname_id: 'cf-1', cf_ssl_status: 'active' }],
      })
      .mockResolvedValueOnce({ rows: [{ custom_domain: 'crm.parceiro.com' }] })
      .mockResolvedValueOnce({ rows: [] });
    vi.mocked(deleteCustomHostname).mockResolvedValue(undefined);

    await deprovisionPartnerCloudflareHostname({ partnerTenantId: PARTNER_ID });

    expect(deleteCustomHostname).toHaveBeenCalledWith('cf-1');
    expect(getCustomHostname).not.toHaveBeenCalled();
  });
});
