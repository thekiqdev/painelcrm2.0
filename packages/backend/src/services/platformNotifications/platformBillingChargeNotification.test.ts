import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../../utils/db.js';
import { getInvoiceById } from '../invoiceService.js';
import { publishPlatformBillingChargeCreated } from './platformBusinessNotifications.js';
import {
  ensureBillingChargeNotificationExists,
  listBillingChargeCreatedDeliveryChannels,
  PLATFORM_BILLING_CHARGE_CREATED_EVENT,
} from './platformBillingChargeNotification.js';

vi.mock('../../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../invoiceService.js', () => ({
  getInvoiceById: vi.fn(),
}));

vi.mock('./platformBusinessNotifications.js', () => ({
  publishPlatformBillingChargeCreated: vi.fn(),
}));

const BILLING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function mockBilling(overrides: Record<string, unknown> = {}) {
  return {
    id: BILLING_ID,
    tenant_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    amount_cents: 4900,
    status: 'pending',
    gateway_metadata: null,
    billing_reason: 'plan_renewal',
    ...overrides,
  };
}

describe('platformBillingChargeNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listBillingChargeCreatedDeliveryChannels detecta whatsapp e email', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ channel: 'whatsapp' }, { channel: 'email' }],
    } as never);

    const channels = await listBillingChargeCreatedDeliveryChannels(BILLING_ID);

    expect(channels).toEqual({ whatsapp: true, email: true });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('platform_notification_deliveries'),
      [BILLING_ID, PLATFORM_BILLING_CHARGE_CREATED_EVENT],
    );
  });

  it('ensureBillingChargeNotificationExists não republica quando ambos canais existem', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(mockBilling() as never);
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ channel: 'whatsapp' }, { channel: 'email' }],
    } as never);

    const result = await ensureBillingChargeNotificationExists(BILLING_ID);

    expect(result.republished).toBe(false);
    expect(result.reason).toBe('already_complete');
    expect(publishPlatformBillingChargeCreated).not.toHaveBeenCalled();
  });

  it('ensureBillingChargeNotificationExists republica quando deliveries ausentes', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(mockBilling() as never);
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({
        rows: [{ channel: 'whatsapp' }, { channel: 'email' }],
      } as never);
    vi.mocked(publishPlatformBillingChargeCreated).mockResolvedValue(undefined);

    const result = await ensureBillingChargeNotificationExists(BILLING_ID);

    expect(result.republished).toBe(true);
    expect(result.reason).toBe('republished');
    expect(publishPlatformBillingChargeCreated).toHaveBeenCalledTimes(1);
    expect(publishPlatformBillingChargeCreated).toHaveBeenCalledWith(BILLING_ID);
    expect(result.channels).toEqual({ whatsapp: true, email: true });
  });

  it('ensureBillingChargeNotificationExists pula fatura zero amount liquidada', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(
      mockBilling({
        amount_cents: 0,
        status: 'paid',
        gateway_metadata: { settlement_source: 'zero_amount' },
      }) as never,
    );

    const result = await ensureBillingChargeNotificationExists(BILLING_ID);

    expect(result.republished).toBe(false);
    expect(result.reason).toBe('zero_amount_skip');
    expect(publishPlatformBillingChargeCreated).not.toHaveBeenCalled();
  });
});

describe('renewal invoice → publishPlatformBillingChargeCreated → deliveries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fluxo de renovação: publish cria deliveries whatsapp e email (integração mockada)', async () => {
    const deliveryState: { channel: string }[] = [];

    vi.mocked(getInvoiceById).mockResolvedValue(mockBilling() as never);
    vi.mocked(publishPlatformBillingChargeCreated).mockImplementation(async () => {
      deliveryState.push({ channel: 'whatsapp' }, { channel: 'email' });
    });
    vi.mocked(pool.query).mockImplementation(async () => {
      return { rows: [...deliveryState] } as never;
    });

    const first = await ensureBillingChargeNotificationExists(BILLING_ID);
    expect(first.republished).toBe(true);
    expect(publishPlatformBillingChargeCreated).toHaveBeenCalledTimes(1);

    const second = await ensureBillingChargeNotificationExists(BILLING_ID);
    expect(second.republished).toBe(false);
    expect(second.reason).toBe('already_complete');
    expect(publishPlatformBillingChargeCreated).toHaveBeenCalledTimes(1);
    expect(second.channels).toEqual({ whatsapp: true, email: true });
  });
});
