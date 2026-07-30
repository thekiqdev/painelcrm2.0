import { describe, expect, it } from 'vitest';
import {
  buildCyclesContractSummary,
  countEmittedSubscriptionCycles,
  subscriptionAllowsNewChargeGeneration,
} from './subscriptionCyclesContract';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';

function detail(partial: {
  cycles_unlimited?: boolean;
  max_cycles?: number | null;
  cycles_raw?: CrmSubscriptionDetailPayload['cycles_raw'];
}): Pick<CrmSubscriptionDetailPayload, 'subscription' | 'cycles_raw'> {
  return {
    subscription: {
      id: 's1',
      type: 'customer',
      tenant_id: 't1',
      customer_id: null,
      plan_id: null,
      amount_cents: 1000,
      currency: 'BRL',
      billing_anchor_day: 1,
      billing_cycle_count: 0,
      billing_interval: 'monthly',
      status: 'active',
      next_billing_date: '2026-08-01',
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      grace_period_days: 0,
      default_payment_method: null,
      users_count: null,
      gateway: null,
      last_job_at: null,
      created_by: null,
      created_at: '',
      updated_at: '',
      cycles_unlimited: partial.cycles_unlimited,
      max_cycles: partial.max_cycles,
    },
    cycles_raw: partial.cycles_raw ?? [],
  };
}

describe('subscriptionCyclesContract', () => {
  it('conta emitidos por invoice_id', () => {
    const d = detail({
      cycles_raw: [
        {
          id: '1',
          cycle_date: '2026-06-01',
          period_start: '2026-06-01',
          period_end: '2026-07-01',
          status: 'invoiced',
          invoice_id: 'inv-1',
          job_id: null,
          processed_at: null,
          skipped_reason: null,
          error_message: null,
        },
        {
          id: '2',
          cycle_date: '2026-07-01',
          period_start: '2026-07-01',
          period_end: '2026-08-01',
          status: 'pending',
          invoice_id: null,
          job_id: null,
          processed_at: null,
          skipped_reason: null,
          error_message: null,
        },
      ],
    });
    expect(countEmittedSubscriptionCycles(d)).toBe(1);
  });

  it('label finito N de M', () => {
    const s = buildCyclesContractSummary(
      detail({
        cycles_unlimited: false,
        max_cycles: 12,
        cycles_raw: [
          {
            id: '1',
            cycle_date: '2026-06-01',
            period_start: '2026-06-01',
            period_end: '2026-07-01',
            status: 'invoiced',
            invoice_id: 'a',
            job_id: null,
            processed_at: null,
            skipped_reason: null,
            error_message: null,
          },
          {
            id: '2',
            cycle_date: '2026-07-01',
            period_start: '2026-07-01',
            period_end: '2026-08-01',
            status: 'invoiced',
            invoice_id: 'b',
            job_id: null,
            processed_at: null,
            skipped_reason: null,
            error_message: null,
          },
        ],
      })
    );
    expect(s.label).toBe('2 de 12');
    expect(s.unlimited).toBe(false);
  });

  it('label ilimitado N / ∞', () => {
    const s = buildCyclesContractSummary(
      detail({
        cycles_unlimited: true,
        max_cycles: null,
        cycles_raw: [],
      })
    );
    expect(s.label).toBe('0 / ∞');
    expect(s.unlimited).toBe(true);
  });

  it('subscriptionAllowsNewChargeGeneration respeita max', () => {
    const over = detail({
      cycles_unlimited: false,
      max_cycles: 2,
      cycles_raw: [
        {
          id: '1',
          cycle_date: '2026-06-01',
          period_start: '2026-06-01',
          period_end: '2026-07-01',
          status: 'invoiced',
          invoice_id: 'a',
          job_id: null,
          processed_at: null,
          skipped_reason: null,
          error_message: null,
        },
        {
          id: '2',
          cycle_date: '2026-07-01',
          period_start: '2026-07-01',
          period_end: '2026-08-01',
          status: 'invoiced',
          invoice_id: 'b',
          job_id: null,
          processed_at: null,
          skipped_reason: null,
          error_message: null,
        },
        {
          id: '3',
          cycle_date: '2026-08-01',
          period_start: '2026-08-01',
          period_end: '2026-09-01',
          status: 'pending',
          invoice_id: null,
          job_id: null,
          processed_at: null,
          skipped_reason: null,
          error_message: null,
        },
      ],
    });
    expect(subscriptionAllowsNewChargeGeneration(over)).toBe(false);
  });
});
