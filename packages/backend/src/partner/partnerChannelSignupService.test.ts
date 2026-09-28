import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

vi.mock('../utils/jwt.js', () => ({
  generateToken: vi.fn().mockReturnValue('jwt-token'),
}));

vi.mock('../services/tenantAdminService.js', () => ({
  createTenantAdminUser: vi.fn().mockResolvedValue({ userId: 'user-1', email: 'a@b.com' }),
}));

vi.mock('../services/invoiceService.js', () => ({
  createInvoice: vi.fn().mockResolvedValue({ id: 'bill-1', amount_cents: 9900 }),
  ensureTenantBillingInlinePayToken: vi.fn().mockResolvedValue('inline-tok'),
}));

vi.mock('../services/subscriptionService.js', () => ({
  prepareSaasCheckoutPaymentMethodForBilling: vi.fn().mockResolvedValue({
    billing_id: 'bill-1',
    invoice_number: 'INV-1',
    amount_cents: 9900,
    status: 'pending',
    tenant_id: 'ten-1',
    payment_method: 'PIX',
    pix_copy_paste: 'pix-payload',
  }),
}));

vi.mock('../services/platformNotifications/platformBusinessNotifications.js', () => ({
  schedulePublishPlatformBillingChargeCreated: vi.fn(),
}));

vi.mock('../services/userIdentityValidationService.js', () => ({
  assertAdminEmailAvailableForCheckout: vi.fn().mockResolvedValue(undefined),
  assertAdminWhatsappAvailableForCheckout: vi.fn().mockResolvedValue(undefined),
  normalizeWhatsappDigits: (v: string) => String(v || '').replace(/\D/g, '') || null,
}));

vi.mock('./partnerFlags.js', () => ({
  isPartnerChannelEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock('./partnerAttribution.js', () => ({
  findPartnerIdBySlug: vi.fn().mockResolvedValue('partner-1'),
  findActiveSellerOnPartner: vi.fn().mockResolvedValue({ user_id: 'seller-1', referral_code: 'ABC' }),
}));

vi.mock('./partnerRepository.js', () => ({
  getPartnerProfile: vi.fn().mockResolvedValue({
    partner_tenant_id: 'partner-1',
    status: 'active',
    public_name: 'Agência',
  }),
  resolveDefaultPlanId: vi.fn().mockResolvedValue('envelope-plan'),
}));

vi.mock('./partnerSellPlanService.js', () => ({
  getPartnerSellPlan: vi.fn(),
}));

vi.mock('./partnerLicenseService.js', () => ({
  assertPartnerPoolAllowsNewUser: vi.fn().mockResolvedValue(undefined),
  canPartnerSellWithGateway: vi.fn().mockResolvedValue({ ok: true, reason: 'ok' }),
  refreshPartnerUsedSeatsCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/tenantOperationalBootstrapService.js', () => ({
  ensureTenantOperationalBootstrap: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./partnerChannelBillingDocument.js', () => ({
  ensureTenantBillingDocumentForPayment: vi.fn().mockResolvedValue('39053344705'),
  normalizeOptionalBillingDocument: vi.fn().mockReturnValue(null),
  mapPartnerChannelAsaasDocumentError: vi.fn().mockReturnValue(null),
  PARTNER_CPF_CNPJ_REQUIRED_CODE: 'CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD',
}));

import { pool } from '../utils/db.js';
import { createInvoice } from '../services/invoiceService.js';
import { prepareSaasCheckoutPaymentMethodForBilling } from '../services/subscriptionService.js';
import { getPartnerSellPlan } from './partnerSellPlanService.js';
import { findActiveSellerOnPartner } from './partnerAttribution.js';
import { PartnerAdminError } from './partnerAdminService.js';
import { ensureTenantBillingDocumentForPayment } from './partnerChannelBillingDocument.js';
import {
  signupPartnerChannelPaid,
  signupPartnerChannelTrial,
} from './partnerChannelSignupService.js';

const baseInput = {
  partner_slug: 'agencia-devs',
  partner_sell_plan_id: '11111111-1111-4111-8111-111111111111',
  company_name: 'Cliente Demo',
  email: 'admin@cliente.com',
  responsible_name: 'Admin Cliente',
  password: 'SenhaForte1',
  whatsapp: '11999998888',
};

describe('partnerChannelSignupService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('trial: rejeita plano sem trial_days e com preço', async () => {
    vi.mocked(getPartnerSellPlan).mockResolvedValue({
      id: baseInput.partner_sell_plan_id,
      partner_tenant_id: 'partner-1',
      source_platform_plan_id: 'envelope-plan',
      name: 'Pro',
      slug: 'pro',
      price_cents: 9900,
      billing_interval: 'monthly',
      features_json: {},
      status: 'active',
      trial_days: 0,
      created_at: '',
      updated_at: '',
    } as never);

    await expect(signupPartnerChannelTrial(baseInput)).rejects.toMatchObject({
      code: 'PLAN_HAS_NO_TRIAL',
    });
  });

  it('trial: provisiona customer_tenant e devolve JWT', async () => {
    vi.mocked(getPartnerSellPlan).mockResolvedValue({
      id: baseInput.partner_sell_plan_id,
      partner_tenant_id: 'partner-1',
      source_platform_plan_id: 'envelope-plan',
      name: 'Pro',
      slug: 'pro',
      price_cents: 9900,
      billing_interval: 'monthly',
      features_json: {},
      status: 'active',
      trial_days: 7,
      created_at: '',
      updated_at: '',
    } as never);

    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // slug check
        .mockResolvedValueOnce({
          rows: [{ id: 'ten-new', trial_ends_at: '2026-08-25T00:00:00.000Z' }],
        })
        .mockResolvedValueOnce({ rows: [] }) // tenant_plan
        .mockResolvedValueOnce(undefined), // COMMIT
      release: vi.fn(),
    };
    vi.mocked(pool.connect).mockResolvedValue(client as never);
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ id: 'user-1', email: 'admin@cliente.com' }],
    } as never);

    const result = await signupPartnerChannelTrial({
      ...baseInput,
      seller_user_id: '22222222-2222-4222-8222-222222222222',
    });

    expect(findActiveSellerOnPartner).toHaveBeenCalled();
    expect(result.token).toBe('jwt-token');
    expect(result.tenant_id).toBe('ten-new');
    expect(result.partner_sell_plan_id).toBe(baseInput.partner_sell_plan_id);
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it('pago: seller inválido falha sem provisionar', async () => {
    vi.mocked(findActiveSellerOnPartner).mockResolvedValueOnce(null);
    vi.mocked(getPartnerSellPlan).mockResolvedValue({
      id: baseInput.partner_sell_plan_id,
      partner_tenant_id: 'partner-1',
      source_platform_plan_id: 'envelope-plan',
      name: 'Pro',
      slug: 'pro',
      price_cents: 1000,
      billing_interval: 'monthly',
      features_json: {},
      status: 'active',
      trial_days: 0,
      created_at: '',
      updated_at: '',
    } as never);

    await expect(
      signupPartnerChannelPaid({
        ...baseInput,
        seller_user_id: '33333333-3333-4333-8333-333333333333',
        payment_method: 'PIX',
      })
    ).rejects.toMatchObject({ code: 'SELLER_INVALID' });
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it('pago: cria fatura com amount_cents do sell plan e prepara gateway Partner', async () => {
    vi.mocked(getPartnerSellPlan).mockResolvedValue({
      id: baseInput.partner_sell_plan_id,
      partner_tenant_id: 'partner-1',
      source_platform_plan_id: 'envelope-plan',
      name: 'Pro',
      slug: 'pro',
      price_cents: 12345,
      billing_interval: 'monthly',
      features_json: {},
      status: 'active',
      trial_days: 0,
      created_at: '',
      updated_at: '',
    } as never);

    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'ten-pay' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(undefined),
      release: vi.fn(),
    };
    vi.mocked(pool.connect).mockResolvedValue(client as never);
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);

    const result = await signupPartnerChannelPaid({
      ...baseInput,
      payment_method: 'PIX',
      cpf_cnpj: '39053344705',
    });

    expect(ensureTenantBillingDocumentForPayment).toHaveBeenCalledWith('ten-pay', '39053344705');
    expect(createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_cents: 12345,
        plan_name_snapshot: 'Pro',
        billing_reason: 'plan_purchase',
        tenant_id: 'ten-pay',
      })
    );
    expect(prepareSaasCheckoutPaymentMethodForBilling).toHaveBeenCalledWith(
      'ten-pay',
      'bill-1',
      'PIX'
    );
    expect(result.amount_cents).toBe(9900);
    expect(result.billing_id).toBe('bill-1');
    expect(result.pix_copy_paste).toBe('pix-payload');
  });

  it('pago: gera cobrança sem método (provision + fatura)', async () => {
    vi.mocked(getPartnerSellPlan).mockResolvedValue({
      id: baseInput.partner_sell_plan_id,
      partner_tenant_id: 'partner-1',
      source_platform_plan_id: 'envelope-plan',
      name: 'Pro',
      slug: 'pro',
      price_cents: 5000,
      billing_interval: 'monthly',
      features_json: {},
      status: 'active',
      trial_days: 0,
      created_at: '',
      updated_at: '',
    } as never);

    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'ten-gen' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(undefined),
      release: vi.fn(),
    };
    vi.mocked(pool.connect).mockResolvedValue(client as never);
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    vi.mocked(createInvoice).mockResolvedValueOnce({ id: 'bill-gen', amount_cents: 5000 } as never);

    const result = await signupPartnerChannelPaid({
      ...baseInput,
      cpf_cnpj: '39053344705',
      billing_email: 'contato@empresa.com',
    });

    expect(result.billing_id).toBe('bill-gen');
    expect(result.tenant_id).toBe('ten-gen');
    expect(prepareSaasCheckoutPaymentMethodForBilling).not.toHaveBeenCalled();
  });

  it('pago: falha sem CPF/CNPJ antes de criar fatura', async () => {
    vi.mocked(getPartnerSellPlan).mockResolvedValue({
      id: baseInput.partner_sell_plan_id,
      partner_tenant_id: 'partner-1',
      source_platform_plan_id: 'envelope-plan',
      name: 'Pro',
      slug: 'pro',
      price_cents: 1000,
      billing_interval: 'monthly',
      features_json: {},
      status: 'active',
      trial_days: 0,
      created_at: '',
      updated_at: '',
    } as never);

    vi.mocked(ensureTenantBillingDocumentForPayment).mockRejectedValueOnce(
      new PartnerAdminError(
        'CPF/CNPJ é obrigatório',
        'CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD',
        400
      )
    );

    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'ten-no-doc' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(undefined),
      release: vi.fn(),
    };
    vi.mocked(pool.connect).mockResolvedValue(client as never);

    await expect(
      signupPartnerChannelPaid({
        ...baseInput,
        payment_method: 'PIX',
      })
    ).rejects.toMatchObject({ code: 'CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD' });
    expect(createInvoice).not.toHaveBeenCalled();
  });
});
