import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../customerInvoiceService.js', () => ({
  getCustomerInvoiceById: vi.fn(),
  updateCustomerInvoiceGatewayData: vi.fn(),
  updateCustomerInvoiceSubscriptionLink: vi.fn(),
}));

vi.mock('./crmPixAutomaticFlags.js', () => ({
  isCrmPixAutomaticEnabled: vi.fn(async () => true),
  canOfferCrmPixAutomatic: vi.fn(async () => ({
    available: true,
    flag_enabled: true,
    gateway_supports: true,
    reason: 'ok',
  })),
}));

vi.mock('./crmPixAutomaticStore.js', () => ({
  getCrmPixAutomaticAuthBySubscriptionId: vi.fn(),
  upsertCrmPixAutomaticAuthorization: vi.fn(),
  markCrmPixAutomaticUserOptedOut: vi.fn(),
  markCrmPixAutomaticRequested: vi.fn(async () => ({
    subscription_id: 'sub-1',
    status: 'requested',
    authorization_id: null,
  })),
  toPublicPixAutomaticStatus: vi.fn((auth: { status?: string } | null) =>
    auth
      ? {
          status: auth.status ?? null,
          has_active: auth.status === 'active',
          qr_payload: null,
          qr_image: null,
        }
      : null
  ),
  getCrmSubscriptionByPixAuthorizationId: vi.fn(),
  updateCrmPixAutomaticAuthStatus: vi.fn(),
}));

vi.mock('../../modules/payments/gatewayProvider.js', () => ({
  getActiveGateway: vi.fn(),
  getActiveAsaasConfigForCrm: vi.fn(),
}));

vi.mock('../paymentGatewayConfigService.js', () => ({
  getActiveConfig: vi.fn(),
}));

vi.mock('../paymentCustomersService.js', () => ({
  ensurePaymentCustomerForCrmClient: vi.fn(),
}));

vi.mock('../billingSubscriptionService.js', () => ({
  createSubscription: vi.fn(),
}));

vi.mock('../subscriptionService.js', () => ({
  calculateNextBillingDate: vi.fn(),
}));

vi.mock('../../modules/gateways/asaas/client/asaasClient.js', () => ({
  cancelPixAutomaticAuthorization: vi.fn(),
}));

vi.mock('../collectionPolicy/billingAuditEventWriter.js', () => ({
  writeBillingAuditEvent: vi.fn(),
}));

import { pool } from '../../utils/db.js';
import { isCrmPixAutomaticEnabled, canOfferCrmPixAutomatic } from './crmPixAutomaticFlags.js';
import {
  getCrmPixAutomaticAuthBySubscriptionId,
  markCrmPixAutomaticRequested,
} from './crmPixAutomaticStore.js';
import {
  enablePixAutomaticForCrmSubscription,
  getCrmPixAutomaticPreferenceForSubscription,
} from './crmPixAutomaticService.js';

describe('CRM7/CRM8 — enable Pix Automático na assinatura', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isCrmPixAutomaticEnabled).mockResolvedValue(true);
    vi.mocked(getCrmPixAutomaticAuthBySubscriptionId).mockResolvedValue(null);
    vi.mocked(canOfferCrmPixAutomatic).mockResolvedValue({
      available: true,
      flag_enabled: true,
      gateway_supports: true,
      reason: 'ok',
    });
  });

  it('CRM8 — sem fatura aberta grava intenção requested', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-1',
            tenant_id: 'ten-1',
            type: 'customer',
            gateway: 'asaas',
            status: 'active',
          },
        ],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    const r = await enablePixAutomaticForCrmSubscription({
      tenantId: 'ten-1',
      subscriptionId: 'sub-1',
    });
    expect(r).toEqual({
      ok: true,
      authorization_id: null,
      status: 'requested',
      qr_payload: null,
      qr_image: null,
      invoice_id: null,
      deferred: true,
    });
    expect(markCrmPixAutomaticRequested).toHaveBeenCalledWith({
      subscriptionId: 'sub-1',
      tenantId: 'ten-1',
      gateway: 'asaas',
    });
  });

  it('CRM8 — idempotente se já requested', async () => {
    vi.mocked(getCrmPixAutomaticAuthBySubscriptionId).mockResolvedValue({
      subscription_id: 'sub-1',
      status: 'requested',
      authorization_id: null,
    } as never);
    vi.mocked(pool.query)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-1',
            tenant_id: 'ten-1',
            type: 'customer',
            gateway: 'asaas',
            status: 'active',
          },
        ],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    const r = await enablePixAutomaticForCrmSubscription({
      tenantId: 'ten-1',
      subscriptionId: 'sub-1',
    });
    expect(r).toMatchObject({ ok: true, status: 'requested', deferred: true });
    expect(markCrmPixAutomaticRequested).not.toHaveBeenCalled();
  });

  it('flag OFF', async () => {
    vi.mocked(isCrmPixAutomaticEnabled).mockResolvedValue(false);
    const r = await enablePixAutomaticForCrmSubscription({
      tenantId: 'ten-1',
      subscriptionId: 'sub-1',
    });
    expect(r).toEqual({ ok: false, detail: 'flag_crm_pix_automatic_off' });
  });

  it('preference default_on false (legado sem auth)', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    const pref = await getCrmPixAutomaticPreferenceForSubscription({
      subscriptionId: 'sub-1',
      tenantId: 'ten-1',
      gatewayKey: 'asaas',
    });
    expect(pref.default_on).toBe(false);
    expect(pref.switch_on).toBe(false);
    expect(pref.user_opted_off).toBe(false);
  });

  it('preference switch_on true com pending/active', async () => {
    vi.mocked(getCrmPixAutomaticAuthBySubscriptionId).mockResolvedValue({
      subscription_id: 'sub-1',
      status: 'pending',
      authorization_id: 'auth-1',
    } as never);
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    const pref = await getCrmPixAutomaticPreferenceForSubscription({
      subscriptionId: 'sub-1',
      tenantId: 'ten-1',
    });
    expect(pref.default_on).toBe(false);
    expect(pref.switch_on).toBe(true);
  });

  it('preference switch_on true com requested (CRM8)', async () => {
    vi.mocked(getCrmPixAutomaticAuthBySubscriptionId).mockResolvedValue({
      subscription_id: 'sub-1',
      status: 'requested',
      authorization_id: null,
    } as never);
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    const pref = await getCrmPixAutomaticPreferenceForSubscription({
      subscriptionId: 'sub-1',
      tenantId: 'ten-1',
    });
    expect(pref.switch_on).toBe(true);
    expect(pref.status).toBe('requested');
    expect(pref.has_active).toBe(false);
  });

  it('preference default_on false e switch_on false quando cleared', async () => {
    vi.mocked(getCrmPixAutomaticAuthBySubscriptionId).mockResolvedValue({
      subscription_id: 'sub-1',
      status: 'cleared',
      authorization_id: null,
    } as never);
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    const pref = await getCrmPixAutomaticPreferenceForSubscription({
      subscriptionId: 'sub-1',
      tenantId: 'ten-1',
    });
    expect(pref.default_on).toBe(false);
    expect(pref.user_opted_off).toBe(true);
    expect(pref.switch_on).toBe(false);
  });
});
