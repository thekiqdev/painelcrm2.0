import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../modules/payments/gatewayProvider.js', () => ({
  getActiveGateway: vi.fn(),
}));

vi.mock('./billingLogger.js', () => ({
  billingLog: vi.fn(),
}));

vi.mock('./billing2/billingFeatureFlags.js', () => ({
  isBilling2FlagEnabled: vi.fn().mockResolvedValue(true),
}));

import { pool } from '../utils/db.js';
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import { isBilling2FlagEnabled } from './billing2/billingFeatureFlags.js';
import {
  cancelAsaasSubscriptionForLocal,
  mapBillingIntervalToGatewayCycle,
  shouldSkipSaasCardChargeForAsaasSubscription,
  syncAsaasSubscriptionFromLocalContract,
} from './saasAsaasSubscriptionSyncService.js';

const SUB_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('mapBillingIntervalToGatewayCycle', () => {
  it('mapeia intervalos conhecidos', () => {
    expect(mapBillingIntervalToGatewayCycle('monthly')).toBe('monthly');
    expect(mapBillingIntervalToGatewayCycle('yearly')).toBe('yearly');
    expect(mapBillingIntervalToGatewayCycle('quarterly')).toBe('quarterly');
    expect(mapBillingIntervalToGatewayCycle(null)).toBe('monthly');
  });
});

describe('syncAsaasSubscriptionFromLocalContract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no-op sem asaas_subscription_id', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ asaas_subscription_id: null }],
    } as never);
    const r = await syncAsaasSubscriptionFromLocalContract({ subscriptionId: SUB_ID });
    expect(r).toEqual({ synced: false, detail: 'no_asaas_subscription' });
    expect(getActiveGateway).not.toHaveBeenCalled();
  });

  it('faz PUT valor/ciclo com updatePendingPayments', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        {
          id: SUB_ID,
          tenant_id: TENANT_ID,
          amount_cents: 50000,
          billing_interval: 'monthly',
          next_billing_date: '2026-10-28',
          asaas_subscription_id: 'sub_asaas_1',
          asaas_subscription_gateway: 'asaas',
          status: 'active',
        },
      ],
    } as never);
    const updateSubscription = vi.fn().mockResolvedValue({
      subscriptionId: 'sub_asaas_1',
      status: 'ACTIVE',
    });
    vi.mocked(getActiveGateway).mockResolvedValue({ updateSubscription } as never);

    const r = await syncAsaasSubscriptionFromLocalContract({
      subscriptionId: SUB_ID,
      amountCents: 69000,
      billingInterval: 'yearly',
      reason: 'test',
    });

    expect(r).toEqual({ synced: true, detail: 'updated' });
    expect(updateSubscription).toHaveBeenCalledWith('sub_asaas_1', {
      amountCents: 69000,
      cycle: 'yearly',
      updatePendingPayments: true,
      nextDueDate: '2026-10-28',
      externalReference: TENANT_ID,
    });
  });
});

describe('cancelAsaasSubscriptionForLocal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancela no gateway e limpa vínculo local', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({
        rows: [
          {
            id: SUB_ID,
            tenant_id: TENANT_ID,
            amount_cents: 50000,
            billing_interval: 'monthly',
            next_billing_date: '2026-10-28',
            asaas_subscription_id: 'sub_asaas_1',
            asaas_subscription_gateway: 'asaas',
            status: 'active',
          },
        ],
      } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    const cancelSubscription = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getActiveGateway).mockResolvedValue({ cancelSubscription } as never);

    const r = await cancelAsaasSubscriptionForLocal({
      subscriptionId: SUB_ID,
      reason: 'cancel_immediate',
    });

    expect(r).toEqual({ cancelled: true, detail: 'cancelled' });
    expect(cancelSubscription).toHaveBeenCalledWith('sub_asaas_1');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('asaas_subscription_id = NULL'),
      [SUB_ID, TENANT_ID]
    );
  });
});

describe('shouldSkipSaasCardChargeForAsaasSubscription (CA S5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isBilling2FlagEnabled).mockResolvedValue(true);
  });

  it('não skip sem vínculo Asaas', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ asaas_subscription_id: null, asaas_subscription_gateway: null }],
    } as never);
    const r = await shouldSkipSaasCardChargeForAsaasSubscription(SUB_ID);
    expect(r.skip).toBe(false);
    expect(r.reason).toBe('no_asaas_subscription');
  });

  it('skip quando Assinatura Asaas ligada e flag ON', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ asaas_subscription_id: 'sub_asaas_1', asaas_subscription_gateway: 'asaas' }],
    } as never);
    const r = await shouldSkipSaasCardChargeForAsaasSubscription(SUB_ID);
    expect(r).toEqual({
      skip: true,
      reason: 'asaas_subscription_owns_card_renewal',
      asaasSubscriptionId: 'sub_asaas_1',
    });
  });

  it('rollback: flag OFF não skip mesmo com vínculo', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ asaas_subscription_id: 'sub_asaas_1', asaas_subscription_gateway: 'asaas' }],
    } as never);
    vi.mocked(isBilling2FlagEnabled).mockResolvedValue(false);
    const r = await shouldSkipSaasCardChargeForAsaasSubscription(SUB_ID);
    expect(r.skip).toBe(false);
    expect(r.reason).toBe('flag_asaas_subscription_owns_card_renewal_off');
    expect(r.asaasSubscriptionId).toBe('sub_asaas_1');
  });
});
