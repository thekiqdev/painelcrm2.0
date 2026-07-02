import { describe, it, expect } from 'vitest';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';
import { buildFinancialInsights } from './financialInsightsEngine';
import { buildFinancialEvents } from './subscriptionFinancialEventBuilder';
import { createFinancialEventStore } from './subscriptionFinancialEventStore';

const today = '2026-06-30';

function row(overrides: Partial<CrmSubscriptionTimelineRow> = {}): CrmSubscriptionTimelineRow {
  return {
    month_ref: '2026-07',
    cycle_label: 'Jul/26',
    cycle_subtitle: '',
    cycle_date: '2026-07-14',
    period_label: 'Jul/26',
    period_start: '2026-07-07',
    period_end: '2026-08-07',
    due_date: '2026-07-14',
    status_pt: 'Aguardando',
    operational_state: 'generated',
    operational_state_pt: 'Gerada',
    amount_cents: 11000,
    invoice_id: 'inv-1',
    invoice_status: 'pending',
    gateway_status: null,
    gateway_reference_id: null,
    cycle_status: 'generated',
    cycle_id: 'c1',
    job_id: null,
    ...overrides,
  };
}

function detail(overrides: Partial<CrmSubscriptionDetailPayload> = {}): CrmSubscriptionDetailPayload {
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
      next_billing_date: '2026-07-21',
      current_period_start: '2026-07-07',
      current_period_end: '2026-07-14',
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
    client_name: 'Cliente Teste',
    plan_label: 'Plano Semanal',
    latest_invoice_id: 'inv-1',
    latest_invoice_status: 'pending',
    latest_paid_invoice_id: 'inv-paid',
    stats: {
      total_received_cents: 22000,
      open_amount_cents: 11000,
      charge_count: 2,
      paid_count: 2,
    },
    timeline: [
      row({
        due_date: '2026-06-23',
        invoice_id: 'inv-paid-1',
        invoice_status: 'paid',
        operational_state: 'paid',
        status_pt: 'Pago',
      }),
      row({
        due_date: '2026-06-30',
        invoice_id: 'inv-paid-2',
        invoice_status: 'paid',
        operational_state: 'paid',
        status_pt: 'Pago',
      }),
      row({ due_date: '2026-07-14', invoice_id: 'inv-1', invoice_status: 'pending' }),
      row({
        due_date: '2026-07-21',
        operational_state: 'forecast',
        invoice_id: null,
        status_pt: 'Previsto',
      }),
    ],
    pending_contract: null,
    tenant_billing: {
      recurring_generate_time_local: '09:00',
      timezone: 'America/Sao_Paulo',
      recurring_invoice_generate_days_before_due: 7,
    },
    ...overrides,
  };
}

describe('buildFinancialInsights', () => {
  it('includes never-late when no overdue', () => {
    const events = buildFinancialEvents(detail(), today);
    const insights = buildFinancialInsights(events, detail(), today);
    expect(insights.some((i) => i.id === 'never-late')).toBe(true);
    expect(insights.find((i) => i.id === 'never-late')?.text).toContain('nunca atrasou');
  });

  it('includes 90-day forecast when upcoming exists', () => {
    const events = buildFinancialEvents(detail(), today);
    const insights = buildFinancialInsights(events, detail(), today);
    const f = insights.find((i) => i.id === 'forecast-90');
    expect(f).toBeTruthy();
    expect(f?.text).toContain('90 dias');
    expect(f?.text).toMatch(/R\$/);
  });

  it('includes active months from created_at', () => {
    const events = buildFinancialEvents(detail(), today);
    const insights = buildFinancialInsights(events, detail(), today);
    expect(insights.some((i) => i.id === 'active-months')).toBe(true);
    expect(insights.find((i) => i.id === 'active-months')?.text).toMatch(/ativo há \d+ m/);
  });

  it('last payment today', () => {
    const d = detail({
      timeline: [
        row({
          due_date: today,
          invoice_status: 'paid',
          operational_state: 'paid',
          status_pt: 'Pago',
        }),
      ],
    });
    const events = buildFinancialEvents(d, today);
    const insights = buildFinancialInsights(events, d, today);
    expect(insights.some((i) => i.id === 'last-pay-today')).toBe(true);
  });

  it('last payment days ago', () => {
    const d = detail({
      timeline: [
        row({
          due_date: '2026-06-23',
          invoice_status: 'paid',
          operational_state: 'paid',
          status_pt: 'Pago',
        }),
      ],
    });
    const events = buildFinancialEvents(d, today);
    const insights = buildFinancialInsights(events, d, today);
    expect(insights.some((i) => i.id === 'last-pay-days')).toBe(true);
    expect(insights.find((i) => i.id === 'last-pay-days')?.text).toMatch(/há \d+ dia/);
  });

  it('failures insight when failed rows exist', () => {
    const d = detail({
      timeline: [
        row({ operational_state: 'failed', invoice_id: null, due_date: '2026-07-01' }),
        row({ due_date: '2026-07-14', invoice_id: 'inv-1' }),
      ],
    });
    const events = buildFinancialEvents(d, today);
    const insights = buildFinancialInsights(events, d, today);
    expect(insights.some((i) => i.id === 'failures')).toBe(true);
  });

  it('on-time payer insight', () => {
    const events = buildFinancialEvents(detail(), today);
    const insights = buildFinancialInsights(events, detail(), today);
    expect(insights.some((i) => i.id === 'on-time')).toBe(true);
    expect(insights.find((i) => i.id === 'on-time')?.text).toContain('no prazo');
  });

  it('still builds insights when cancelled', () => {
    const d = detail({ subscription: { status: 'cancelled' } as CrmSubscriptionDetailPayload['subscription'] });
    const events = buildFinancialEvents(d, today);
    const insights = buildFinancialInsights(events, d, today);
    expect(insights.length).toBeGreaterThan(0);
  });

  it('store getInsights uses engine', () => {
    const store = createFinancialEventStore(detail(), today);
    const insights = store.getInsights();
    expect(insights.length).toBeGreaterThan(0);
    expect(insights.some((i) => i.text.includes('90 dias') || i.text.includes('nunca atrasou'))).toBe(true);
  });

  it('insights have ids and icons', () => {
    const events = buildFinancialEvents(detail(), today);
    buildFinancialInsights(events, detail(), today).forEach((ins) => {
      expect(ins.id).toBeTruthy();
      expect(ins.icon).toBeTruthy();
      expect(ins.text.length).toBeGreaterThan(10);
    });
  });

  it('avoids generic recurring phrase', () => {
    const events = buildFinancialEvents(detail(), today);
    const texts = buildFinancialInsights(events, detail(), today).map((i) => i.text);
    expect(texts.some((t) => t.includes('recorrente'))).toBe(false);
  });
});

describe('forecastNext90Days via insights', () => {
  it('sums upcoming within window', () => {
    const d = detail({
      timeline: [
        row({ due_date: '2026-07-14', operational_state: 'forecast', invoice_id: null }),
        row({ due_date: '2026-08-14', operational_state: 'forecast', invoice_id: null }),
        row({ due_date: '2026-12-14', operational_state: 'forecast', invoice_id: null }),
      ],
    });
    const events = buildFinancialEvents(d, today);
    const f = buildFinancialInsights(events, d, today).find((i) => i.id === 'forecast-90');
    expect(f?.text).toBeTruthy();
  });
});

describe('edge cases', () => {
  it('empty timeline still returns active months', () => {
    const d = detail({ timeline: [] });
    const insights = buildFinancialInsights([], d, today);
    expect(insights.some((i) => i.id === 'active-months')).toBe(true);
  });

  it('overdue suppresses never-late', () => {
    const d = detail({
      timeline: [
        row({ due_date: '2026-06-01', invoice_status: 'pending', invoice_id: 'inv-o' }),
        row({ due_date: '2026-06-15', invoice_status: 'paid', operational_state: 'paid' }),
      ],
    });
    const events = buildFinancialEvents(d, today);
    const insights = buildFinancialInsights(events, d, today);
    expect(insights.some((i) => i.id === 'never-late')).toBe(false);
  });
});
