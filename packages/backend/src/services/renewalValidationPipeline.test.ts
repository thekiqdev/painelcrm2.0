import { describe, it, expect, vi } from 'vitest';
import { validateRenewalContext } from './renewalValidationPipeline.js';
import * as customerResolution from './renewalCustomerResolution.js';
import * as gatewayConfig from './paymentGatewayConfigService.js';

describe('renewalValidationPipeline', () => {
  it('falha permanente quando customer não resolvível', async () => {
    vi.spyOn(customerResolution, 'resolveAndPersistSubscriptionCustomerId').mockResolvedValue({
      ok: false,
      reason: 'no_customer_found',
      permanent: true,
    });

    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] })
        .mockResolvedValueOnce({ rows: [] }),
    };

    const r = await validateRenewalContext(db, {
      job: { id: 'job-1', subscription_id: 'sub-1', tenant_id: 'tenant-1', cycle_key: '2026-06-24' },
      subscription: {
        id: 'sub-1',
        type: 'customer',
        tenant_id: 'tenant-1',
        customer_id: null,
        status: 'active',
        billing_interval: 'weekly',
        next_billing_date: '2026-06-24',
        current_period_start: null,
        current_period_end: null,
        amount_cents: 1000,
        plan_id: null,
        currency: 'BRL',
        billing_anchor_day: null,
        billing_cycle_count: 1,
        cancel_at_period_end: false,
        grace_period_days: 0,
        default_payment_method: null,
        users_count: null,
        gateway: null,
        last_job_at: null,
        created_by: null,
        created_at: '',
        updated_at: '',
        cycles_unlimited: true,
        max_cycles: null,
      },
      periodStartYmd: '2026-06-24',
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.stage).toBe('customer');
    expect(r.error.permanent).toBe(true);
  });

  it('sucesso com reparo de current_period_start', async () => {
    vi.spyOn(customerResolution, 'resolveAndPersistSubscriptionCustomerId').mockResolvedValue({
      ok: true,
      customer_id: 'client-1',
      resolved_via: 'subscription_field',
      persisted: false,
    });
    vi.spyOn(gatewayConfig, 'getActiveConfig').mockResolvedValue({ gateway_key: 'asaas' } as never);

    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ok: true }] })
        .mockResolvedValueOnce({ rows: [{ metadata: null }] }),
    };

    const r = await validateRenewalContext(db, {
      job: { id: 'job-1', subscription_id: 'sub-1', tenant_id: 'tenant-1', cycle_key: '2026-06-24' },
      subscription: {
        id: 'sub-1',
        type: 'customer',
        tenant_id: 'tenant-1',
        customer_id: 'client-1',
        status: 'active',
        billing_interval: 'weekly',
        next_billing_date: '2026-06-24',
        current_period_start: null,
        current_period_end: null,
        amount_cents: 1000,
        plan_id: null,
        currency: 'BRL',
        billing_anchor_day: null,
        billing_cycle_count: 1,
        cancel_at_period_end: false,
        grace_period_days: 0,
        default_payment_method: null,
        users_count: null,
        gateway: null,
        last_job_at: null,
        created_by: null,
        created_at: '',
        updated_at: '',
        cycles_unlimited: true,
        max_cycles: null,
      },
      periodStartYmd: '2026-06-24',
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.context.periodStartYmd).toBe('2026-06-24');
    expect(r.context.repairs).toContain('current_period_start_from_cycle_key');
  });
});
