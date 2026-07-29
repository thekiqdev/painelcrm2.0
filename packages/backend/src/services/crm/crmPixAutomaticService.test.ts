import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../customerInvoiceService.js', () => ({
  getCustomerInvoiceById: vi.fn(),
  updateCustomerInvoiceGatewayData: vi.fn(),
  updateCustomerInvoiceSubscriptionLink: vi.fn(),
}));

vi.mock('./crmPixAutomaticFlags.js', () => ({
  isCrmPixAutomaticEnabled: vi.fn(),
  canOfferCrmPixAutomatic: vi.fn(),
}));

vi.mock('../paymentGatewayConfigService.js', () => ({
  getActiveConfig: vi.fn(async () => ({ gateway_key: 'asaas' })),
}));

vi.mock('../../modules/payments/gatewayProvider.js', () => ({
  getActiveGateway: vi.fn(),
  getActiveAsaasConfigForCrm: vi.fn(),
}));

vi.mock('../../modules/gateways/asaas/client/asaasClient.js', () => ({
  createPixAutomaticAuthorization: vi.fn(),
  cancelPixAutomaticAuthorization: vi.fn(),
  getPixQrCode: vi.fn(),
}));

vi.mock('./crmPixAutomaticStore.js', () => ({
  getCrmPixAutomaticAuthBySubscriptionId: vi.fn(),
  upsertCrmPixAutomaticAuthorization: vi.fn(),
  markCrmPixAutomaticUserOptedOut: vi.fn(),
  toPublicPixAutomaticStatus: vi.fn((row) =>
    row
      ? {
          status: row.status,
          has_active: row.status === 'active',
          qr_payload: row.qr_payload,
          qr_image: row.qr_image?.startsWith('data:')
            ? row.qr_image
            : row.qr_image
              ? `data:image/png;base64,${row.qr_image}`
              : null,
          gateway: row.gateway,
        }
      : null
  ),
}));

vi.mock('../billing2/billingPixAutomaticStore.js', () => ({
  mapBillingIntervalToPixFrequency: vi.fn(() => 'MONTHLY'),
}));

vi.mock('../paymentCustomersService.js', () => ({
  ensurePaymentCustomerForCrmClient: vi.fn(async () => 'cus_crm_1'),
}));

vi.mock('../billingSubscriptionService.js', () => ({
  createSubscription: vi.fn(),
}));

vi.mock('../subscriptionService.js', () => ({
  calculateNextBillingDate: vi.fn(() => '2026-08-29'),
}));

vi.mock('../../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

import { getCustomerInvoiceById, updateCustomerInvoiceGatewayData } from '../customerInvoiceService.js';
import { isCrmPixAutomaticEnabled, canOfferCrmPixAutomatic } from './crmPixAutomaticFlags.js';
import { getActiveGateway, getActiveAsaasConfigForCrm } from '../../modules/payments/gatewayProvider.js';
import * as asaasClient from '../../modules/gateways/asaas/client/asaasClient.js';
import {
  getCrmPixAutomaticAuthBySubscriptionId,
  upsertCrmPixAutomaticAuthorization,
} from './crmPixAutomaticStore.js';
import { pool } from '../../utils/db.js';
import {
  startPixAutomaticAuthorizationForCustomerInvoice,
  cancelPixAutomaticAuthorizationForCustomerInvoice,
} from './crmPixAutomaticService.js';

const openInvoice = {
  id: 'inv-1',
  tenant_id: 'ten-1',
  client_id: 'cli-1',
  subscription_id: 'sub-1',
  amount_cents: 5000,
  due_date: '2026-07-29',
  status: 'waiting_payment',
  invoice_number: 'INV-1',
  gateway: 'asaas',
  payment_method: 'PIX',
  gateway_reference_id: 'pay_old',
  gateway_metadata: { pix_copy_paste: 'PIXAVULSO', pix_qr_code: 'rawqr' },
  gateway_status: 'PENDING',
};

describe('crmPixAutomaticService (CRM1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isCrmPixAutomaticEnabled).mockResolvedValue(true);
    vi.mocked(canOfferCrmPixAutomatic).mockResolvedValue({
      available: true,
      flag_enabled: true,
      gateway_supports: true,
      reason: 'ok',
    });
    vi.mocked(getCustomerInvoiceById).mockResolvedValue(openInvoice as never);
    vi.mocked(getCrmPixAutomaticAuthBySubscriptionId).mockResolvedValue(null);
    vi.mocked(getActiveGateway).mockResolvedValue({} as never);
    vi.mocked(getActiveAsaasConfigForCrm).mockResolvedValue({
      api_key: 'key',
      env: 'sandbox',
    });
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (sql.includes('FROM clients')) {
        return {
          rows: [{ name: 'Cliente', email: 'a@b.c', phone: null, cpf_cnpj: '52998224725' }],
        };
      }
      if (sql.includes('billing_interval')) {
        return { rows: [{ billing_interval: 'monthly' }] };
      }
      return { rows: [] };
    });
  });

  it('flag OFF → flag_crm_pix_automatic_off', async () => {
    vi.mocked(isCrmPixAutomaticEnabled).mockResolvedValue(false);
    const r = await startPixAutomaticAuthorizationForCustomerInvoice({ invoiceId: 'inv-1' });
    expect(r).toEqual({ ok: false, detail: 'flag_crm_pix_automatic_off' });
    expect(asaasClient.createPixAutomaticAuthorization).not.toHaveBeenCalled();
  });

  it('start auth grava conciliation + QR data URL + stash avulso', async () => {
    vi.mocked(asaasClient.createPixAutomaticAuthorization).mockResolvedValue({
      id: 'auth_crm_1',
      status: 'PENDING',
      immediateQrCode: {
        payload: '000201PIXCOMPOSTO',
        encodedImage: 'iVBORw0KGgo=',
        conciliationIdentifier: 'CONC123ASA',
      },
    });

    const r = await startPixAutomaticAuthorizationForCustomerInvoice({ invoiceId: 'inv-1' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.authorization_id).toBe('auth_crm_1');
    expect(r.qr_image?.startsWith('data:image/png;base64,')).toBe(true);
    expect(upsertCrmPixAutomaticAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 'sub-1',
        authorizationId: 'auth_crm_1',
        conciliationId: 'CONC123ASA',
        status: 'pending',
      })
    );
    expect(updateCustomerInvoiceGatewayData).toHaveBeenCalledWith(
      'inv-1',
      expect.objectContaining({
        gateway_status: 'PENDING_PIX_AUTOMATIC_AUTH',
        gateway_metadata: expect.objectContaining({
          pix_automatic_conciliation_id: 'CONC123ASA',
          pix_automatic_authorization_id: 'auth_crm_1',
          standalone_pix_copy_paste: 'PIXAVULSO',
          pix_automatic_journey: 'authorization',
        }),
      })
    );
  });

  it('cancel restaura PIX avulso e marca cleared', async () => {
    vi.mocked(getCustomerInvoiceById).mockResolvedValue({
      ...openInvoice,
      gateway_status: 'PENDING_PIX_AUTOMATIC_AUTH',
      gateway_metadata: {
        pix_automatic_journey: 'authorization',
        standalone_pix_copy_paste: 'PIXAVULSO',
        standalone_pix_qr_code: 'data:image/png;base64,avulso',
        pix_copy_paste: 'COMPOSTO',
        pix_qr_code: 'data:image/png;base64,composto',
      },
    } as never);
    vi.mocked(getCrmPixAutomaticAuthBySubscriptionId).mockResolvedValue({
      subscription_id: 'sub-1',
      tenant_id: 'ten-1',
      authorization_id: 'auth_crm_1',
      status: 'pending',
      gateway: 'asaas',
      authorized_at: null,
      cancelled_at: null,
      contract_id: null,
      qr_payload: 'QR',
      qr_image: 'data:image/png;base64,xx',
      conciliation_id: 'CONC',
    });
    vi.mocked(asaasClient.cancelPixAutomaticAuthorization).mockResolvedValue(undefined);

    const r = await cancelPixAutomaticAuthorizationForCustomerInvoice({
      tenantId: 'ten-1',
      invoiceId: 'inv-1',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pix_copy_paste).toBe('PIXAVULSO');
    expect(updateCustomerInvoiceGatewayData).toHaveBeenCalledWith(
      'inv-1',
      expect.objectContaining({
        gateway_metadata: expect.objectContaining({
          pix_copy_paste: 'PIXAVULSO',
          pix_automatic_journey: null,
        }),
      })
    );
  });
});
