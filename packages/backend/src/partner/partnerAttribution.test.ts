import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('./partnerBrandResolver.js', () => ({
  normalizeHostname: (h: string | null | undefined) =>
    h ? String(h).split(':')[0].toLowerCase() : null,
  resolvePartnerBrandByHost: vi.fn(),
}));

import { pool } from '../utils/db.js';
import { resolvePartnerBrandByHost } from './partnerBrandResolver.js';
import {
  buildPartnerSaleUrl,
  resolvePartnerAttribution,
} from './partnerAttribution.js';

describe('partnerAttribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('buildPartnerSaleUrl usa path com slug e seller', () => {
    expect(
      buildPartnerSaleUrl({
        origin: 'https://app.painelcrm.com',
        partnerSlug: 'revenda-x',
      })
    ).toBe('https://app.painelcrm.com/revenda-x/cadastro');

    expect(
      buildPartnerSaleUrl({
        origin: 'https://app.painelcrm.com',
        partnerSlug: 'revenda-x',
        sellerUserId: 'seller-uuid-1',
      })
    ).toBe('https://app.painelcrm.com/revenda-x/seller-uuid-1/cadastro');

    expect(
      buildPartnerSaleUrl({
        origin: 'https://crm.parceiro.com',
        partnerSlug: 'revenda-x',
        onCustomDomain: true,
      })
    ).toBe('https://crm.parceiro.com/cadastro');

    expect(
      buildPartnerSaleUrl({
        origin: 'https://crm.parceiro.com',
        partnerSlug: 'revenda-x',
        sellerUserId: 'seller-uuid-1',
        onCustomDomain: true,
      })
    ).toBe('https://crm.parceiro.com/seller-uuid-1/cadastro');
  });

  it('resolvePartnerAttribution: host define partner; sem ref = casa', async () => {
    vi.mocked(resolvePartnerBrandByHost).mockResolvedValue({
      partner_tenant_id: 'partner-1',
      public_name: 'P',
      product_name: 'P',
      logo_url: null,
      theme_json: {},
      tagline: null,
      custom_domain: 'crm.p.com',
      domain_status: 'verified',
    } as never);

    const attr = await resolvePartnerAttribution({ host: 'crm.p.com' });
    expect(attr.partner_id).toBe('partner-1');
    expect(attr.seller_user_id).toBeNull();
  });

  it('resolvePartnerAttribution: slug define partner', async () => {
    vi.mocked(resolvePartnerBrandByHost).mockResolvedValue(null as never);
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 'partner-slug-1' }],
    } as never);

    const attr = await resolvePartnerAttribution({ partnerSlug: 'revenda-x' });
    expect(attr.partner_id).toBe('partner-slug-1');
  });

  it('resolvePartnerAttribution: sellerUserId no path atribui seller', async () => {
    vi.mocked(resolvePartnerBrandByHost).mockResolvedValue(null as never);
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 'partner-1' }] } as never)
      .mockResolvedValueOnce({
        rows: [{ user_id: 'seller-9', referral_code: 'ref9' }],
      } as never);

    const attr = await resolvePartnerAttribution({
      partnerSlug: 'revenda-x',
      sellerUserId: 'seller-9',
    });
    expect(attr.partner_id).toBe('partner-1');
    expect(attr.seller_user_id).toBe('seller-9');
  });

  it('resolvePartnerAttribution: ref atribui seller do mesmo partner', async () => {
    vi.mocked(resolvePartnerBrandByHost).mockResolvedValue({
      partner_tenant_id: 'partner-1',
    } as never);
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        {
          partner_tenant_id: 'partner-1',
          user_id: 'seller-9',
          referral_code: 'ref9',
        },
      ],
    } as never);

    const attr = await resolvePartnerAttribution({
      host: 'crm.p.com',
      referralCode: 'ref9',
    });
    expect(attr.partner_id).toBe('partner-1');
    expect(attr.seller_user_id).toBe('seller-9');
    expect(attr.seller_referral_code).toBe('ref9');
  });

  it('resolvePartnerAttribution: ref de outro partner é ignorado no host', async () => {
    vi.mocked(resolvePartnerBrandByHost).mockResolvedValue({
      partner_tenant_id: 'partner-1',
    } as never);
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        {
          partner_tenant_id: 'partner-2',
          user_id: 'seller-x',
          referral_code: 'xx',
        },
      ],
    } as never);

    const attr = await resolvePartnerAttribution({
      host: 'crm.p.com',
      referralCode: 'xx',
    });
    expect(attr.partner_id).toBe('partner-1');
    expect(attr.seller_user_id).toBeNull();
  });
});
