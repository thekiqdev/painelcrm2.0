import { describe, it, expect } from 'vitest';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';
import { resolveNextInvoiceExperience } from './subscriptionNextInvoice';
import {
  getNextAwaitingGenerationCycle,
  hasFutureCyclesWithoutInvoice,
  resolveNextInvoiceCandidate,
} from './subscriptionNextInvoiceResolver';
import { cyclesRawFromTimeline } from './testHelpers/subscriptionCyclesFixture';

const today = '2026-06-30';

function timelineRow(overrides: Partial<CrmSubscriptionTimelineRow> = {}): CrmSubscriptionTimelineRow {
  return {
    month_ref: '2026-07',
    cycle_label: 'Jul/26',
    cycle_subtitle: '',
    cycle_date: '2026-07-14',
    period_label: 'Jul/26',
    period_start: '2026-07-14',
    period_end: '2026-07-21',
    due_date: '2026-07-14',
    status_pt: 'Aguardando',
    operational_state: 'awaiting_generation',
    operational_state_pt: 'Aguardando geração',
    amount_cents: 11000,
    invoice_id: null,
    cycle_status: 'pending',
    cycle_id: 'c1',
    job_id: null,
    ...overrides,
  };
}

function detail(overrides: Partial<CrmSubscriptionDetailPayload> = {}): CrmSubscriptionDetailPayload {
  const timeline = overrides.timeline ?? [timelineRow()];
  const cycles_raw =
    overrides.cycles_raw !== undefined ? overrides.cycles_raw : cyclesRawFromTimeline(timeline);
  return {
    subscription: {
      id: 'sub-1',
      type: 'crm',
      tenant_id: 't1',
      customer_id: 'c1',
      plan_id: 'plan-1',
      amount_cents: 11000,
      currency: 'BRL',
      billing_anchor_day: 14,
      billing_cycle_count: 2,
      billing_interval: 'weekly',
      status: 'active',
      next_billing_date: '2026-07-14',
      current_period_start: '2026-07-14',
      current_period_end: '2026-07-21',
      cancel_at_period_end: false,
      grace_period_days: 0,
      default_payment_method: null,
      users_count: null,
      gateway: 'mercadopago',
      last_job_at: null,
      created_by: null,
      created_at: '2026-01-30T10:00:00Z',
      updated_at: '2026-06-30T10:00:00Z',
      cycles_unlimited: true,
      max_cycles: null,
      ...overrides.subscription,
    },
    client_name: 'Cliente',
    plan_label: 'Semanal',
    latest_invoice_id: null,
    latest_invoice_status: null,
    latest_paid_invoice_id: null,
    stats: {
      total_invoiced_cents: 0,
      total_paid_cents: 0,
      total_pending_cents: 0,
      charge_count: 0,
    },
    timeline,
    automation_summary: {
      last_generation_at: null,
      last_generation_label: null,
      next_generation_ymd: '2026-07-14',
      next_charge_ymd: '2026-07-14',
    },
    cycles_raw,
    cycles_read_enabled: cycles_raw.length > 0,
    tenant_billing: {
      recurring_invoice_generate_days_before_due: 0,
      recurring_generate_time_local: '08:00',
      timezone: 'America/Sao_Paulo',
    },
    recent_jobs: [],
    meta: { periodicity_label_pt: 'Semanal' },
    ...overrides,
  };
}

function simulateConsecutiveGenerations(count: number): void {
  let due = '2026-07-14';
  let timeline: CrmSubscriptionTimelineRow[] = [];
  let cycles_raw = detail().cycles_raw;

  for (let i = 0; i < count; i += 1) {
    const d = detail({ timeline, cycles_raw });
    const before = resolveNextInvoiceCandidate(d, today);
    expect(before?.hasInvoice).toBe(false);
    expect(before?.dueYmd).toBe(due);

    timeline = [
      timelineRow({
        due_date: due,
        cycle_date: due,
        cycle_id: `c-${i}`,
        invoice_id: `inv-${i}`,
        operational_state: 'generated',
        invoice_status: 'pending',
      }),
      timelineRow({
        due_date: '2026-07-21',
        cycle_date: '2026-07-21',
        cycle_id: `c-next-${i}`,
      }),
    ];
    cycles_raw = cyclesRawFromTimeline(timeline);
    due = '2026-07-21';
    const after = resolveNextInvoiceCandidate(detail({ timeline, cycles_raw }), today);
    expect(after?.hasInvoice).toBe(false);
    expect(after?.dueYmd).toBe(due);
  }
}

describe('getNextAwaitingGenerationCycle', () => {
  it('picks first cycle without invoice sorted by date', () => {
    const row = getNextAwaitingGenerationCycle(
      detail({
        timeline: [
          timelineRow({ due_date: '2026-07-14', cycle_id: 'c1' }),
          timelineRow({ due_date: '2026-08-01', cycle_date: '2026-08-01', cycle_id: 'c2' }),
        ],
      }),
      today
    );
    expect(row?.due_date).toBe('2026-07-14');
  });

  it('skips invoiced cycle and promotes next from cycles_raw', () => {
    const row = getNextAwaitingGenerationCycle(
      detail({
        timeline: [
          timelineRow({
            due_date: '2026-07-14',
            cycle_id: 'c1',
            invoice_id: 'inv-1',
            operational_state: 'generated',
          }),
          timelineRow({ due_date: '2026-07-21', cycle_date: '2026-07-21', cycle_id: 'c2' }),
        ],
      }),
      today
    );
    expect(row?.due_date).toBe('2026-07-21');
    expect(row?.invoice_id).toBeNull();
  });

  it('returns null when no uninvoiced cycle exists in cycles_raw', () => {
    const row = getNextAwaitingGenerationCycle(
      detail({
        timeline: [
          timelineRow({
            due_date: '2026-07-14',
            cycle_id: 'c1',
            invoice_id: 'inv-1',
            operational_state: 'generated',
          }),
        ],
        cycles_raw: [
          {
            id: 'c1',
            cycle_date: '2026-07-14',
            period_start: '2026-07-14',
            period_end: '2026-07-21',
            status: 'generated',
            invoice_id: 'inv-1',
            job_id: null,
            processed_at: null,
            skipped_reason: null,
            error_message: null,
          },
        ],
      }),
      today
    );
    expect(row).toBeNull();
  });
});

describe('infinite pipeline — consecutive generations', () => {
  it.each([1, 2, 5])('after %i generations next competency advances via cycles_raw', (n) => {
    simulateConsecutiveGenerations(n);
  });

  it('hasFutureCyclesWithoutInvoice while subscription active', () => {
    expect(hasFutureCyclesWithoutInvoice(detail(), today)).toBe(true);
  });
});

describe('resolveNextInvoiceExperience integration', () => {
  it('after invoice promotes to next pending competency in cycles_raw', () => {
    const after = resolveNextInvoiceExperience(
      detail({
        timeline: [
          timelineRow({
            cycle_id: 'c1',
            invoice_id: 'inv-1',
            operational_state: 'generated',
            due_date: '2026-07-14',
          }),
          timelineRow({ cycle_id: 'c2', due_date: '2026-07-21', cycle_date: '2026-07-21' }),
        ],
      }),
      today
    );
    expect(after.hasInvoice).toBe(false);
    expect(after.action).toBe('generate');
    expect(after.actionLabel).toBe('Gerar cobrança');
    expect(after.dueYmd).toBe('2026-07-21');
    expect(after.cycleId).toBe('c2');
  });
});
