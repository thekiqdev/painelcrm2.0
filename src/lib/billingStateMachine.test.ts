import { describe, it, expect } from 'vitest';
import {
  resolveBillingCycleState,
  canEmitFinancialEventType,
  normalizeBillingDate,
  normalizeDetailForBillingStateMachine,
} from './billingStateMachine';
import { buildFinancialEvents } from './subscriptionFinancialEventBuilder';
import { cyclesRawFromTimeline } from './testHelpers/subscriptionCyclesFixture';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';

const today = '2026-07-01';

function row(partial: Partial<CrmSubscriptionTimelineRow>): CrmSubscriptionTimelineRow {
  return {
    month_ref: 'Jul/2026',
    cycle_label: 'Ciclo',
    cycle_subtitle: 'Jul/2026',
    cycle_date: '2026-07-15',
    period_label: '—',
    period_start: '2026-07-01',
    period_end: '2026-07-31',
    due_date: '2026-07-15',
    status_pt: 'Cancelado',
    operational_state: 'cancelled',
    operational_state_pt: 'Cancelado',
    amount_cents: 10000,
    invoice_id: null,
    cycle_status: 'cancelled',
    cycle_id: 'c1',
    job_id: null,
    merge_source: 'cycle',
    ...partial,
  };
}

function detail(timeline: CrmSubscriptionTimelineRow[]): CrmSubscriptionDetailPayload {
  return {
    subscription: {
      id: 'sub-1',
      tenant_id: 't1',
      customer_id: 'client-1',
      type: 'customer',
      status: 'active',
      amount_cents: 10000,
      billing_interval: 'monthly',
      next_billing_date: '2026-07-15',
      gateway: null,
      cancel_at_period_end: false,
      cycles_unlimited: true,
      max_cycles: null,
      current_period_start: null,
      current_period_end: null,
      created_at: '',
      updated_at: '',
    },
    client_name: 'Cliente',
    plan_label: 'Plano',
    latest_invoice_id: null,
    latest_invoice_status: null,
    latest_paid_invoice_id: null,
    stats: { total_invoiced_cents: 0, total_paid_cents: 0, total_pending_cents: 0, charge_count: 0 },
    timeline,
    automation_summary: {
      last_generation_at: null,
      last_generation_label: null,
      next_generation_ymd: null,
      next_charge_ymd: '2026-07-15',
      worker_status_pt: '—',
      last_worker_check_at: null,
    },
    cycles_raw: cyclesRawFromTimeline(timeline),
    cycles_read_enabled: true,
    tenant_billing: {
      timezone: 'America/Sao_Paulo',
      recurring_generate_time_local: null,
      invoice_notify_same_as_generation: null,
      invoice_notify_time_local: null,
    },
    recent_jobs: [],
    pending_contract: null,
    meta: { periodicity_label_pt: 'Mensal' },
  };
}

describe('billingStateMachine — Sprint 4.2C', () => {
  it('cycle skipped recoverable vira Prevista', () => {
    const resolved = resolveBillingCycleState({
      cycleStatus: 'skipped',
      invoiceId: null,
      skippedReason: 'completed_no_invoice_no_eligible_items',
      subscriptionStatus: 'active',
      dueYmd: '2026-08-15',
      todayYmd: today,
    });
    expect(resolved.state).toBe('awaiting_generation');
    expect(resolved.label).toBe('Prevista');
    expect(resolved.canGenerate).toBe(true);
  });

  it('cycle pending sem invoice vira Prevista', () => {
    const resolved = resolveBillingCycleState({
      cycleStatus: 'pending',
      invoiceId: null,
      subscriptionStatus: 'active',
      dueYmd: '2026-08-01',
      todayYmd: today,
    });
    expect(resolved.state).toBe('awaiting_generation');
  });

  it('invoice cancelada verdadeira continua Cancelada', () => {
    const resolved = resolveBillingCycleState({
      cycleStatus: 'invoiced',
      invoiceId: 'inv-1',
      invoiceStatus: 'cancelled',
      subscriptionStatus: 'active',
      dueYmd: '2026-07-15',
      todayYmd: today,
    });
    expect(resolved.state).toBe('cancelled');
  });

  it('proíbe invoice_cancelled sem invoice', () => {
    expect(canEmitFinancialEventType('invoice_cancelled', null)).toBe(false);
    expect(canEmitFinancialEventType('invoice_cancelled', 'inv-1')).toBe(true);
  });

  it('sem invoice não emite invoice_cancelled nos eventos', () => {
    const events = buildFinancialEvents(detail([row({})]), today);
    expect(events.some((e) => e.type === 'invoice_cancelled')).toBe(false);
    expect(events.some((e) => e.type === 'upcoming_cycle')).toBe(true);
  });

  it('rejeita NaN-NaN-NaN', () => {
    expect(normalizeBillingDate('NaN-NaN-NaN')).toBeNull();
    expect(normalizeBillingDate(undefined)).toBeNull();
  });

  it('normaliza detail com ciclo cancelled legado', () => {
    const normalized = normalizeDetailForBillingStateMachine(detail([row({})]), today);
    expect(normalized.timeline[0]?.operational_state).toBe('awaiting_generation');
  });
});
