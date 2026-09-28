import { describe, expect, it } from 'vitest';
import { computeMrrWithPendingChanges } from './crmSubscriptionsPendingMrr.js';

describe('computeMrrWithPendingChanges', () => {
  it('mantém MRR igual sem pendências', () => {
    const r = computeMrrWithPendingChanges([
      { amount_cents: 9000, billing_interval: 'monthly', metadata: null },
      { amount_cents: 15000, billing_interval: 'monthly', metadata: {} },
    ]);
    expect(r.mrr_cents).toBe(24000);
    expect(r.mrr_after_pending_cents).toBe(24000);
    expect(r.mrr_pending_delta_cents).toBe(0);
  });

  it('projeta downgrade agendado', () => {
    const r = computeMrrWithPendingChanges([
      {
        amount_cents: 15000,
        billing_interval: 'monthly',
        metadata: {
          pending_crm_contract: {
            amount_cents: 9000,
            billing_interval: 'monthly',
            description: 'Plano Start',
            requested_at: '2026-06-01T00:00:00.000Z',
          },
        },
      },
    ]);
    expect(r.mrr_cents).toBe(15000);
    expect(r.mrr_after_pending_cents).toBe(9000);
    expect(r.mrr_pending_delta_cents).toBe(-6000);
  });
});
