import { describe, it, expect } from 'vitest';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';
import type { FinancialHistoryRow } from './billingSubscriptionExperience';
import {
  KPI_DISPLAY_ORDER,
  FINANCIAL_CARD_BODY,
  FINANCIAL_CARD_HEADER,
  FINANCIAL_CARD_SHELL,
  FINANCIAL_SECTION_GAP,
  calendarMiniCardEmoji,
  calendarMiniCardLabel,
  formatHistoryCompetence,
  humanizeFinancialAlerts,
  reorderKpiCards,
  relabelKpiCard,
} from './subscriptionFinancialOverview';
import type { FinancialAlert, FinancialKpiCard } from './subscriptionFinancialExperience';
import { buildFinancialAlerts } from './subscriptionFinancialExperience';
import { buildUpcomingAgenda } from './financialUpcomingAgenda';
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
        due_date: '2026-06-30',
        invoice_id: 'inv-paid',
        invoice_status: 'paid',
        operational_state: 'paid',
        status_pt: 'Pago',
      }),
      row({ due_date: '2026-07-14', invoice_id: 'inv-1', invoice_status: 'pending' }),
      row({
        due_date: '2026-07-21',
        operational_state: 'forecast',
        invoice_id: null,
        invoice_status: null,
        status_pt: 'Previsto',
      }),
    ],
    pending_contract: null,
    tenant_billing: {
      recurring_generate_time_local: '09:00',
      timezone: 'America/Sao_Paulo',
      recurring_invoice_generate_days_before_due: 7,
    },
    meta: { periodicity_label_pt: 'Semanal' },
    ...overrides,
  };
}

function kpi(key: FinancialKpiCard['key'], label: string): FinancialKpiCard {
  return { key, label, primary: '—', secondary: null, badge: null, clickAction: null };
}

describe('KPI_DISPLAY_ORDER', () => {
  it('starts with next_receipt', () => expect(KPI_DISPLAY_ORDER[0]).toBe('next_receipt'));
  it('second is open', () => expect(KPI_DISPLAY_ORDER[1]).toBe('open'));
  it('third is received', () => expect(KPI_DISPLAY_ORDER[2]).toBe('received'));
  it('fourth is last_payment', () => expect(KPI_DISPLAY_ORDER[3]).toBe('last_payment'));
  it('fifth is forecast_12m', () => expect(KPI_DISPLAY_ORDER[4]).toBe('forecast_12m'));
  it('ends with status', () => expect(KPI_DISPLAY_ORDER[5]).toBe('status'));
  it('has six keys', () => expect(KPI_DISPLAY_ORDER).toHaveLength(6));
});

describe('reorderKpiCards', () => {
  const shuffled = [
    kpi('status', 'Status'),
    kpi('received', 'Recebido'),
    kpi('next_receipt', 'Próximo recebimento'),
    kpi('open', 'Em aberto'),
    kpi('last_payment', 'Último pagamento'),
    kpi('forecast_12m', 'Previsão 12m'),
  ];

  it('reorders to mental priority', () => {
    const ordered = reorderKpiCards(shuffled);
    expect(ordered.map((c) => c.key)).toEqual(KPI_DISPLAY_ORDER);
  });

  it('relabels forecast to Receita anual', () => {
    const ordered = reorderKpiCards(shuffled);
    expect(ordered.find((c) => c.key === 'forecast_12m')?.label).toBe('Receita anual');
  });

  it('drops unknown keys', () => {
    const extra = [...shuffled, kpi('next_receipt', 'Dup')];
    expect(reorderKpiCards(extra)).toHaveLength(6);
  });

  it('relabelKpiCard only changes forecast', () => {
    expect(relabelKpiCard(kpi('open', 'Em aberto')).label).toBe('Em aberto');
    expect(relabelKpiCard(kpi('forecast_12m', 'X')).label).toBe('Receita anual');
  });
});

describe('calendarMiniCardLabel', () => {
  const cases: Array<[Parameters<typeof calendarMiniCardLabel>[0], string]> = [
    ['paid', 'Pago'],
    ['invoiced', 'Cobrança'],
    ['due', 'Vence'],
    ['overdue', 'Vence'],
    ['failed', 'Falhou'],
    ['cancelled', 'Cancelada'],
    ['reprocessed', 'Reprocessada'],
  ];
  cases.forEach(([kind, label]) => {
    it(`maps ${kind} to ${label}`, () => expect(calendarMiniCardLabel(kind)).toBe(label));
  });
});

describe('calendarMiniCardEmoji', () => {
  const cases: Array<[Parameters<typeof calendarMiniCardEmoji>[0], string]> = [
    ['paid', '🟢'],
    ['invoiced', '🔵'],
    ['due', '🟠'],
    ['overdue', '🔴'],
    ['failed', '🔴'],
    ['cancelled', '⚫'],
    ['reprocessed', '🔄'],
  ];
  cases.forEach(([kind, emoji]) => {
    it(`maps ${kind} to ${emoji}`, () => expect(calendarMiniCardEmoji(kind)).toBe(emoji));
  });
});

describe('formatHistoryCompetence', () => {
  const historyRow = (overrides: Partial<FinancialHistoryRow>): FinancialHistoryRow => ({
    id: 'h1',
    competence: 'Ciclo Jul/26',
    dueYmd: '2026-07-14',
    paidAt: null,
    amountCents: 11000,
    statusPt: 'Pendente',
    visual: 'generated',
    invoiceId: 'inv-1',
    gateway: 'mp',
    notes: null,
    jobId: null,
    ...overrides,
  });

  it('uses short date from dueYmd', () => {
    expect(formatHistoryCompetence(historyRow({ dueYmd: '2026-07-14' }))).toMatch(/14/);
  });

  it('falls back to short competence', () => {
    expect(formatHistoryCompetence(historyRow({ dueYmd: null, competence: 'Jul/26' }))).toBe('Jul/26');
  });

  it('truncates long competence', () => {
    const long = 'Competência muito longa demais';
    expect(formatHistoryCompetence(historyRow({ dueYmd: null, competence: long })).length).toBeLessThanOrEqual(10);
  });

  it('returns dash when empty', () => {
    expect(formatHistoryCompetence(historyRow({ dueYmd: null, competence: '' }))).toBe('—');
  });
});

describe('humanizeFinancialAlerts', () => {
  it('billing_missing uses friendly title', () => {
    const d = detail({
      timeline: [row({ operational_state: 'failed', invoice_id: null, due_date: '2026-05-01' })],
    });
    const raw = buildFinancialAlerts(d, today).filter((a) => a.kind === 'billing_missing');
    const out = humanizeFinancialAlerts(raw, d, today);
    expect(out[0]?.title).toBe('Cobrança não foi criada');
    expect(out[0]?.message).toMatch(/05\/05|01\/05/);
    expect(out[0]?.actionLabel).toBe('Gerar agora');
  });

  it('billing_missing without date is recoverable (no alert)', () => {
    const d = detail({ timeline: [row({ operational_state: 'failed', invoice_id: null, due_date: null })] });
    const raw = buildFinancialAlerts(d, today).filter((a) => a.kind === 'billing_missing');
    expect(raw).toHaveLength(0);
  });

  it('client_overdue uses friendly title', () => {
    const d = detail({
      timeline: [row({ due_date: '2026-06-20', invoice_status: 'pending', invoice_id: 'inv-o' })],
    });
    const raw = buildFinancialAlerts(d, today).filter((a) => a.kind === 'client_overdue');
    const out = humanizeFinancialAlerts(raw, d, today);
    expect(out[0]?.title).toBe('Pagamento em atraso');
    expect(out[0]?.message).toMatch(/atraso/);
  });

  it('gateway_failed friendly message', () => {
    const d = detail({
      timeline: [row({ operational_state: 'gateway_failed', invoice_status: 'failed' })],
    });
    const raw = buildFinancialAlerts(d, today).filter((a) => a.kind === 'gateway_failed');
    const out = humanizeFinancialAlerts(raw, d, today);
    expect(out[0]?.title).toBe('Pagamento recusado');
    expect(out[0]?.message).toContain('gateway');
  });

  it('strips SQL errors', () => {
    const alerts: FinancialAlert[] = [
      {
        id: 'x',
        kind: 'generic',
        emoji: '⚠',
        title: 'Erro',
        message: 'invalid input syntax for type uuid',
        actionLabel: 'Ver',
      },
    ];
    const out = humanizeFinancialAlerts(alerts, detail(), today);
    expect(out[0]?.message).not.toContain('invalid input');
    expect(out[0]?.message).toContain('inesperado');
  });

  it('strips postgres errors', () => {
    const alerts: FinancialAlert[] = [
      { id: 'x', kind: 'generic', emoji: '⚠', title: 'E', message: 'SQLSTATE 23505', actionLabel: '' },
    ];
    expect(humanizeFinancialAlerts(alerts, detail(), today)[0]?.message).not.toContain('SQLSTATE');
  });

  it('default action label', () => {
    const alerts: FinancialAlert[] = [
      { id: 'x', kind: 'generic', emoji: '⚠', title: 'A', message: 'Algo', actionLabel: '' },
    ];
    expect(humanizeFinancialAlerts(alerts, detail(), today)[0]?.actionLabel).toBe('Resolver agora');
  });
});

describe('spacing constants', () => {
  it('FINANCIAL_CARD_SHELL includes rounded-lg', () => expect(FINANCIAL_CARD_SHELL).toContain('rounded-lg'));
  it('FINANCIAL_CARD_HEADER includes border-b', () => expect(FINANCIAL_CARD_HEADER).toContain('border-b'));
  it('FINANCIAL_CARD_BODY includes padding', () => expect(FINANCIAL_CARD_BODY).toContain('px-6'));
  it('FINANCIAL_SECTION_GAP is space-y-8', () => expect(FINANCIAL_SECTION_GAP).toBe('space-y-8'));
});

describe('store KPI order integration', () => {
  it('getKpiCards follows KPI_DISPLAY_ORDER', () => {
    const store = createFinancialEventStore(detail(), today);
    expect(store.getKpiCards().map((c) => c.key)).toEqual(KPI_DISPLAY_ORDER);
  });

  it('forecast label is Receita anual', () => {
    const store = createFinancialEventStore(detail(), today);
    expect(store.getKpiCards().find((c) => c.key === 'forecast_12m')?.label).toBe('Receita anual');
  });
});

describe('buildUpcomingAgenda', () => {
  it('returns chronological future events', () => {
    const events = buildFinancialEvents(detail(), today);
    const agenda = buildUpcomingAgenda(events, today, 5);
    for (let i = 1; i < agenda.length; i++) {
      expect(agenda[i]!.ymd >= agenda[i - 1]!.ymd).toBe(true);
    }
  });

  it('caps at five items', () => {
    const events = buildFinancialEvents(detail(), today);
    expect(buildUpcomingAgenda(events, today, 5).length).toBeLessThanOrEqual(5);
  });

  it('labels today as Hoje', () => {
    const d = detail({
      timeline: [row({ due_date: today, operational_state: 'forecast', invoice_id: null })],
    });
    const events = buildFinancialEvents(d, today);
    const agenda = buildUpcomingAgenda(events, today, 5);
    const todayItem = agenda.find((a) => a.ymd === today);
    if (todayItem) expect(todayItem.dateLabel).toBe('Hoje');
  });

  it('store exposes agenda', () => {
    const store = createFinancialEventStore(detail(), today);
    expect(store.getUpcomingAgenda(5).length).toBeGreaterThanOrEqual(0);
    expect(store.getNextAgendaEvent()?.title).toBeTruthy();
  });

  it('sidebar next event fields', () => {
    const store = createFinancialEventStore(detail(), today);
    const s = store.getSidebarSummary();
    expect(s.nextEventDate).toBeTruthy();
    expect(s.nextEventTitle).toBeTruthy();
  });
});
