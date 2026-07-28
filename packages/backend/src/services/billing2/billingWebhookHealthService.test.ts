import { describe, expect, it, vi, afterEach } from 'vitest';

vi.mock('../../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../../modules/payments/webhook/webhookCore.js', () => ({
  handleWebhook: vi.fn(),
}));

vi.mock('../collectionPolicy/billingAuditEventWriter.js', () => ({
  writeBillingAuditEvent: vi.fn(async () => ({ id: 'a1' })),
}));

vi.mock('../paymentWebhookEventsService.js', () => ({
  upsertWebhookEvent: vi.fn(async () => undefined),
}));

describe('reprocessFailedAsaasWebhook (Sprint 7)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('recusa evento que não está failed', async () => {
    const { pool } = await import('../../utils/db.js');
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ status: 'processed', event_type: 'PAYMENT_RECEIVED', payment_id: 'pay_1' }],
      rowCount: 1,
    } as never);

    const { reprocessFailedAsaasWebhook } = await import('./billingWebhookHealthService.js');
    const r = await reprocessFailedAsaasWebhook({ eventId: 'evt_1', actor: 'admin' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/failed/i);
  });

  it('recusa sem payload em payment_events', async () => {
    const { pool } = await import('../../utils/db.js');
    vi.mocked(pool.query)
      .mockResolvedValueOnce({
        rows: [{ status: 'failed', event_type: 'PAYMENT_RECEIVED', payment_id: 'pay_1' }],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const { reprocessFailedAsaasWebhook } = await import('./billingWebhookHealthService.js');
    const r = await reprocessFailedAsaasWebhook({ eventId: 'evt_2', actor: 'admin' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/payload/i);
  });
});
