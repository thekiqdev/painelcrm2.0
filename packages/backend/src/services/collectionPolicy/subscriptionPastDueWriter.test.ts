import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  markSubscriptionPastDue,
  clearSubscriptionPastDueOnPaid,
  syncSaasSubscriptionsPastDue,
} from './subscriptionPastDueWriter.js';

vi.mock('../../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../billing2/billingFeatureFlags.js', () => ({
  isBilling2FlagEnabled: vi.fn(),
}));

vi.mock('./reader.js', () => ({
  getActiveCollectionPolicy: vi.fn(async () => ({
    policy: { grace_period_days: 3 },
    source: 'memory_default',
    legacy_auto_suspend_setting: false,
  })),
}));

vi.mock('./billingAuditEventWriter.js', () => ({
  writeBillingAuditEvent: vi.fn(async () => ({ id: 'audit-1' })),
}));

describe('subscriptionPastDueWriter (Sprint 5)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('não marca past_due com flag OFF', async () => {
    const { isBilling2FlagEnabled } = await import('../billing2/billingFeatureFlags.js');
    vi.mocked(isBilling2FlagEnabled).mockResolvedValue(false);
    const r = await markSubscriptionPastDue({ subscriptionId: 's1' });
    expect(r.status).toBe('skipped');
    expect(r.detail).toBe('flag_past_due_writer_off');
  });

  it('marca active → past_due quando elegível e flag ON', async () => {
    const { isBilling2FlagEnabled } = await import('../billing2/billingFeatureFlags.js');
    const { pool } = await import('../../utils/db.js');
    vi.mocked(isBilling2FlagEnabled).mockResolvedValue(true);
    vi.mocked(pool.query)
      // resolveEffectiveGraceDays
      .mockResolvedValueOnce({ rows: [{ grace_period_days: 3 }], rowCount: 1 } as never)
      // isSubscriptionPastDueEligible
      .mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1 } as never)
      // UPDATE
      .mockResolvedValueOnce({ rows: [{ id: 's1', status: 'past_due' }], rowCount: 1 } as never);

    const r = await markSubscriptionPastDue({ subscriptionId: 's1' });
    expect(r.status).toBe('ok');
    expect(r.detail).toBe('subscription_past_due');
  });

  it('limpa past_due → active no paid', async () => {
    const { pool } = await import('../../utils/db.js');
    vi.mocked(pool.query)
      .mockResolvedValueOnce({
        rows: [{ id: 's1', status: 'past_due', tenant_id: 't1', type: 'saas' }],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never) // no other active
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never); // update

    const r = await clearSubscriptionPastDueOnPaid({ subscriptionId: 's1', billingId: 'b1' });
    expect(r.status).toBe('ok');
    expect(r.detail).toBe('past_due_cleared_to_active');
  });

  it('sync batch é no-op com flag OFF', async () => {
    const { isBilling2FlagEnabled } = await import('../billing2/billingFeatureFlags.js');
    vi.mocked(isBilling2FlagEnabled).mockResolvedValue(false);
    const r = await syncSaasSubscriptionsPastDue({});
    expect(r.scanned).toBe(0);
    expect(r.marked).toBe(0);
  });
});
