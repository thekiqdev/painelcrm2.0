import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as subscriptionCyclePlanner from './subscriptionCyclePlanner.js';
import * as billingSubscriptionService from './billingSubscriptionService.js';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  withBillingWorkerRlsBypass: (fn: () => Promise<unknown>) => fn(),
}));

describe('Sprint 5.0-23E — post-manual materialize next competency', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('materializePlannedCycles recebe next_billing_date após generate (contrato ADR-002)', async () => {
    const materializeSpy = vi.spyOn(subscriptionCyclePlanner, 'materializePlannedCycles').mockResolvedValue();
    vi.spyOn(billingSubscriptionService, 'getSubscriptionById').mockResolvedValue({
      id: 'sub-weekly',
      tenant_id: 't1',
      next_billing_date: '2026-08-06',
      billing_interval: 'weekly',
      status: 'active',
    } as Awaited<ReturnType<typeof billingSubscriptionService.getSubscriptionById>>);

    const { pool } = await import('../utils/db.js');
    await subscriptionCyclePlanner.materializePlannedCycles(pool, {
      tenantId: 't1',
      subscriptionId: 'sub-weekly',
      plans: [{ cycleDateYmd: '2026-08-06', source: 'manual_generate' }],
    });

    expect(materializeSpy).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        plans: [{ cycleDateYmd: '2026-08-06', source: 'manual_generate' }],
      })
    );
  });
});
