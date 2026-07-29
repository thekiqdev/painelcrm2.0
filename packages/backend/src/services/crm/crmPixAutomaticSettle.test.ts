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

import { pool } from '../../utils/db.js';
import { updateCustomerInvoiceGatewayData } from '../customerInvoiceService.js';
import { applyPaymentEvent } from '../../modules/payments/webhook/paymentDomainService.js';
import { deleteGatewayChargeIfSafe } from '../billingGatewayChargeService.js';
import {
  findCustomerInvoiceByPixAutomaticConciliation,
  settleCustomerInvoiceOnPixAutomaticActivated,
} from './crmPixAutomaticService.js';

describe('CRM5 — liquidação Pix Automático', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('findCustomerInvoiceByPixAutomaticConciliation consulta metadata e subscription', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          id: 'inv-crm-1',
          status: 'pending',
          gateway: 'asaas',
          tenant_id: 'ten-1',
        },
      ],
    } as never);

    const row = await findCustomerInvoiceByPixAutomaticConciliation('CONC_ASA');
    expect(row?.id).toBe('inv-crm-1');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('pix_automatic_conciliation_id'),
      ['CONC_ASA']
    );
  });

  it('ACTIVATED liquida fatura CRM aberta via applyPaymentEvent', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          id: 'inv-open',
          status: 'pending',
          gateway: 'asaas',
          tenant_id: 'ten-1',
          gateway_reference_id: 'pay_standalone_old',
          subscription_id: 'sub-1',
        },
      ],
    } as never);

    const r = await settleCustomerInvoiceOnPixAutomaticActivated({
      authorizationId: 'auth-1',
      paymentId: 'pay_auto_new',
      paymentStatus: 'RECEIVED',
      eventId: 'evt_1',
    });

    expect(r).toEqual({ settled: true, invoice_id: 'inv-open', detail: 'paid' });
    expect(updateCustomerInvoiceGatewayData).toHaveBeenCalledWith(
      'inv-open',
      expect.objectContaining({
        gateway_reference_id: 'pay_auto_new',
        gateway_metadata: expect.objectContaining({
          pix_automatic_authorization_id: 'auth-1',
        }),
      })
    );
    expect(applyPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'customer_invoice',
        entityId: 'inv-open',
        internalStatus: 'paid',
        paymentMethod: 'PIX',
      })
    );
    expect(deleteGatewayChargeIfSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        gatewayReferenceId: 'pay_standalone_old',
        billingType: 'crm',
      })
    );
  });

  it('ACTIVATED sem fatura aberta → no_open_customer_invoice', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    const r = await settleCustomerInvoiceOnPixAutomaticActivated({
      authorizationId: 'auth-missing',
      subscriptionId: 'sub-x',
    });
    expect(r.settled).toBe(false);
    expect(r.detail).toBe('no_open_customer_invoice');
    expect(applyPaymentEvent).not.toHaveBeenCalled();
  });
});
