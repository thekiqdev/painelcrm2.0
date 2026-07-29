import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../customerInvoiceService.js', () => ({
  getCustomerInvoiceById: vi.fn(),
  updateCustomerInvoiceGatewayData: vi.fn(),
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

import { getCustomerInvoiceById, updateCustomerInvoiceGatewayData } from '../customerInvoiceService.js';
import { finalizePixAutomaticOnCustomerInvoiceCreate } from './crmPixAutomaticService.js';

describe('finalizePixAutomaticOnCustomerInvoiceCreate (CRM2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  it('null quando não pedido', async () => {
    const r = await finalizePixAutomaticOnCustomerInvoiceCreate({
      tenantId: 'ten-1',
      invoiceId: 'inv-1',
      pixAutomaticRequested: false,
    });
    expect(r).toBeNull();
  });

  it('warning se PIX não está nos métodos permitidos', async () => {
    const r = await finalizePixAutomaticOnCustomerInvoiceCreate({
      tenantId: 'ten-1',
      invoiceId: 'inv-1',
      pixAutomaticRequested: true,
      allowedPaymentMethods: ['BOLETO'],
    });
    expect(r).toMatchObject({
      requested: true,
      started: false,
      detail: 'pix_not_in_allowed_methods',
      warning: true,
    });
    expect(updateCustomerInvoiceGatewayData).toHaveBeenCalled();
  });

  it('deferred_until_client sem client_id', async () => {
    vi.mocked(getCustomerInvoiceById).mockResolvedValue({
      id: 'inv-1',
      tenant_id: 'ten-1',
      client_id: null,
      gateway: 'asaas',
      payment_method: 'PIX',
      gateway_reference_id: null,
      gateway_status: null,
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
      detail: 'deferred_until_client',
    });
  });
});
