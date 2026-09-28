import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../customerInvoiceService.js', () => ({
  getCustomerInvoiceById: vi.fn(),
  updateCustomerInvoiceGatewayData: vi.fn(async () => undefined),
  updateCustomerInvoiceSubscriptionLink: vi.fn(),
}));

vi.mock('../../modules/payments/webhook/paymentDomainService.js', () => ({
  applyPaymentEvent: vi.fn(async () => ({
    previous_status: 'pending',
    new_status: 'paid',
    action: 'status_updated',
    reason: 'ok',
  })),
}));

vi.mock('../billingGatewayChargeService.js', () => ({
  deleteGatewayChargeIfSafe: vi.fn(async () => ({ deleted: true, skipped: false })),
}));

vi.mock('../collectionPolicy/billingAuditEventWriter.js', () => ({
  writeBillingAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('./crmPixAutomaticFlags.js', () => ({
  isCrmPixAutomaticEnabled: vi.fn(async () => true),
  canOfferCrmPixAutomatic: vi.fn(async () => ({ available: true })),
}));

vi.mock('./crmPixAutomaticStore.js', () => ({
  getCrmPixAutomaticAuthBySubscriptionId: vi.fn(),
  upsertCrmPixAutomaticAuthorization: vi.fn(),
  markCrmPixAutomaticUserOptedOut: vi.fn(),
  toPublicPixAutomaticStatus: vi.fn(),
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

import { getCustomerInvoiceById, updateCustomerInvoiceGatewayData } from '../customerInvoiceService.js';
import { applyPaymentEvent } from '../../modules/payments/webhook/paymentDomainService.js';
import { writeBillingAuditEvent } from '../collectionPolicy/billingAuditEventWriter.js';
import { settleOrphanPixAutomaticCustomerInvoice } from './crmPixAutomaticService.js';

describe('settleOrphanPixAutomaticCustomerInvoice (CRM6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exige paymentId', async () => {
    const r = await settleOrphanPixAutomaticCustomerInvoice({ paymentId: '  ' });
    expect(r).toEqual({ ok: false, detail: 'payment_id_required' });
  });

  it('liquida por invoiceId explícito', async () => {
    vi.mocked(getCustomerInvoiceById).mockResolvedValue({
      id: 'inv-1',
      status: 'pending',
      gateway: 'asaas',
      tenant_id: 'ten-1',
      gateway_reference_id: 'pay_old',
    } as never);

    const r = await settleOrphanPixAutomaticCustomerInvoice({
      paymentId: 'pay_orphan_new',
      invoiceId: 'inv-1',
      pixQrCodeId: 'QR_ASA',
    });

    expect(r).toEqual({ ok: true, invoice_id: 'inv-1' });
    expect(updateCustomerInvoiceGatewayData).toHaveBeenCalledWith(
      'inv-1',
      expect.objectContaining({
        gateway_reference_id: 'pay_orphan_new',
        gateway_metadata: expect.objectContaining({
          pix_automatic_conciliation_id: 'QR_ASA',
        }),
      })
    );
    expect(applyPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'customer_invoice',
        entityId: 'inv-1',
        internalStatus: 'paid',
      })
    );
    expect(writeBillingAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'pix_automatic.orphan_first_payment_settled',
        origin: 'crm',
      })
    );
  });

  it('invoice não encontrada', async () => {
    vi.mocked(getCustomerInvoiceById).mockResolvedValue(null);
    const { pool } = await import('../../utils/db.js');
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    const r = await settleOrphanPixAutomaticCustomerInvoice({
      paymentId: 'pay_x',
      pixQrCodeId: 'MISSING',
    });
    expect(r).toEqual({ ok: false, detail: 'invoice_not_found' });
  });
});
