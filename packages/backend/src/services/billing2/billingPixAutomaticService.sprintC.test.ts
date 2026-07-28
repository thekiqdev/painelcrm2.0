import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../modules/payments/gatewayProvider.js', () => ({
  getActiveAsaasConfigForSaas: vi.fn(async () => ({ api_key: 'k' })),
  getActiveGateway: vi.fn(),
}));

vi.mock('../../modules/gateways/asaas/client/asaasClient.js', () => ({
  cancelPixAutomaticAuthorization: vi.fn(),
  createPixAutomaticAuthorization: vi.fn(),
  getPixQrCode: vi.fn(),
}));

vi.mock('../invoiceService.js', () => ({
  getInvoiceById: vi.fn(),
  updateInvoiceGatewayData: vi.fn(),
}));

vi.mock('../paymentGatewayConfigService.js', () => ({
  getActiveConfig: vi.fn(async () => ({ gateway_key: 'asaas' })),
}));

vi.mock('../collectionPolicy/billingAuditEventWriter.js', () => ({
  writeBillingAuditEvent: vi.fn(),
}));

vi.mock('../collectionPolicy/hook.js', () => ({
  scheduleCollectionPolicyExtensionPoint: vi.fn(),
}));

vi.mock('../billingSubscriptionService.js', () => ({
  getOpenSaasSubscriptionByTenant: vi.fn(),
}));

vi.mock('../../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('./billingFeatureFlags.js', () => ({
  isBilling2FlagEnabled: vi.fn(),
}));

vi.mock('./billingPixAutomaticStore.js', () => ({
  getPixAutomaticAuthBySubscriptionId: vi.fn(),
  getPixAutomaticAuthByTenantId: vi.fn(),
  getSubscriptionByPixAuthorizationId: vi.fn(),
  updatePixAutomaticAuthStatus: vi.fn(),
  upsertPixAutomaticAuthorization: vi.fn(),
  markPixAutomaticUserOptedOut: vi.fn(),
  toPublicPixAutomaticStatus: vi.fn((row: { status: string; authorization_id: string | null } | null) => {
    if (!row) return null;
    return {
      status: row.status,
      has_active: row.status === 'active' && !!row.authorization_id,
      qr_payload: null,
      qr_image: null,
      gateway: 'asaas',
    };
  }),
  isWithinPixAutomaticInstructionWindow: vi.fn(),
  mapBillingIntervalToPixFrequency: vi.fn(() => 'MONTHLY'),
}));

import * as asaasClient from '../../modules/gateways/asaas/client/asaasClient.js';
import { getOpenSaasSubscriptionByTenant } from '../billingSubscriptionService.js';
import { getInvoiceById } from '../invoiceService.js';
import { isBilling2FlagEnabled } from './billingFeatureFlags.js';
import {
  getPixAutomaticAuthByTenantId,
  markPixAutomaticUserOptedOut,
  updatePixAutomaticAuthStatus,
} from './billingPixAutomaticStore.js';
import {
  cancelPixAutomaticAuthorizationForSubscription,
  getPixAutomaticPreferenceForTenant,
} from './billingPixAutomaticService.js';
import { pool } from '../../utils/db.js';

describe('billingPixAutomaticService Sprint C', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isBilling2FlagEnabled).mockResolvedValue(true);
    vi.mocked(getInvoiceById).mockResolvedValue(null);
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
  });

  it('getPixAutomaticPreferenceForTenant: switch_on true quando pending/active', async () => {
    vi.mocked(getPixAutomaticAuthByTenantId).mockResolvedValue({
      subscription_id: 's1',
      tenant_id: 't1',
      authorization_id: 'aut1',
      status: 'pending',
      gateway: 'asaas',
      authorized_at: null,
      cancelled_at: null,
      contract_id: 'c',
      qr_payload: 'qr',
      qr_image: null,
      conciliation_id: null,
    });

    const pref = await getPixAutomaticPreferenceForTenant('t1');
    expect(pref.available).toBe(true);
    expect(pref.switch_on).toBe(true);
    expect(pref.has_active).toBe(false);
    expect(pref.user_opted_off).toBe(false);
  });

  it('getPixAutomaticPreferenceForTenant: user_opted_off quando cleared', async () => {
    vi.mocked(getPixAutomaticAuthByTenantId).mockResolvedValue({
      subscription_id: 's1',
      tenant_id: 't1',
      authorization_id: null,
      status: 'cleared',
      gateway: 'asaas',
      authorized_at: null,
      cancelled_at: '2026-07-28',
      contract_id: null,
      qr_payload: null,
      qr_image: null,
      conciliation_id: null,
    });

    const pref = await getPixAutomaticPreferenceForTenant('t1');
    expect(pref.switch_on).toBe(false);
    expect(pref.user_opted_off).toBe(true);
    expect(pref.status).toBe('cleared');
  });

  it('cancelPixAutomaticAuthorizationForSubscription chama Asaas DELETE + status cancelled', async () => {
    vi.mocked(getPixAutomaticAuthByTenantId).mockResolvedValue({
      subscription_id: 's1',
      tenant_id: 't1',
      authorization_id: 'aut_cancel',
      status: 'active',
      gateway: 'asaas',
      authorized_at: '2026-07-01',
      cancelled_at: null,
      contract_id: 'c',
      qr_payload: null,
      qr_image: null,
      conciliation_id: null,
    });
    vi.mocked(asaasClient.cancelPixAutomaticAuthorization).mockResolvedValue(undefined as never);
    vi.mocked(updatePixAutomaticAuthStatus).mockResolvedValue(null);

    const result = await cancelPixAutomaticAuthorizationForSubscription({
      tenantId: 't1',
      reason: 'switch_off',
    });

    expect(result).toEqual({
      ok: true,
      detail: 'cancelled',
      billing_id: null,
      pix_copy_paste: null,
      pix_qr_code: null,
    });
    expect(asaasClient.cancelPixAutomaticAuthorization).toHaveBeenCalledWith(
      'aut_cancel',
      expect.anything()
    );
    expect(updatePixAutomaticAuthStatus).toHaveBeenCalledWith({
      authorizationId: 'aut_cancel',
      status: 'cancelled',
    });
  });

  it('cancel sem auth no Asaas grava cleared (opt-out local)', async () => {
    vi.mocked(getPixAutomaticAuthByTenantId).mockResolvedValue(null);
    vi.mocked(getOpenSaasSubscriptionByTenant).mockResolvedValue({ id: 's-open' } as never);
    vi.mocked(markPixAutomaticUserOptedOut).mockResolvedValue(null);

    const result = await cancelPixAutomaticAuthorizationForSubscription({ tenantId: 't1' });
    expect(result).toEqual({
      ok: true,
      detail: 'opted_out_local',
      billing_id: null,
      pix_copy_paste: null,
      pix_qr_code: null,
    });
    expect(asaasClient.cancelPixAutomaticAuthorization).not.toHaveBeenCalled();
    expect(markPixAutomaticUserOptedOut).toHaveBeenCalledWith({
      subscriptionId: 's-open',
      tenantId: 't1',
    });
  });

  it('cancel sem assinatura → missing_subscription', async () => {
    vi.mocked(getPixAutomaticAuthByTenantId).mockResolvedValue(null);
    vi.mocked(getOpenSaasSubscriptionByTenant).mockResolvedValue(null);

    const result = await cancelPixAutomaticAuthorizationForSubscription({ tenantId: 't1' });
    expect(result).toEqual({ ok: false, detail: 'missing_subscription' });
  });
});
