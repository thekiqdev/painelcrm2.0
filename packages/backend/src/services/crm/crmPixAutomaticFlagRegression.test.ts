import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../customerInvoiceService.js', () => ({
  getCustomerInvoiceById: vi.fn(),
  updateCustomerInvoiceGatewayData: vi.fn(),
}));

vi.mock('./crmPixAutomaticFlags.js', () => ({
  isCrmPixAutomaticEnabled: vi.fn(async () => false),
  canOfferCrmPixAutomatic: vi.fn(async () => ({
    available: false,
    flag_enabled: false,
    gateway_supports: true,
    reason: 'flag_off',
  })),
}));

vi.mock('./crmPixAutomaticStore.js', () => ({
  getCrmPixAutomaticAuthBySubscriptionId: vi.fn(),
  upsertCrmPixAutomaticAuthorization: vi.fn(),
  markCrmPixAutomaticUserOptedOut: vi.fn(),
  toPublicPixAutomaticStatus: vi.fn(),
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

vi.mock('../../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../collectionPolicy/billingAuditEventWriter.js', () => ({
  writeBillingAuditEvent: vi.fn(),
}));

vi.mock('../../modules/gateways/asaas/client/asaasClient.js', () => ({
  cancelPixAutomaticAuthorization: vi.fn(),
}));

import { isCrmPixAutomaticEnabled } from './crmPixAutomaticFlags.js';
import {
  finalizePixAutomaticOnCustomerInvoiceCreate,
  startPixAutomaticAuthorizationForCustomerInvoice,
  createPixAutomaticInstructionForCustomerInvoice,
} from './crmPixAutomaticService.js';
import { getCustomerInvoiceById, updateCustomerInvoiceGatewayData } from '../customerInvoiceService.js';

/**
 * CRM6 — com flag OFF, caminhos Pix Auto não devem alterar cobrança legado
 * (não start auth, não instruction, create só marca request se pedido mas start falha cedo).
 */
describe('CRM6 regressão flag OFF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isCrmPixAutomaticEnabled).mockResolvedValue(false);
  });

  it('start auth → flag_crm_pix_automatic_off (sem tocar gateway)', async () => {
    const r = await startPixAutomaticAuthorizationForCustomerInvoice({ invoiceId: 'inv-1' });
    expect(r).toEqual({ ok: false, detail: 'flag_crm_pix_automatic_off' });
    expect(getCustomerInvoiceById).not.toHaveBeenCalled();
  });

  it('instruction renovação → flag_crm_pix_automatic_off', async () => {
    const r = await createPixAutomaticInstructionForCustomerInvoice({ invoiceId: 'inv-1' });
    expect(r).toEqual({ ok: false, detail: 'flag_crm_pix_automatic_off' });
    expect(getCustomerInvoiceById).not.toHaveBeenCalled();
  });

  it('finalize create com pedido: start falha por flag; metadata de request apenas', async () => {
    vi.mocked(getCustomerInvoiceById).mockResolvedValue({
      id: 'inv-1',
      tenant_id: 'ten-1',
      client_id: 'cli-1',
      gateway: 'asaas',
      payment_method: 'PIX',
      gateway_reference_id: 'pay_1',
      gateway_status: 'PENDING',
      gateway_metadata: {},
    } as never);

    const r = await finalizePixAutomaticOnCustomerInvoiceCreate({
      tenantId: 'ten-1',
      invoiceId: 'inv-1',
      pixAutomaticRequested: true,
      allowedPaymentMethods: ['PIX'],
    });

    expect(r).toMatchObject({
      requested: true,
      started: false,
      detail: 'flag_crm_pix_automatic_off',
      warning: true,
    });
    expect(updateCustomerInvoiceGatewayData).toHaveBeenCalled();
  });

  it('finalize create sem pedido → null (caminho legado puro)', async () => {
    const r = await finalizePixAutomaticOnCustomerInvoiceCreate({
      tenantId: 'ten-1',
      invoiceId: 'inv-1',
      pixAutomaticRequested: false,
    });
    expect(r).toBeNull();
    expect(getCustomerInvoiceById).not.toHaveBeenCalled();
  });
});
