import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { billingIntervalToStripeRecurring } from './stripeRecurring.js';
import { verifyStripeWebhookSignature } from './stripeWebhookSignature.js';
import { getStripeSaasSkeletonGateway, StripeSaasSkeletonError } from './stripeSaasSkeleton.js';
import { isGatewayRegistered } from '../../payments/gatewayRegistry.js';

vi.mock('../../../services/billing2/billingFeatureFlags.js', () => ({
  isBilling2FlagEnabled: vi.fn(),
}));

import { isBilling2FlagEnabled } from '../../../services/billing2/billingFeatureFlags.js';
import { getStripeSaasGateway } from './stripeSaasGateway.js';

describe('IX4 stripe platform', () => {
  it('mapeia intervalos para recorrência Stripe', () => {
    expect(billingIntervalToStripeRecurring('monthly')).toEqual({ interval: 'month', interval_count: 1 });
    expect(billingIntervalToStripeRecurring('quarterly').interval_count).toBe(3);
    expect(billingIntervalToStripeRecurring('yearly').interval).toBe('year');
  });

  it('aceita assinatura de webhook e rejeita secret errado', () => {
    const payload = '{"id":"evt_1"}';
    const secret = 'whsec_test';
    const t = '1700000000';
    const v1 = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
    expect(
      verifyStripeWebhookSignature({
        payload,
        header: `t=${t},v1=${v1}`,
        secret,
        nowSec: 1700000000,
      })
    ).toBe(true);
    expect(
      verifyStripeWebhookSignature({
        payload,
        header: `t=${t},v1=${v1}`,
        secret: 'whsec_other',
        nowSec: 1700000000,
      })
    ).toBe(false);
  });

  it('parser lê invoice.paid sem HTTP', async () => {
    expect(isGatewayRegistered('stripe')).toBe(true);
    const { parseStripeSaasWebhookPayload } = await import('./stripeWebhookParser.js');
    const parsed = parseStripeSaasWebhookPayload({
      id: 'evt_1',
      type: 'invoice.paid',
      data: { object: { id: 'in_1', status: 'paid', metadata: { billing_id: 'b1' } } },
    });
    expect(parsed.eventId).toBe('evt_1');
    expect(parsed.referenceId).toBe('in_1');
    expect(parsed.externalStatus).toBe('paid');
    expect(parsed.metadata).toEqual({ billing_id: 'b1' });
  });

  it('skeleton continua sem HTTP', async () => {
    const fetchImpl = vi.fn();
    const gw = getStripeSaasSkeletonGateway({ api_key: 'sk_test' });
    await expect(
      gw!.createCustomer({ name: 'A', email: 'a@example.com' })
    ).rejects.toBeInstanceOf(StripeSaasSkeletonError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('flag OFF no adapter real não chama fetch', async () => {
    vi.mocked(isBilling2FlagEnabled).mockResolvedValue(false);
    const fetchImpl = vi.fn();
    const gw = getStripeSaasGateway({ api_key: 'sk_test_123', fetchImpl });
    await expect(
      gw.createCustomer({ name: 'A', email: 'a@example.com' })
    ).rejects.toBeInstanceOf(StripeSaasSkeletonError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('flag ON cria customer via HTTP', async () => {
    vi.mocked(isBilling2FlagEnabled).mockResolvedValue(true);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'cus_123' }),
    });
    const gw = getStripeSaasGateway({ api_key: 'sk_test_123', fetchImpl });
    const created = await gw.createCustomer({ name: 'Acme', email: 'a@example.com' });
    expect(created.customerId).toBe('cus_123');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toBe('https://api.stripe.com/v1/customers');
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(String((init.headers as Record<string, string>).Authorization)).toBe('Bearer sk_test_123');
    expect(String(init.body)).toContain('email=a%40example.com');
  });
});
