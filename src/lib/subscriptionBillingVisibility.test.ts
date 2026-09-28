import { describe, it, expect } from 'vitest';
import { createFinancialEventStore, financialEventStoreSignature } from './subscriptionFinancialEventStore';
import { buildBillingAggregateFromDetail } from './billingAggregate';
import { buildHistoryRowsFromAggregate } from './billingCutover/adapters/historyAdapter';
import { buildUiCapabilitiesFromAggregate } from './billingCutover/adapters/uiCapabilitiesAdapter';
import { invoiceVisibilityFromCycle, cycleNeedsInvariantRepair } from './resolvedCompetencyPresentation';
import { cyclesRawFromTimeline } from './testHelpers/subscriptionCyclesFixture';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';

const today = '2026-07-03';

function timelineRow(overrides: Partial<CrmSubscriptionTimelineRow> = {}): CrmSubscriptionTimelineRow {
  return {
    month_ref: '2026-07',
    cycle_label: 'Jul/26',
    cycle_subtitle: '',
    cycle_date: '2026-07-30',
    period_label: 'Jul/26',
    period_start: '2026-07-30',
    period_end: '2026-08-06',
    due_date: '2026-07-30',
    status_pt: 'Aguardando',
    operational_state: 'awaiting_generation',
    operational_state_pt: 'Aguardando geração',
    amount_cents: 11000,
    invoice_id: null,
    cycle_status: 'pending',
    cycle_id: 'c-jul',
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
      billing_anchor_day: 30,
      billing_cycle_count: 1,
      billing_interval: 'weekly',
      status: 'active',
      next_billing_date: '2026-08-06',
      current_period_start: '2026-07-30',
      current_period_end: '2026-08-06',
      cancel_at_period_end: false,
      grace_period_days: 0,
      default_payment_method: null,
      users_count: null,
      gateway: 'mercadopago',
      last_job_at: null,
      created_by: null,
      created_at: '2026-01-30T10:00:00Z',
      updated_at: '2026-07-03T10:00:00Z',
      cycles_unlimited: true,
      max_cycles: null,
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
      next_generation_ymd: '2026-07-30',
      next_charge_ymd: '2026-08-06',
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

describe('Sprint 5.0-23F — invoice visibility certification', () => {
  it('invoiceVisibilityFromCycle: invoice_id null → Gerar; com invoice → Abrir', () => {
    expect(invoiceVisibilityFromCycle(null, 'active')).toEqual({
      canGenerate: true,
      canOpen: false,
    });
    expect(invoiceVisibilityFromCycle('inv-1', 'active')).toEqual({
      canGenerate: false,
      canOpen: true,
    });
    expect(invoiceVisibilityFromCycle(null, 'cancelled')).toEqual({
      canGenerate: false,
      canOpen: false,
    });
  });

  it('BUG 1 — invoice apagada (pending, invoice_id null) exibe Gerar no histórico', () => {
    const d = detail({
      timeline: [
        timelineRow({
          invoice_id: null,
          cycle_status: 'pending',
          operational_state: 'awaiting_generation',
        }),
      ],
      cycles_raw: [
        {
          id: 'c-jul',
          subscription_id: 'sub-1',
          cycle_date: '2026-07-30',
          period_start: '2026-07-30',
          period_end: '2026-08-06',
          status: 'pending',
          invoice_id: null,
          job_id: null,
          processed_at: null,
          created_at: '2026-07-01T00:00:00Z',
          updated_at: '2026-07-03T00:00:00Z',
        },
      ],
    });
    const aggregate = buildBillingAggregateFromDetail(d, today);
    const caps = buildUiCapabilitiesFromAggregate(aggregate);
    const rows = buildHistoryRowsFromAggregate(aggregate, caps);
    const jul = rows.find((r) => r.cycleId === 'c-jul');
    expect(jul?.invoiceId).toBeNull();
    expect(jul?.canGenerateNow).toBe(true);
    expect(jul?.canOpenNow).toBe(false);
  });

  it('cycleNeedsInvariantRepair detecta invoiced sem invoice_id', () => {
    expect(cycleNeedsInvariantRepair('invoiced', null)).toBe(true);
    expect(cycleNeedsInvariantRepair('invoiced', 'inv-1')).toBe(false);
    expect(cycleNeedsInvariantRepair('pending', null)).toBe(false);
  });

  it('Sprint 24D — invoiced sem invoice_id exibe repair, não Gerar', () => {
    const d = detail({
      cycles_raw: [
        {
          id: 'c-jul',
          subscription_id: 'sub-1',
          cycle_date: '2026-07-30',
          period_start: '2026-07-30',
          period_end: '2026-08-06',
          status: 'invoiced',
          invoice_id: null,
          job_id: null,
          processed_at: null,
          created_at: '2026-07-01T00:00:00Z',
          updated_at: '2026-07-03T00:00:00Z',
        },
      ],
    });
    const aggregate = buildBillingAggregateFromDetail(d, today);
    const caps = buildUiCapabilitiesFromAggregate(aggregate);
    const rows = buildHistoryRowsFromAggregate(aggregate, caps);
    const jul = rows.find((r) => r.cycleId === 'c-jul');
    expect(jul?.needsInvariantRepair).toBe(true);
    expect(jul?.canGenerateNow).toBe(false);
    expect(jul?.canOpenNow).toBe(false);
  });

  it('BUG 2 — store signature muda quando cycles_raw ganha nova competência', () => {
    const before = detail();
    const after = detail({
      cycles_raw: [
        ...(before.cycles_raw ?? []),
        {
          id: 'c-aug',
          subscription_id: 'sub-1',
          cycle_date: '2026-08-06',
          period_start: '2026-08-06',
          period_end: '2026-08-13',
          status: 'pending',
          invoice_id: null,
          job_id: null,
          processed_at: null,
          created_at: '2026-07-03T00:00:00Z',
          updated_at: '2026-07-03T00:00:00Z',
        },
      ],
      subscription: { ...before.subscription, next_billing_date: '2026-08-06' },
    });
    expect(financialEventStoreSignature(before)).not.toBe(financialEventStoreSignature(after));
    const store = createFinancialEventStore(after, today);
    expect(store.getNextChargePresentation().cycleId).toBeTruthy();
  });

  it('BUG 2 — próxima competência materializada aparece no aggregate nextInvoice', () => {
    const d = detail({
      timeline: [
        timelineRow({
          cycle_id: 'c-jul',
          invoice_id: 'inv-jul',
          cycle_status: 'invoiced',
          operational_state: 'generated',
        }),
        timelineRow({
          cycle_id: 'c-aug',
          cycle_date: '2026-08-06',
          due_date: '2026-08-06',
          period_start: '2026-08-06',
          period_end: '2026-08-13',
          invoice_id: null,
          cycle_status: 'pending',
          operational_state: 'awaiting_generation',
        }),
      ],
      cycles_raw: [
        {
          id: 'c-jul',
          subscription_id: 'sub-1',
          cycle_date: '2026-07-30',
          period_start: '2026-07-30',
          period_end: '2026-08-06',
          status: 'invoiced',
          invoice_id: 'inv-jul',
          job_id: null,
          processed_at: '2026-07-03T00:00:00Z',
          created_at: '2026-07-01T00:00:00Z',
          updated_at: '2026-07-03T00:00:00Z',
        },
        {
          id: 'c-aug',
          subscription_id: 'sub-1',
          cycle_date: '2026-08-06',
          period_start: '2026-08-06',
          period_end: '2026-08-13',
          status: 'pending',
          invoice_id: null,
          job_id: null,
          processed_at: null,
          created_at: '2026-07-03T00:00:00Z',
          updated_at: '2026-07-03T00:00:00Z',
        },
      ],
    });
    const aggregate = buildBillingAggregateFromDetail(d, today);
    expect(aggregate.nextInvoice?.cycleId).toBe('c-aug');
    expect(aggregate.nextInvoice?.metadata.invoiceId).toBeNull();
    const store = createFinancialEventStore(d, today);
    const next = store.getNextChargePresentation();
    expect(next.cycleId).toBe('c-aug');
    expect(store.resolveCyclePresentation('c-aug', 'NEXT_CARD').canGenerate).toBe(true);
  });
});
