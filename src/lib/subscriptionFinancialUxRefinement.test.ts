import { describe, it, expect } from 'vitest';
import type { FinancialEvent } from './financialEventTypes';
import { pickCalendarPopoverEvent } from './financialEventHelpers';
import { resolveInvoiceCapabilities } from './invoiceCapabilities';
import { isProjectedFinancialEvent } from './subscriptionFinancialProjection';
import { createFinancialEventStore } from './subscriptionFinancialEventStore';
import { cyclesRawFromTimeline } from './testHelpers/subscriptionCyclesFixture';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';

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
      next_billing_date: '2026-08-01',
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
      next_charge_ymd: '2026-08-01',
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

describe('Sprint 4.2I — Financial UX Refinement', () => {
  it('pickCalendarPopoverEvent prioriza ciclo real com cycle_id', () => {
    const real: FinancialEvent = {
      id: 'real-1',
      kind: 'real',
      type: 'upcoming_cycle',
      ymd: '2026-07-14',
      dueYmd: '2026-07-14',
      amountCents: 11000,
      competence: 'Jul',
      invoiceId: null,
      cycleId: 'c1',
      statusLabel: 'Prevista',
      statusBadge: 'pending',
      gateway: null,
      notes: null,
      paidAt: null,
      clientName: null,
      lastUpdatedAt: null,
      cycleKey: 'c1',
    };
    const projected: FinancialEvent = {
      ...real,
      id: 'proj-1',
      kind: 'projected',
      cycleId: null,
      ymd: '2026-08-01',
      dueYmd: '2026-08-01',
      cycleKey: 'projected:2026-08-01',
    };
    const picked = pickCalendarPopoverEvent([projected, real]);
    expect(picked?.cycleId).toBe('c1');
    expect(isProjectedFinancialEvent(picked!)).toBe(false);
  });

  it('supportsGenerate true apenas com cycle_id em evento real', () => {
    const withCycle = resolveInvoiceCapabilities({
      eventType: 'upcoming_cycle',
      cycleId: 'c1',
    });
    const projected = resolveInvoiceCapabilities({
      eventType: 'upcoming_cycle',
      cycleId: null,
    });
    expect(withCycle.supportsGenerate).toBe(true);
    expect(projected.supportsGenerate).toBe(false);
  });

  it('calendário mantém todas as projeções', () => {
    const store = createFinancialEventStore(detail({ cycles_raw: [], timeline: [] }), today);
    expect(store.getCalendarEvents().filter((e) => e.isProjected).length).toBeGreaterThan(1);
  });

  it('histórico e Next Invoice alinham na próxima cobrança destacada', () => {
    const store = createFinancialEventStore(
      detail({
        timeline: [
          timelineRow({ cycle_id: 'c1', due_date: '2026-07-14' }),
          timelineRow({ cycle_id: 'c2', due_date: '2026-08-01', cycle_date: '2026-08-01' }),
        ],
      }),
      today
    );
    const presentation = store.getNextChargePresentation();
    const historyNext = store.getHistoryRows().find((r) => r.isNextCharge);
    expect(presentation.dueYmd).toBe(historyNext?.dueYmd);
    expect(presentation.cycleId).toBe(historyNext?.cycleId);
    const allGenerate = store.getHistoryRows().filter((r) => r.canGenerateNow);
    expect(allGenerate.length).toBeGreaterThanOrEqual(2);
  });
});
