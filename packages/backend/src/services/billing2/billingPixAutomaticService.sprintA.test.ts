import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureSaasSubscriptionLinkedToOpenBilling = vi.fn();

vi.mock('../invoiceService.js', () => ({
  getInvoiceById: vi.fn(),
  updateInvoiceGatewayData: vi.fn(),
}));

vi.mock('./billingFeatureFlags.js', () => ({
  isBilling2FlagEnabled: vi.fn(),
}));

vi.mock('../../modules/payments/gatewayCapabilities.js', () => ({
  gatewaySupports: vi.fn(() => true),
}));

vi.mock('../paymentGatewayConfigService.js', () => ({
  getActiveConfig: vi.fn(async () => ({ gateway_key: 'asaas' })),
}));

vi.mock('../subscriptionService.js', () => ({
  ensureSaasSubscriptionLinkedToOpenBilling: (...args: unknown[]) =>
    ensureSaasSubscriptionLinkedToOpenBilling(...args),
}));

vi.mock('../../modules/payments/gatewayProvider.js', () => ({
  getActiveGateway: vi.fn(),
  getActiveAsaasConfigForSaas: vi.fn(),
}));

vi.mock('../../modules/gateways/asaas/client/asaasClient.js', () => ({
  createPixAutomaticAuthorization: vi.fn(),
}));

vi.mock('./billingPixAutomaticStore.js', () => ({
  getPixAutomaticAuthBySubscriptionId: vi.fn(),
  upsertPixAutomaticAuthorization: vi.fn(),
  mapBillingIntervalToPixFrequency: vi.fn(() => 'MONTHLY'),
}));

vi.mock('../../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

import { getInvoiceById, updateInvoiceGatewayData } from '../invoiceService.js';
import { isBilling2FlagEnabled } from './billingFeatureFlags.js';
import { getActiveGateway, getActiveAsaasConfigForSaas } from '../../modules/payments/gatewayProvider.js';
import * as asaasClient from '../../modules/gateways/asaas/client/asaasClient.js';
import {
  getPixAutomaticAuthBySubscriptionId,
  upsertPixAutomaticAuthorization,
} from './billingPixAutomaticStore.js';
import { pool } from '../../utils/db.js';
import { startPixAutomaticAuthorizationForBilling } from './billingPixAutomaticService.js';

const BILLING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUB_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TENANT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function openInvoice(partial: Record<string, unknown> = {}) {
  return {
    id: BILLING_ID,
    tenant_id: TENANT_ID,
    subscription_id: null as string | null,
    status: 'pending',
    amount_cents: 9900,
    due_date: '2026-08-03',
    invoice_number: 'INV-1',
    gateway_reference_id: null,
    ...partial,
  };
}

describe('startPixAutomaticAuthorizationForBilling Sprint A', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isBilling2FlagEnabled).mockResolvedValue(true);
    vi.mocked(getActiveGateway).mockResolvedValue({
      ensureCustomer: vi.fn(async () => 'cus_1'),
    } as never);
    vi.mocked(getActiveAsaasConfigForSaas).mockResolvedValue({ apiKey: 'k' } as never);
    vi.mocked(getPixAutomaticAuthBySubscriptionId).mockResolvedValue(null);
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ billing_interval: 'monthly' }] } as never);
    vi.mocked(asaasClient.createPixAutomaticAuthorization).mockResolvedValue({
      id: 'aut_1',
      status: 'PENDING',
      immediateQrCode: { payload: 'pix-copy', encodedImage: 'img' },
      conciliationIdentifier: 'conc_1',
    } as never);
    vi.mocked(upsertPixAutomaticAuthorization).mockResolvedValue(undefined as never);
    vi.mocked(updateInvoiceGatewayData).mockResolvedValue(undefined as never);
  });

  it('sem subscription_id: chama ensure e segue (não retorna missing_subscription_id)', async () => {
    vi.mocked(getInvoiceById)
      .mockResolvedValueOnce(openInvoice() as never)
      .mockResolvedValueOnce(openInvoice() as never)
      .mockResolvedValueOnce(openInvoice({ subscription_id: SUB_ID }) as never);

    ensureSaasSubscriptionLinkedToOpenBilling.mockResolvedValue({
      subscriptionId: SUB_ID,
      created: true,
    });

    const result = await startPixAutomaticAuthorizationForBilling({ billingId: BILLING_ID });

    expect(ensureSaasSubscriptionLinkedToOpenBilling).toHaveBeenCalledWith(BILLING_ID);
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        authorization_id: 'aut_1',
        status: 'pending',
      })
    );
    expect(result).not.toEqual(expect.objectContaining({ detail: 'missing_subscription_id' }));
  });

  it('ensure falha → missing_subscription_id', async () => {
    vi.mocked(getInvoiceById)
      .mockResolvedValueOnce(openInvoice() as never)
      .mockResolvedValueOnce(openInvoice() as never);
    ensureSaasSubscriptionLinkedToOpenBilling.mockResolvedValue(null);

    const result = await startPixAutomaticAuthorizationForBilling({ billingId: BILLING_ID });

    expect(result).toEqual({ ok: false, detail: 'missing_subscription_id' });
  });
});
