import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../utils/db.js', () => ({
  pool: { query: (...a: unknown[]) => query(...a) },
}));

vi.mock('./partnerFlags.js', () => ({
  isPartnerDomainVerifyBypassEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('./partnerRepository.js', () => ({
  getPartnerProfile: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({
  default: {
    resolveTxt: vi.fn(),
    resolveCname: vi.fn(),
  },
}));

import dns from 'node:dns/promises';
import { getPartnerProfile } from './partnerRepository.js';
import { isPartnerDomainVerifyBypassEnabled } from './partnerFlags.js';
import { setPartnerDomain, verifyPartnerDomain } from './partnerDomainService.js';

const PARTNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('partnerDomainService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PARTNER_WL_CNAME_TARGET;
    vi.mocked(isPartnerDomainVerifyBypassEnabled).mockResolvedValue(false);
    query.mockResolvedValue({ rows: [] });
  });

  it('setPartnerDomain grava pending + token', async () => {
    const instr = await setPartnerDomain(PARTNER_ID, 'crm.parceiro.com');
    expect(instr.custom_domain).toBe('crm.parceiro.com');
    expect(instr.domain_status).toBe('pending');
    expect(instr.txt_host).toBe('_painelcrm-partner.crm.parceiro.com');
    expect(instr.domain_verification_token.length).toBeGreaterThan(10);
    expect(query).toHaveBeenCalled();
  });

  it('verifyPartnerDomain bypass via feature flag', async () => {
    vi.mocked(isPartnerDomainVerifyBypassEnabled).mockResolvedValue(true);
    vi.mocked(getPartnerProfile).mockResolvedValue({
      partner_tenant_id: PARTNER_ID,
      program_type: 'license_pool',
      program_config_json: {},
      public_name: 'P',
      product_name: 'P',
      custom_domain: 'crm.parceiro.com',
      domain_status: 'pending',
      domain_verification_token: 'tok123',
      logo_url: null,
      theme_json: {},
      payout_cadence_preference: 'monthly',
      status: 'active',
      created_at: '',
      updated_at: '',
    });
    const result = await verifyPartnerDomain(PARTNER_ID);
    expect(result.verified).toBe(true);
    expect(result.method).toBe('bypass');
  });

  it('verifyPartnerDomain aceita TXT', async () => {
    vi.mocked(getPartnerProfile).mockResolvedValue({
      partner_tenant_id: PARTNER_ID,
      program_type: 'license_pool',
      program_config_json: {},
      public_name: 'P',
      product_name: 'P',
      custom_domain: 'crm.parceiro.com',
      domain_status: 'pending',
      domain_verification_token: 'abc123token',
      logo_url: null,
      theme_json: {},
      payout_cadence_preference: 'monthly',
      status: 'active',
      created_at: '',
      updated_at: '',
    });
    vi.mocked(dns.resolveTxt).mockResolvedValue([['abc123token']]);
    vi.mocked(dns.resolveCname).mockRejectedValue(new Error('ENODATA'));

    const result = await verifyPartnerDomain(PARTNER_ID);
    expect(result.verified).toBe(true);
    expect(result.method).toBe('txt');
  });
});
