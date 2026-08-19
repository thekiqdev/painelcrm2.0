import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('./partnerFlags.js', () => ({
  isPartnerChannelEnabled: vi.fn().mockResolvedValue(true),
}));

import { pool } from '../utils/db.js';
import {
  normalizeHostname,
  resolvePartnerBrandByHost,
  resolveTransactionalBrandName,
} from './partnerBrandResolver.js';

describe('partnerBrandResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.APP_PUBLIC_NAME;
  });

  it('normalizeHostname remove porta e www', () => {
    expect(normalizeHostname('https://WWW.Exemplo.com:443/path')).toBe('exemplo.com');
  });

  it('resolvePartnerBrandByHost retorna marca ativa', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          partner_tenant_id: 'p1',
          public_name: 'Revenda',
          product_name: 'CRM Revenda',
          logo_url: null,
          theme_json: { tagline: 'Olá' },
          custom_domain: 'crm.revenda.com',
          domain_status: 'active',
        },
      ],
    } as never);

    const brand = await resolvePartnerBrandByHost('crm.revenda.com');
    expect(brand?.product_name).toBe('CRM Revenda');
    expect(brand?.tagline).toBe('Olá');
  });

  it('resolveTransactionalBrandName cai no Platform', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await expect(resolveTransactionalBrandName({})).resolves.toBe('PainelCRM');
  });
});
