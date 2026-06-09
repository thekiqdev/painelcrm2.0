import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../utils/db.js';
import { getInvoiceById, updateInvoiceStatus } from '../services/invoiceService.js';
import { activatePlanFromBilling } from '../services/subscriptionService.js';
import { schedulePublishPlatformBillingPaymentConfirmed } from '../services/platformNotifications/platformBusinessNotifications.js';
import {
  isZeroAmountCents,
  settleZeroAmountBilling,
  trySettleZeroAmountBillingIfEligible,
} from './zeroAmountSettlementService.js';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('./tenantCommercialOverrideRepository.js', () => ({
  findActiveCommercialOverrideCandidates: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/invoiceService.js', () => ({
  getInvoiceById: vi.fn(),
  updateInvoiceStatus: vi.fn(),
}));

vi.mock('../services/subscriptionService.js', () => ({
  activatePlanFromBilling: vi.fn(),
}));

vi.mock('../services/platformNotifications/platformBusinessNotifications.js', () => ({
  schedulePublishPlatformBillingPaymentConfirmed: vi.fn(),
}));

const BILLING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function mockBilling(overrides: Partial<{
  status: string;
  amount_cents: number;
}> = {}) {
  return {
    id: BILLING_ID,
    tenant_id: TENANT_ID,
    plan_id: '22222222-2222-4222-8222-222222222222',
    billing_interval: 'monthly',
    amount_cents: 0,
    status: 'pending',
    gateway_metadata: null,
    ...overrides,
  };
}

describe('zeroAmountSettlementService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      if (s.includes('activated_billing_id')) {
        return { rows: [{ activated_billing_id: null }] } as never;
      }
      if (s.includes('gateway_metadata')) {
        return { rowCount: 1, rows: [] } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    });
  });

  it('isZeroAmountCents', () => {
    expect(isZeroAmountCents(0)).toBe(true);
    expect(isZeroAmountCents(1)).toBe(false);
  });

  it('cenário A — billing já paid retorna already_paid sem ativar', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(mockBilling({ status: 'paid' }) as never);
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const result = await settleZeroAmountBilling({ billingId: BILLING_ID, source: 'checkout' });

    expect(result).toEqual({
      billingId: BILLING_ID,
      tenantId: TENANT_ID,
      settled: false,
      reason: 'already_paid',
      activated: false,
    });
    expect(updateInvoiceStatus).not.toHaveBeenCalled();
    expect(activatePlanFromBilling).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      '[zero_amount_settlement_skip]',
      expect.objectContaining({ billingId: BILLING_ID, reason: 'already_paid' }),
    );
    logSpy.mockRestore();
  });

  it('cenário B — activated_billing_id já aponta para billing retorna already_activated', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(mockBilling() as never);
    vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      if (s.includes('activated_billing_id')) {
        return { rows: [{ activated_billing_id: BILLING_ID }] } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    });
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const result = await settleZeroAmountBilling({ billingId: BILLING_ID, source: 'renewal' });

    expect(result).toEqual({
      billingId: BILLING_ID,
      tenantId: TENANT_ID,
      settled: false,
      reason: 'already_activated',
      activated: false,
    });
    expect(updateInvoiceStatus).not.toHaveBeenCalled();
    expect(activatePlanFromBilling).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      '[zero_amount_settlement_skip]',
      expect.objectContaining({ billingId: BILLING_ID, reason: 'already_activated' }),
    );
    logSpy.mockRestore();
  });

  it('cenário C — retry múltiplo executa activatePlanFromBilling uma única vez', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(mockBilling() as never);
    vi.mocked(updateInvoiceStatus).mockResolvedValue(undefined);
    vi.mocked(activatePlanFromBilling).mockResolvedValue(undefined);

    const first = await settleZeroAmountBilling({ billingId: BILLING_ID, source: 'checkout' });
    expect(first.settled).toBe(true);
    expect(first.activated).toBe(true);
    expect(activatePlanFromBilling).toHaveBeenCalledTimes(1);

    vi.mocked(getInvoiceById).mockResolvedValue(mockBilling({ status: 'paid' }) as never);
    const second = await settleZeroAmountBilling({ billingId: BILLING_ID, source: 'checkout' });
    expect(second.reason).toBe('already_paid');
    expect(activatePlanFromBilling).toHaveBeenCalledTimes(1);
  });

  it('trySettleZeroAmountBillingIfEligible ignora valor não zero', async () => {
    const result = await trySettleZeroAmountBillingIfEligible({
      billingId: BILLING_ID,
      amountCents: 9900,
      source: 'manual_charge',
    });
    expect(result).toBeNull();
    expect(getInvoiceById).not.toHaveBeenCalled();
  });

  it('liquidação bem-sucedida marca paid e notifica', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(mockBilling() as never);
    vi.mocked(updateInvoiceStatus).mockResolvedValue(undefined);
    vi.mocked(activatePlanFromBilling).mockResolvedValue(undefined);

    await settleZeroAmountBilling({ billingId: BILLING_ID, source: 'waive_reactivation' });

    expect(updateInvoiceStatus).toHaveBeenCalledWith(
      BILLING_ID,
      'paid',
      expect.any(Date),
      'ZERO_AMOUNT',
      'zero_amount_settled',
    );
    expect(schedulePublishPlatformBillingPaymentConfirmed).toHaveBeenCalledWith(BILLING_ID);
    expect(activatePlanFromBilling).toHaveBeenCalledWith(BILLING_ID);
  });
});
