import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';
import {
  buildFinancialAlerts,
  buildFinancialCalendarEvents,
  buildFinancialHeaderData,
  buildFinancialInsights,
  buildFinancialKpiCards,
  buildFinancialProgressMonths,
  buildFinancialSidebarData,
  buildHumanizedTimeline,
  buildUpcomingReceipts,
  buildCalendarGrid,
  calendarEventTitle,
  calendarKindEmoji,
  computeSubscriptionProgress,
  defaultFinancialCalendarMonth,
  filterFinancialHistory,
  financialDayAriaLabel,
  financialEventsForMonth,
  FINANCIAL_CALENDAR_LEGEND,
  groupFinancialTimelineByMonth,
  historyRowFinancialCategory,
  isValidFinancialHistoryFilter,
  mapRowToFinancialCalendarKind,
  mobileFinancialSectionOrder,
  progressBarBlocks,
} from './subscriptionFinancialExperience';
import { buildFinancialHistoryRows } from './billingSubscriptionExperience';

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
      next_billing_date: '2026-07-14',
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
    },
    client_name: 'Empresa XPTO',
    plan_label: 'Plano Premium',
    latest_invoice_id: 'inv-1',
    latest_invoice_status: 'pending',
    latest_paid_invoice_id: 'inv-0',
    stats: { total_invoiced_cents: 22000, total_paid_cents: 11000, total_pending_cents: 11000, charge_count: 2 },
    timeline: [
      row(),
      row({
        invoice_id: 'inv-0',
        invoice_status: 'paid',
        operational_state: 'paid',
        due_date: '2026-06-23',
        processed_at: '2026-06-23T10:00:00Z',
        amount_cents: 11000,
        cycle_id: 'c2',
      }),
    ],
    automation_summary: {
      last_generation_at: '2026-06-30T12:00:00Z',
      last_generation_label: '30/06',
      next_generation_ymd: '2026-07-07',
      next_charge_ymd: '2026-07-14',
      worker_status_pt: 'OK',
      last_worker_check_at: '2026-06-30T12:00:00Z',
    },
    cycles_raw: [],
    cycles_read_enabled: false,
    tenant_billing: {
      timezone: 'America/Sao_Paulo',
      recurring_generate_time_local: '09:00',
      invoice_notify_same_as_generation: true,
      invoice_notify_time_local: '09:00',
      recurring_invoice_generate_days_before_due: 7,
    },
    recent_jobs: [],
    meta: { periodicity_label_pt: 'Semanal' },
    ...overrides,
  };
}

describe('subscriptionFinancialExperience', () => {
  const today = '2026-06-30';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${today}T12:00:00Z`));
  });

  afterEach(() => vi.useRealTimers());

  describe('header financeiro', () => {
    it('buildFinancialHeaderData cliente e plano', () => {
      const h = buildFinancialHeaderData(detail(), today);
      expect(h.clientName).toBe('Empresa XPTO');
      expect(h.planName).toBe('Plano Premium');
    });
    it('status emoji ativa', () => {
      expect(buildFinancialHeaderData(detail(), today).statusEmoji).toBe('🟢');
    });
    it('último pagamento formatado', () => {
      expect(buildFinancialHeaderData(detail(), today).lastPaymentLabel).toMatch(/23/);
    });
    it('próximo recebimento', () => {
      expect(buildFinancialHeaderData(detail(), today).nextReceiptLabel).toMatch(/14/);
    });
    it('receita anual prevista', () => {
      expect(buildFinancialHeaderData(detail(), today).annualForecastLabel).toContain('R$');
    });
    it('progresso da assinatura', () => {
      const p = buildFinancialHeaderData(detail(), today);
      expect(p.progressPct).toBeGreaterThanOrEqual(0);
      expect(p.progressLabel).toBeTruthy();
    });
    it('computeSubscriptionProgress com ciclos finitos', () => {
      const d = detail({ subscription: { ...detail().subscription, cycles_unlimited: false, max_cycles: 12 } });
      expect(computeSubscriptionProgress(d).label).toContain('de 12');
    });
  });

  describe('KPI cards financeiros', () => {
    it('6 cards revenue-focused', () => {
      const cards = buildFinancialKpiCards(detail(), today);
      expect(cards).toHaveLength(6);
      expect(cards.map((c) => c.key)).toEqual([
        'next_receipt', 'open', 'received', 'last_payment', 'forecast_12m', 'status',
      ]);
    });
    it('sem card de saúde', () => {
      expect(buildFinancialKpiCards(detail(), today).some((c) => c.key === 'health')).toBe(false);
    });
    it('recebido com valor', () => {
      expect(buildFinancialKpiCards(detail(), today).find((c) => c.key === 'received')?.primary).toContain('R$');
    });
    it('em aberto', () => {
      expect(buildFinancialKpiCards(detail(), today).find((c) => c.key === 'open')?.primary).toContain('R$');
    });
    it('próximo recebimento data e valor', () => {
      const c = buildFinancialKpiCards(detail(), today).find((x) => x.key === 'next_receipt');
      expect(c?.primary).toMatch(/14/);
      expect(c?.secondary).toContain('R$');
    });
    it('forecast 12 meses', () => {
      expect(buildFinancialKpiCards(detail(), today).find((c) => c.key === 'forecast_12m')?.primary).toContain('R$');
    });
  });

  describe('calendário 2.0', () => {
    it('FINANCIAL_CALENDAR_LEGEND 7 tipos', () => {
      expect(FINANCIAL_CALENDAR_LEGEND).toHaveLength(7);
    });
    it('calendarKindEmoji paid', () => {
      expect(calendarKindEmoji('paid')).toBe('🟢');
    });
    it('calendarKindEmoji invoiced', () => {
      expect(calendarKindEmoji('invoiced')).toBe('🔵');
    });
    it('mapRowToFinancialCalendarKind paid', () => {
      expect(mapRowToFinancialCalendarKind(row({ invoice_status: 'paid', operational_state: 'paid' }), today)).toBe('paid');
    });
    it('mapRowToFinancialCalendarKind overdue', () => {
      expect(mapRowToFinancialCalendarKind(row({ due_date: '2026-06-01', invoice_status: 'pending' }), today)).toBe('overdue');
    });
    it('calendarEventTitle vence hoje', () => {
      expect(calendarEventTitle('due', today, today)).toBe('Vence hoje');
    });
    it('buildFinancialCalendarEvents inclui pagamento', () => {
      const ev = buildFinancialCalendarEvents(detail(), today);
      expect(ev.some((e) => e.kind === 'paid')).toBe(true);
    });
    it('buildFinancialCalendarEvents inclui futuro', () => {
      const ev = buildFinancialCalendarEvents(detail(), today);
      expect(ev.some((e) => e.title.includes('Próximo') || e.kind === 'due')).toBe(true);
    });
    it('financialEventsForMonth filtra', () => {
      const all = buildFinancialCalendarEvents(detail(), today);
      const july = financialEventsForMonth(all, '2026-07');
      expect(july.every((e) => e.ymd.startsWith('2026-07'))).toBe(true);
    });
    it('defaultFinancialCalendarMonth', () => {
      expect(defaultFinancialCalendarMonth(detail(), today)).toBe('2026-07');
    });
    it('buildCalendarGrid estrutura', () => {
      const grid = buildCalendarGrid('2026-07', [], today);
      expect(grid.length % 7).toBe(0);
    });
    it('financialDayAriaLabel', () => {
      expect(financialDayAriaLabel(14, [])).toContain('Dia 14');
    });
  });

  describe('timeline financeira', () => {
    it('buildHumanizedTimeline cliente pagou', () => {
      const items = buildHumanizedTimeline(detail());
      expect(items.some((i) => i.title === 'Cliente pagou')).toBe(true);
    });
    it('ícone pagamento', () => {
      expect(buildHumanizedTimeline(detail()).find((i) => i.title === 'Cliente pagou')?.icon).toBe('💰');
    });
    it('groupFinancialTimelineByMonth', () => {
      const groups = groupFinancialTimelineByMonth(buildHumanizedTimeline(detail()));
      expect(groups.length).toBeGreaterThan(0);
      expect(groups[0].summaryTitle).toBe('Recebeu');
    });
    it('agrupa total do mês', () => {
      const g = groupFinancialTimelineByMonth(buildHumanizedTimeline(detail()))[0];
      expect(g.totalCents).toBe(11000);
    });
    it('múltiplos pagamentos no mês', () => {
      const d = detail({
        timeline: [
          row({ invoice_status: 'paid', operational_state: 'paid', processed_at: '2026-06-10T00:00:00Z', due_date: '2026-06-10', invoice_id: 'a' }),
          row({ invoice_status: 'paid', operational_state: 'paid', processed_at: '2026-06-20T00:00:00Z', due_date: '2026-06-20', invoice_id: 'b' }),
        ],
      });
      const g = groupFinancialTimelineByMonth(buildHumanizedTimeline(d))[0];
      expect(g.count).toBe(2);
      expect(g.totalCents).toBe(22000);
    });
  });

  describe('histórico e filtros', () => {
    it('filter all', () => {
      const rows = buildFinancialHistoryRows(detail(), today);
      expect(filterFinancialHistory(rows, detail(), { filter: 'all', search: '', sort: 'due_desc', todayYmd: today }).length).toBe(rows.length);
    });
    it('filter paid', () => {
      const rows = buildFinancialHistoryRows(detail(), today);
      const f = filterFinancialHistory(rows, detail(), { filter: 'paid', search: '', sort: 'due_desc', todayYmd: today });
      expect(f.every((r) => r.visual === 'paid')).toBe(true);
    });
    it('filter pending', () => {
      const rows = buildFinancialHistoryRows(detail(), today);
      expect(filterFinancialHistory(rows, detail(), { filter: 'pending', search: '', sort: 'due_desc', todayYmd: today }).length).toBeGreaterThanOrEqual(1);
    });
    it('filter overdue', () => {
      const d = detail({ timeline: [row({ due_date: '2026-06-01', invoice_status: 'pending' })] });
      const r = buildFinancialHistoryRows(d);
      expect(filterFinancialHistory(r, d, { filter: 'overdue', search: '', sort: 'due_desc', todayYmd: today }).length).toBeGreaterThanOrEqual(1);
    });
    it('filter refunded', () => {
      const d = detail({ timeline: [row({ invoice_status: 'refunded' })] });
      const r = buildFinancialHistoryRows(d);
      const tRow = d.timeline[0];
      expect(historyRowFinancialCategory(r[0], today, tRow)).toBe('refunded');
    });
    it('busca por invoice', () => {
      const rows = buildFinancialHistoryRows(detail(), today);
      expect(filterFinancialHistory(rows, detail(), { filter: 'all', search: 'inv-1', sort: 'due_desc', todayYmd: today }).length).toBeGreaterThanOrEqual(1);
    });
    it('sort amount desc', () => {
      const rows = buildFinancialHistoryRows(detail(), today);
      const s = filterFinancialHistory(rows, detail(), { filter: 'all', search: '', sort: 'amount_desc', todayYmd: today });
      expect((s[0].amountCents ?? 0) >= (s[s.length - 1].amountCents ?? 0)).toBe(true);
    });
    it('isValidFinancialHistoryFilter', () => {
      expect(isValidFinancialHistoryFilter('refunded')).toBe(true);
      expect(isValidFinancialHistoryFilter('x')).toBe(false);
    });
  });

  describe('próximos recebimentos', () => {
    it('buildUpcomingReceipts', () => {
      expect(buildUpcomingReceipts(detail(), 4).length).toBe(4);
    });
    it('status previsto', () => {
      expect(buildUpcomingReceipts(detail(), 8).some((r) => r.statusLabel === 'Prevista')).toBe(true);
    });
    it('vazio se cancelada', () => {
      const d = detail({ subscription: { ...detail().subscription, status: 'cancelled' } });
      expect(buildUpcomingReceipts(d)).toHaveLength(0);
    });
    it('amount correto', () => {
      expect(buildUpcomingReceipts(detail(), 1)[0].amountCents).toBe(11000);
    });
  });

  describe('alertas', () => {
    it('sem alertas quando OK', () => {
      expect(buildFinancialAlerts(detail(), today)).toHaveLength(0);
    });
    it('alerta cobrança não gerada', () => {
      const d = detail({
        timeline: [row({ operational_state: 'failed', invoice_id: null, due_date: '2026-05-01', job_error_snippet: 'ERR' })],
      });
      expect(buildFinancialAlerts(d, today).some((a) => a.kind === 'billing_missing')).toBe(true);
    });
    it('alerta cliente atrasado', () => {
      const d = detail({ timeline: [row({ due_date: '2026-06-01', invoice_status: 'pending' })] });
      expect(buildFinancialAlerts(d, today).some((a) => a.kind === 'client_overdue')).toBe(true);
    });
    it('alerta gateway', () => {
      const d = detail({ timeline: [row({ operational_state: 'gateway_failed' })] });
      expect(buildFinancialAlerts(d, today).some((a) => a.kind === 'gateway_failed')).toBe(true);
    });
  });

  describe('barra financeira', () => {
    it('buildFinancialProgressMonths 3 meses', () => {
      expect(buildFinancialProgressMonths(detail(), today)).toHaveLength(3);
    });
    it('progressBarBlocks 10 chars', () => {
      expect(progressBarBlocks(50)).toHaveLength(10);
    });
    it('progressBarBlocks cheio', () => {
      expect(progressBarBlocks(100)).toBe('██████████');
    });
    it('mês futuro não iniciado', () => {
      const months = buildFinancialProgressMonths(detail(), today);
      expect(months[2].statusLabel).toMatch(/não iniciado|Em andamento|Parcial|Pago/);
    });
  });

  describe('insights', () => {
    it('buildFinancialInsights não vazio', () => {
      expect(buildFinancialInsights(detail(), today).length).toBeGreaterThan(0);
    });
    it('insight receita prevista', () => {
      expect(buildFinancialInsights(detail(), today).some((i) => i.text.includes('Receita prevista'))).toBe(true);
    });
    it('insight nunca atrasou', () => {
      expect(buildFinancialInsights(detail(), today).some((i) => i.text.includes('nunca atrasou'))).toBe(true);
    });
    it('insight recorrente há', () => {
      expect(buildFinancialInsights(detail(), today).some((i) => i.text.includes('recorrente'))).toBe(true);
    });
  });

  describe('sidebar', () => {
    it('buildFinancialSidebarData', () => {
      const s = buildFinancialSidebarData(detail());
      expect(s.nextReceiptAmount).toContain('R$');
      expect(s.annualRevenue).toContain('R$');
    });
    it('último pagamento na sidebar', () => {
      expect(buildFinancialSidebarData(detail()).lastPaymentDate).toMatch(/23/);
    });
  });

  describe('mobile e acessibilidade', () => {
    it('mobileFinancialSectionOrder', () => {
      const order = mobileFinancialSectionOrder();
      expect(order[0]).toBe('header');
      expect(order).toContain('sidebar');
      expect(order).toContain('history');
      expect(order.indexOf('history')).toBeGreaterThan(order.indexOf('calendar'));
    });
    it('mobile coloca sidebar antes do histórico', () => {
      expect(mobileFinancialSectionOrder().indexOf('sidebar')).toBeLessThan(
        mobileFinancialSectionOrder().indexOf('history')
      );
    });
  it('mobile não inclui upcoming_agenda', () => {
    expect(mobileFinancialSectionOrder()).not.toContain('upcoming_agenda');
  });
  it('history após calendar', () => {
    expect(mobileFinancialSectionOrder().indexOf('history')).toBeGreaterThan(
      mobileFinancialSectionOrder().indexOf('calendar')
    );
  });
  });

  describe('progresso', () => {
    it('computeSubscriptionProgress percentual', () => {
      expect(computeSubscriptionProgress(detail()).pct).toBe(50);
    });
    it('header cancelada', () => {
      const d = detail({ subscription: { ...detail().subscription, status: 'cancelled' } });
      expect(buildFinancialHeaderData(d, today).statusEmoji).toBe('⚫');
    });
    it('header pausada', () => {
      const d = detail({ subscription: { ...detail().subscription, status: 'paused' } });
      expect(buildFinancialHeaderData(d, today).statusEmoji).toBe('⚪');
    });
  });

  describe('casos adicionais', () => {
    it('calendarKindEmoji overdue', () => {
      expect(calendarKindEmoji('overdue')).toBe('🔴');
    });
    it('calendarKindEmoji reprocessed', () => {
      expect(calendarKindEmoji('reprocessed')).toBe('🔄');
    });
    it('calendarEventTitle pagamento atrasado', () => {
      expect(calendarEventTitle('overdue', today, '2026-06-01')).toBe('Pagamento atrasado');
    });
    it('humanized fatura emitida', () => {
      expect(buildHumanizedTimeline(detail()).some((i) => i.title === 'Fatura emitida')).toBe(true);
    });
    it('filter cancelled', () => {
      const d = detail({ timeline: [row({ operational_state: 'cancelled' })] });
      const r = buildFinancialHistoryRows(d);
      expect(filterFinancialHistory(r, d, { filter: 'cancelled', search: '', sort: 'due_desc', todayYmd: today }).length).toBeGreaterThanOrEqual(1);
    });
    it('sort due asc', () => {
      const rows = buildFinancialHistoryRows(detail());
      const s = filterFinancialHistory(rows, detail(), { filter: 'all', search: '', sort: 'due_asc', todayYmd: today });
      expect((s[0].dueYmd ?? '') <= (s[s.length - 1].dueYmd ?? '')).toBe(true);
    });
    it('KPI status ativa', () => {
      expect(buildFinancialKpiCards(detail(), today).find((c) => c.key === 'status')?.primary).toBe('Ativa');
    });
    it('upcoming dateLabel formatado', () => {
      expect(buildUpcomingReceipts(detail(), 1)[0].dateLabel).toMatch(/14/);
    });
    it('alerta mensagem amigável', () => {
      const d = detail({
        timeline: [row({ operational_state: 'failed', invoice_id: null, due_date: '2026-05-01' })],
      });
      expect(buildFinancialAlerts(d, today)[0].actionLabel).toBe('Gerar novamente');
    });
    it('insights ícone', () => {
      expect(buildFinancialInsights(detail(), today)[0].icon).toBe('💡');
    });
  });
});
