import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('./invoiceService.js', () => ({
  updateInvoiceGatewayData: vi.fn().mockResolvedValue(undefined),
  updateInvoiceStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./subscriptionService.js', () => ({
  activatePlanFromBilling: vi.fn().mockResolvedValue(undefined),
  ensureSaasSubscriptionLinkedToOpenBilling: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./tenantBillingPaymentAttemptsService.js', () => ({
  updateTenantBillingPaymentAttemptStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./billingLogger.js', () => ({
  billingLog: vi.fn(),
}));

vi.mock('./billingGatewayChargeService.js', () => ({
  cancelOpenTenantBillingCycleChargesAfterPaid: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./platformNotifications/platformBusinessNotifications.js', () => ({
  schedulePublishPlatformBillingPaymentConfirmed: vi.fn(),
}));

vi.mock('./billing2/billingCardTokenStore.js', () => ({
  upsertSaasCardToken: vi.fn().mockResolvedValue(undefined),
  cardTokenAuditSafe: vi.fn(() => 'tok_***'),
  getActiveSaasCardTokenBySubscriptionId: vi.fn(),
  getActiveSaasCardTokenByTenantId: vi.fn(),
}));

vi.mock('./collectionPolicy/billingAuditEventWriter.js', () => ({
  writeBillingAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { pool } from '../utils/db.js';
import { updateInvoiceGatewayData, updateInvoiceStatus } from './invoiceService.js';
import { activatePlanFromBilling } from './subscriptionService.js';
import { cancelOpenTenantBillingCycleChargesAfterPaid } from './billingGatewayChargeService.js';
import type { PaymentGateway } from '../modules/payments/paymentGatewayTypes.js';
import type { TenantBillingRow } from './invoiceService.js';
import {
  executeSaasCardCheckoutViaAsaasSubscription,
  shouldUseAsaasSubscriptionForSaasCardCheckout,
} from './saasAsaasSubscriptionCheckoutService.js';

const BILLING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LOCAL_SUB_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function baseBilling(over: Partial<TenantBillingRow> = {}): TenantBillingRow {
  return {
    id: BILLING_ID,
    tenant_id: TENANT_ID,
    plan_id: 'plan-1',
    amount_cents: 50000,
    status: 'pending',
    billing_reason: 'plan_purchase',
    billing_interval: 'monthly',
    subscription_id: LOCAL_SUB_ID,
    gateway_metadata: {},
    invoice_number: 'INV-1',
    gateway_reference_id: 'pay_orphan_1',
    idempotency_key: null,
    payment_method: 'CREDIT_CARD',
    ...over,
  } as TenantBillingRow;
}

describe('shouldUseAsaasSubscriptionForSaasCardCheckout', () => {
  it('liga contratação, upgrade e cobrança manual', () => {
    expect(shouldUseAsaasSubscriptionForSaasCardCheckout({ billing_reason: 'plan_purchase' })).toBe(
      true
    );
    expect(shouldUseAsaasSubscriptionForSaasCardCheckout({ billing_reason: 'plan_upgrade' })).toBe(
      true
    );
    expect(shouldUseAsaasSubscriptionForSaasCardCheckout({ billing_reason: 'manual_charge' })).toBe(
      true
    );
  });

  it('não liga renovação / addons (ficam no fluxo avulso até S3/S5)', () => {
    expect(shouldUseAsaasSubscriptionForSaasCardCheckout({ billing_reason: 'plan_renewal' })).toBe(
      false
    );
    expect(shouldUseAsaasSubscriptionForSaasCardCheckout({ billing_reason: 'seat_addon' })).toBe(
      false
    );
  });
});

describe('executeSaasCardCheckoutViaAsaasSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: LOCAL_SUB_ID }], rowCount: 1 } as never);
  });

  it('cria Assinatura Asaas, persiste asaas_subscription_id e ativa no 1º pago', async () => {
    const createSubscription = vi.fn().mockResolvedValue({
      subscriptionId: 'sub_asaas_1',
      creditCardToken: 'tok_abc',
      cardBrand: 'VISA',
      cardLast4: '4242',
      status: 'ACTIVE',
    });
    const listSubscriptionPayments = vi.fn().mockResolvedValue([
      { paymentId: 'pay_first_1', status: 'CONFIRMED', paidAt: '2026-09-28' },
    ]);
    const ensureCustomer = vi.fn().mockResolvedValue('cus_1');
    const cancelPayment = vi.fn().mockResolvedValue(undefined);

    const gateway = {
      ensureCustomer,
      createSubscription,
      listSubscriptionPayments,
      cancelPayment,
    } as unknown as PaymentGateway;

    const result = await executeSaasCardCheckoutViaAsaasSubscription({
      billing: baseBilling(),
      billingId: BILLING_ID,
      gateway,
      gatewayKey: 'asaas',
      body: {
        idempotency_key: 'idem-ca-s2-1',
        credit_card: {
          holder_name: 'Teste User',
          number: '4111111111111111',
          expiry_month: '12',
          expiry_year: '2030',
          cvv: '123',
        },
        cardholder: {
          name: 'Teste User',
          email: 't@example.com',
          cpf_cnpj: '52998224725',
          postal_code: '01310100',
          address_number: '100',
          phone: '11999999999',
        },
      },
      remoteIp: '203.0.113.10',
      attempt: null,
      billingMeta: {},
      orphanPaymentId: 'pay_orphan_1',
    });

    expect(createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cus_1',
        amountCents: 50000,
        cycle: 'monthly',
        remoteIp: '203.0.113.10',
        externalReference: BILLING_ID,
      })
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('asaas_subscription_id'),
      expect.arrayContaining(['sub_asaas_1', 'asaas', LOCAL_SUB_ID, TENANT_ID])
    );
    expect(updateInvoiceGatewayData).toHaveBeenCalledWith(
      BILLING_ID,
      expect.objectContaining({
        gateway_reference_id: 'pay_first_1',
        gateway_metadata: expect.objectContaining({
          asaas_subscription_id: 'sub_asaas_1',
          card_capture_channel: 'asaas_subscription',
        }),
      })
    );
    expect(updateInvoiceStatus).toHaveBeenCalledWith(
      BILLING_ID,
      'paid',
      expect.any(Date),
      'CREDIT_CARD',
      'CONFIRMED'
    );
    expect(activatePlanFromBilling).toHaveBeenCalledWith(BILLING_ID);
    expect(cancelOpenTenantBillingCycleChargesAfterPaid).toHaveBeenCalledWith(
      expect.objectContaining({
        keepGatewayReferenceId: 'pay_first_1',
        extraCancelReferenceIds: ['pay_orphan_1'],
      })
    );
    expect(result).toMatchObject({
      ok: true,
      billing_status: 'paid',
      asaas_subscription_id: 'sub_asaas_1',
    });
    expect(cancelPayment).not.toHaveBeenCalled();
  });

  it('exige remoteIp', async () => {
    const gateway = {
      ensureCustomer: vi.fn(),
      createSubscription: vi.fn(),
    } as unknown as PaymentGateway;

    await expect(
      executeSaasCardCheckoutViaAsaasSubscription({
        billing: baseBilling(),
        billingId: BILLING_ID,
        gateway,
        gatewayKey: 'asaas',
        body: { idempotency_key: 'idem-x' },
        remoteIp: '  ',
        attempt: null,
        billingMeta: {},
        orphanPaymentId: null,
      })
    ).rejects.toMatchObject({ code: 'validation_error', statusCode: 400 });
  });
});
