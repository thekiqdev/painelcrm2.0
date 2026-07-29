import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  toPublicPixAutomaticStatus: vi.fn(),
}));

vi.mock('../billing2/billingPixAutomaticStore.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../billing2/billingPixAutomaticStore.js')>();
  return {
    ...actual,
    isWithinPixAutomaticInstructionWindow: vi.fn(() => true),
  };
});

vi.mock('../../modules/payments/gatewayProvider.js', () => ({
  getActiveGateway: vi.fn(),
  getActiveAsaasConfigForCrm: vi.fn(),
}));

vi.mock('../paymentGatewayConfigService.js', () => ({
  getActiveConfig: vi.fn(async () => ({ gateway_key: 'asaas' })),
}));

vi.mock('../collectionPolicy/billingAuditEventWriter.js', () => ({
  writeBillingAuditEvent: vi.fn(async () => undefined),
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

import { getCustomerInvoiceById, updateCustomerInvoiceGatewayData } from '../customerInvoiceService.js';
import { isCrmPixAutomaticEnabled, canOfferCrmPixAutomatic } from './crmPixAutomaticFlags.js';
import { getCrmPixAutomaticAuthBySubscriptionId } from './crmPixAutomaticStore.js';
import { isWithinPixAutomaticInstructionWindow } from '../billing2/billingPixAutomaticStore.js';
import { getActiveGateway } from '../../modules/payments/gatewayProvider.js';
import { writeBillingAuditEvent } from '../collectionPolicy/billingAuditEventWriter.js';
import { createPixAutomaticInstructionForCustomerInvoice } from './crmPixAutomaticService.js';

const baseInvoice = {
  id: 'inv-1',
  tenant_id: 'ten-1',
  client_id: 'cli-1',
  subscription_id: 'sub-1',
  gateway: 'asaas',
  payment_method: 'PIX',
  gateway_reference_id: null as string | null,
  gateway_status: null,
  gateway_metadata: {},
  idempotency_key: null,
  amount_cents: 9900,
  due_date: '2099-01-15',
  status: 'pending',
  invoice_number: 'CINV-1',
};

describe('createPixAutomaticInstructionForCustomerInvoice (CRM4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isCrmPixAutomaticEnabled).mockResolvedValue(true);
    vi.mocked(canOfferCrmPixAutomatic).mockResolvedValue({
      available: true,
      flag_enabled: true,
      gateway_supports: true,
      reason: 'ok',
    });
    vi.mocked(isWithinPixAutomaticInstructionWindow).mockReturnValue(true);
    vi.mocked(getCustomerInvoiceById).mockResolvedValue({ ...baseInvoice } as never);
    vi.mocked(getCrmPixAutomaticAuthBySubscriptionId).mockResolvedValue({
      subscription_id: 'sub-1',
      tenant_id: 'ten-1',
      authorization_id: 'auth-active-1',
      status: 'active',
      qr_payload: null,
      qr_image: null,
      conciliation_id: null,
      raw: null,
    } as never);
    vi.mocked(getActiveGateway).mockResolvedValue({
      createCharge: vi.fn(async () => ({
        paymentId: 'pay_instr_1',
        status: 'PENDING',
        pixCopyPaste: 'copia',
        pixQrCode: 'data:image/png;base64,x',
      })),
    } as never);
  });

  it('flag OFF → flag_crm_pix_automatic_off', async () => {
    vi.mocked(isCrmPixAutomaticEnabled).mockResolvedValue(false);
    const r = await createPixAutomaticInstructionForCustomerInvoice({ invoiceId: 'inv-1' });
    expect(r).toEqual({ ok: false, detail: 'flag_crm_pix_automatic_off' });
  });

  it('auth não active → auth_not_active', async () => {
    vi.mocked(getCrmPixAutomaticAuthBySubscriptionId).mockResolvedValue({
      authorization_id: 'auth-1',
      status: 'pending',
    } as never);
    const r = await createPixAutomaticInstructionForCustomerInvoice({ invoiceId: 'inv-1' });
    expect(r).toEqual({ ok: false, detail: 'auth_not_active' });
  });

  it('fora da janela → outside_instruction_window', async () => {
    vi.mocked(isWithinPixAutomaticInstructionWindow).mockReturnValue(false);
    const r = await createPixAutomaticInstructionForCustomerInvoice({ invoiceId: 'inv-1' });
    expect(r).toEqual({ ok: false, detail: 'outside_instruction_window' });
  });

  it('happy path: createCharge com pixAutomaticAuthorizationId + audit', async () => {
    const createCharge = vi.fn(async () => ({
      paymentId: 'pay_instr_1',
      status: 'PENDING',
      pixCopyPaste: 'copia',
      pixQrCode: null,
    }));
    vi.mocked(getActiveGateway).mockResolvedValue({ createCharge } as never);

    const r = await createPixAutomaticInstructionForCustomerInvoice({
      invoiceId: 'inv-1',
      tenantId: 'ten-1',
      customerId: 'cus_asaas_1',
      correlationId: 'crm_renew:sub-1:2099-01-01',
    });

    expect(r).toEqual({ ok: true, payment_id: 'pay_instr_1' });
    expect(createCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: 'PIX',
        pixAutomaticAuthorizationId: 'auth-active-1',
        customerId: 'cus_asaas_1',
        amountCents: 9900,
      })
    );
    expect(updateCustomerInvoiceGatewayData).toHaveBeenCalledWith(
      'inv-1',
      expect.objectContaining({
        gateway_reference_id: 'pay_instr_1',
        payment_method: 'PIX',
        gateway_metadata: expect.objectContaining({
          pix_automatic_authorization_id: 'auth-active-1',
          pix_automatic_journey: 'instruction',
        }),
      })
    );
    expect(writeBillingAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'crm_pix_automatic',
        action: 'pix_automatic.instruction_created',
        entity_type: 'customer_invoice',
        entity_id: 'inv-1',
        origin: 'crm',
      })
    );
  });

  it('idempotente se já há gateway_reference com mesmo auth', async () => {
    vi.mocked(getCustomerInvoiceById).mockResolvedValue({
      ...baseInvoice,
      gateway_reference_id: 'pay_existing',
      gateway_metadata: { pix_automatic_authorization_id: 'auth-active-1' },
    } as never);
    const createCharge = vi.fn();
    vi.mocked(getActiveGateway).mockResolvedValue({ createCharge } as never);

    const r = await createPixAutomaticInstructionForCustomerInvoice({
      invoiceId: 'inv-1',
      customerId: 'cus_1',
    });
    expect(r).toEqual({ ok: true, payment_id: 'pay_existing' });
    expect(createCharge).not.toHaveBeenCalled();
  });
});
