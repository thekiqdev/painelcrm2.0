import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../utils/db.js';
import {
  createSubscription,
  promoteSaasTrialingSubscriptionToActive,
} from './billingSubscriptionService.js';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

function subRow(partial: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'saas',
    tenant_id: '22222222-2222-4222-8222-222222222222',
    customer_id: null,
    plan_id: '33333333-3333-4333-8333-333333333333',
    amount_cents: 9900,
    currency: 'BRL',
    billing_anchor_day: 1,
    billing_cycle_count: 0,
    billing_interval: 'monthly',
    status: 'trialing',
    next_billing_date: '2026-08-27',
    current_period_start: '2026-07-27',
    current_period_end: '2026-08-27',
    cancel_at_period_end: false,
    grace_period_days: 3,
    default_payment_method: null,
    users_count: 1,
    gateway: 'asaas',
    last_job_at: null,
    created_by: 'checkout_draft',
    created_at: '2026-07-27T00:00:00.000Z',
    updated_at: '2026-07-27T00:00:00.000Z',
    cycles_unlimited: true,
    max_cycles: null,
    contracted_at: null,
    contracted_billing_interval: null,
    contracted_plan_price_cents: null,
    contracted_price_per_user_cents: null,
    contract_currency: null,
    pricing_snapshot_source: null,
    ...partial,
  };
}

describe('billingSubscriptionService Sprint A (Pix Auto 1º pagamento)', () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it('createSubscription persiste status trialing quando informado', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [subRow({ status: 'trialing' })] } as never);

    const row = await createSubscription({
      type: 'saas',
      tenant_id: '22222222-2222-4222-8222-222222222222',
      plan_id: '33333333-3333-4333-8333-333333333333',
      amount_cents: 9900,
      billing_interval: 'monthly',
      next_billing_date: '2026-08-27',
      current_period_start: '2026-07-27',
      current_period_end: '2026-08-27',
      created_by: 'checkout_draft',
      status: 'trialing',
    });

    expect(row.status).toBe('trialing');
    const args = vi.mocked(pool.query).mock.calls[0];
    const sql = String(args[0]);
    const params = args[1] as unknown[];
    expect(sql).toMatch(/INSERT INTO subscriptions/i);
    expect(params[params.length - 1]).toBe('trialing');
  });

  it('createSubscription default status active', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [subRow({ status: 'active' })] } as never);

    await createSubscription({
      type: 'saas',
      tenant_id: '22222222-2222-4222-8222-222222222222',
      plan_id: '33333333-3333-4333-8333-333333333333',
      amount_cents: 9900,
      billing_interval: 'monthly',
      next_billing_date: '2026-08-27',
      current_period_start: '2026-07-27',
      current_period_end: '2026-08-27',
    });

    const params = vi.mocked(pool.query).mock.calls[0][1] as unknown[];
    expect(params[params.length - 1]).toBe('active');
  });

  it('promoteSaasTrialingSubscriptionToActive só atualiza rows trialing', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [subRow({ status: 'active' })],
    } as never);

    const promoted = await promoteSaasTrialingSubscriptionToActive({
      subscriptionId: '11111111-1111-4111-8111-111111111111',
      tenantId: '22222222-2222-4222-8222-222222222222',
      periodStart: '2026-07-27',
      periodEnd: '2026-08-27',
      planId: '33333333-3333-4333-8333-333333333333',
      billingInterval: 'monthly',
      amountCents: 9900,
      usersCount: 1,
    });

    expect(promoted?.status).toBe('active');
    const sql = String(vi.mocked(pool.query).mock.calls[0][0]);
    expect(sql).toMatch(/SET status = 'active'/);
    expect(sql).toMatch(/status = 'trialing'/);
  });
});
