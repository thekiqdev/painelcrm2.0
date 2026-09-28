import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../modules/payments/gatewayProvider.js', () => ({
  getActiveGateway: vi.fn(),
}));

vi.mock('./paymentGatewayConfigService.js', () => ({
  getConfigForTest: vi.fn(),
}));

vi.mock('../modules/payments/gatewayRegistry.js', () => ({
  buildGateway: vi.fn(),
}));

vi.mock('./billingLogger.js', () => ({
  billingLog: vi.fn(),
}));

vi.mock('./invoiceService.js', () => ({
  getInvoiceById: vi.fn(),
}));

vi.mock('./tenantBillingPaymentAttemptsService.js', () => ({
  listPendingTenantBillingAttemptsExcept: vi.fn(),
  listTenantBillingAttemptsOpenForGatewaySync: vi.fn(),
  markTenantBillingAttemptCancelledSuperseded: vi.fn(),
  hasTenantBillingPaymentAttemptsTable: vi.fn(),
}));

import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import { getInvoiceById } from './invoiceService.js';
import {
  listPendingTenantBillingAttemptsExcept,
  listTenantBillingAttemptsOpenForGatewaySync,
  markTenantBillingAttemptCancelledSuperseded,
} from './tenantBillingPaymentAttemptsService.js';
import {
  cancelOpenTenantBillingCycleChargesAfterPaid,
  isAsaasRawStatusSafeToDelete,
} from './billingGatewayChargeService.js';

const BILLING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('billingGatewayChargeService Sprint B', () => {
  const cancelPayment = vi.fn();
  const getPayment = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveGateway).mockResolvedValue({
      cancelPayment,
      getPayment,
    } as never);
    getPayment.mockResolvedValue({ status: 'PENDING' });
    cancelPayment.mockResolvedValue(undefined);
    vi.mocked(listPendingTenantBillingAttemptsExcept).mockResolvedValue([]);
    vi.mocked(listTenantBillingAttemptsOpenForGatewaySync).mockResolvedValue([]);
    vi.mocked(markTenantBillingAttemptCancelledSuperseded).mockResolvedValue(undefined as never);
    vi.mocked(getInvoiceById).mockResolvedValue({
      id: BILLING_ID,
      tenant_id: TENANT_ID,
      gateway: 'asaas',
      gateway_reference_id: 'pay_keep',
      gateway_status: 'CONFIRMED',
      status: 'paid',
    } as never);
  });

  it('isAsaasRawStatusSafeToDelete bloqueia RECEIVED/CONFIRMED', () => {
    expect(isAsaasRawStatusSafeToDelete('RECEIVED')).toBe(false);
    expect(isAsaasRawStatusSafeToDelete('CONFIRMED')).toBe(false);
    expect(isAsaasRawStatusSafeToDelete('PENDING')).toBe(true);
  });

  it('cancela ref Pix Auto extra e não cancela o payment que liquidou', async () => {
    const result = await cancelOpenTenantBillingCycleChargesAfterPaid({
      billingId: BILLING_ID,
      tenantId: TENANT_ID,
      keepGatewayReferenceId: 'pay_keep',
      paidAttemptId: 'attempt-paid',
      extraCancelReferenceIds: ['pay_pix_auto_instruction'],
      gatewayKeyFallback: 'asaas',
      gatewayStatusRawForExtras: 'PENDING',
    });

    expect(cancelPayment).toHaveBeenCalledWith('pay_pix_auto_instruction');
    expect(cancelPayment).not.toHaveBeenCalledWith('pay_keep');
    expect(result.cancelledRefs).toContain('pay_pix_auto_instruction');
  });

  it('cancela attempts irmãos abertos', async () => {
    vi.mocked(listPendingTenantBillingAttemptsExcept).mockResolvedValue([
      {
        id: 'att-sibling',
        gateway: 'asaas',
        gateway_reference_id: 'pay_sibling',
        gateway_status: 'PENDING',
      },
    ] as never);

    await cancelOpenTenantBillingCycleChargesAfterPaid({
      billingId: BILLING_ID,
      tenantId: TENANT_ID,
      keepGatewayReferenceId: 'pay_keep',
      paidAttemptId: 'attempt-paid',
    });

    expect(cancelPayment).toHaveBeenCalledWith('pay_sibling');
    expect(markTenantBillingAttemptCancelledSuperseded).toHaveBeenCalledWith(
      'att-sibling',
      expect.objectContaining({ superseded_by: 'paid_other' })
    );
  });

  it('não chama cancel de autorização Pix Automático (só cancelPayment de charges)', async () => {
    await cancelOpenTenantBillingCycleChargesAfterPaid({
      billingId: BILLING_ID,
      tenantId: TENANT_ID,
      keepGatewayReferenceId: 'pay_keep',
      extraCancelReferenceIds: ['pay_old'],
      gatewayStatusRawForExtras: 'PENDING',
    });

    const gateway = await getActiveGateway({ billingType: 'saas', tenantId: TENANT_ID });
    expect(gateway).toBeTruthy();
    expect(Object.keys(gateway as object)).not.toContain('cancelPixAutomaticAuthorization');
    expect(cancelPayment).toHaveBeenCalled();
  });
});
