import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { isGatewayRegistered } from '../../payments/gatewayRegistry.js';

vi.mock('./stripeTenantFlags.js', () => ({
  isStripeTenantEnabled: vi.fn(async () => true),
}));

vi.mock('./stripeTenantCredentials.js', () => ({
  loadStripeTenantCredentials: vi.fn(),
}));

vi.mock('../../../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../../../services/customerInvoiceService.js', () => ({
  updateCustomerInvoiceStatus: vi.fn(),
}));

import { loadStripeTenantCredentials } from './stripeTenantCredentials.js';
import { pool } from '../../../utils/db.js';
import { updateCustomerInvoiceStatus } from '../../../services/customerInvoiceService.js';
import { stripeTenantWebhookHandler } from './stripeTenantWebhook.js';

function signed(payload: string, secret: string) {
  const t = String(Math.floor(Date.now() / 1000));
  const v1 = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

describe('IX5 webhook do tenant', () => {
  it('aceita a secret do tenant e marca a fatura paga', async () => {
    expect(isGatewayRegistered('stripe')).toBe(true);
    vi.mocked(loadStripeTenantCredentials).mockResolvedValue({
      secretKey: 'sk_test_tenant',
      webhookSecret: 'whsec_tenant',
      env: 'sandbox',
    });
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: 'inv-1' }] } as never);
    const payload = JSON.stringify({
      id: 'evt_t',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', mode: 'payment', payment_status: 'paid' } },
    });
    const resState = { statusCode: 0 };
    const res = {
      status(code: number) {
        resState.statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    };
    await stripeTenantWebhookHandler(
      {
        params: { tenantId: '11111111-1111-1111-1111-111111111111' },
        body: Buffer.from(payload),
        get: (name: string) => (name === 'stripe-signature' ? signed(payload, 'whsec_tenant') : undefined),
      } as never,
      res as never
    );
    expect(resState.statusCode).toBe(200);
    expect(updateCustomerInvoiceStatus).toHaveBeenCalledWith('inv-1', 'paid', expect.any(Date), 'paid');
  });

  it('rejeita a secret da plataforma', async () => {
    vi.mocked(loadStripeTenantCredentials).mockResolvedValue({
      secretKey: 'sk_test_tenant',
      webhookSecret: 'whsec_tenant',
      env: 'sandbox',
    });
    vi.mocked(updateCustomerInvoiceStatus).mockClear();
    const payload = JSON.stringify({ id: 'evt_x', type: 'checkout.session.completed' });
    const resState = { statusCode: 0 };
    await stripeTenantWebhookHandler(
      {
        params: { tenantId: '11111111-1111-1111-1111-111111111111' },
        body: Buffer.from(payload),
        get: (name: string) => (name === 'stripe-signature' ? signed(payload, 'whsec_platform') : undefined),
      } as never,
      {
        status(code: number) {
          resState.statusCode = code;
          return this;
        },
        json() {
          return this;
        },
      } as never
    );
    expect(resState.statusCode).toBe(400);
    expect(updateCustomerInvoiceStatus).not.toHaveBeenCalled();
  });
});
