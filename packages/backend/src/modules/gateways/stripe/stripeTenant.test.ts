import { describe, expect, it, vi } from 'vitest';
import { isGatewayRegistered } from '../../payments/gatewayRegistry.js';
import { getAvailableFinancialGatewayKeys } from '../../../config/financialAvailableGateways.js';

vi.mock('./stripeTenantFlags.js', () => ({
  isStripeTenantEnabled: vi.fn(),
}));

import { isStripeTenantEnabled } from './stripeTenantFlags.js';
import { getStripeTenantGateway } from './stripeTenantGateway.js';

describe('IX5 stripe tenant', () => {
  it('lista financeira não inclui stripe sem a flag', () => {
    expect(getAvailableFinancialGatewayKeys()).not.toContain('stripe');
    expect(getAvailableFinancialGatewayKeys({ includeStripeTenant: true })).toContain('stripe');
  });

  it('flag OFF não chama fetch', async () => {
    expect(isGatewayRegistered('stripe')).toBe(true);
    vi.mocked(isStripeTenantEnabled).mockResolvedValue(false);
    const fetchImpl = vi.fn();
    const gw = getStripeTenantGateway({ secretKey: 'sk_test_tenant', fetchImpl });
    await expect(
      gw.createCharge({
        customerId: 'cus_1',
        amountCents: 1900,
        dueDate: '2026-10-01',
        paymentMethod: 'CREDIT_CARD',
        description: 'Fatura',
        currency: 'USD',
      })
    ).rejects.toThrow(/desligada/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('flag ON cobra com a secret do tenant em mode=payment', async () => {
    vi.mocked(isStripeTenantEnabled).mockResolvedValue(true);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }),
    });
    const gw = getStripeTenantGateway({ secretKey: 'sk_test_tenant_only', fetchImpl });
    const charge = await gw.createCharge({
      customerId: 'local',
      amountCents: 2500,
      dueDate: '2026-10-01',
      paymentMethod: 'CREDIT_CARD',
      description: 'Fatura USD',
      currency: 'USD',
    });
    expect(charge.paymentId).toBe('cs_test_1');
    expect(charge.invoiceUrl).toContain('checkout.stripe.com');
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(String((init.headers as Record<string, string>).Authorization)).toBe('Bearer sk_test_tenant_only');
    const body = String(init.body);
    expect(body).toContain('mode=payment');
    expect(body).not.toContain('mode=subscription');
    expect(decodeURIComponent(body)).toContain('currency]=usd');
  });

  it('PIX no adapter do tenant não chama a Stripe', async () => {
    vi.mocked(isStripeTenantEnabled).mockResolvedValue(true);
    const fetchImpl = vi.fn();
    const gw = getStripeTenantGateway({ secretKey: 'sk_test_tenant', fetchImpl });
    await expect(
      gw.createCharge({
        customerId: 'cus_1',
        amountCents: 1000,
        dueDate: '2026-10-01',
        paymentMethod: 'PIX',
        description: 'Pix',
      })
    ).rejects.toThrow(/Asaas/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
