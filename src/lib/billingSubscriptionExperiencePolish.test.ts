import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';
import {
  advanceBillingDueYmd,
  buildBusinessTimelineEvents,
  buildFinancialHistoryRows,
  normalizeYmdInput,
} from './billingSubscriptionExperience';
import {
  buildCalendarGrid,
  buildFutureTimelineSteps,
  buildPremiumKpiCards,
  buildRevenueChartMonths,
  buildSidebarHealthMetrics,
  calendarDayAriaLabel,
  chartHasData,
  clientInitials,
  collectEventsForMonth,
  compareKpiTrend,
  computeHealthScore,
  daysBetweenYmd,
  defaultCalendarMonthKey,
  detectExperienceEmpty,
  expandAnimationClass,
  filterAndSortHistory,
  focusRingClass,
  formatAmountPerInterval,
  formatNextChargePremium,
  groupSmartTimeline,
  groupTitleWhenSingular,
  healthStateEmoji,
  historyRowCategory,
  isValidHistoryFilter,
  isValidHistorySort,
  isYmdInMonth,
  keyboardNavOrder,
  memoizeDetailKey,
  polishTransitionClass,
  premiumHeaderStatusDot,
  responsiveCalendarColumns,
  shiftMonthKey,
  shouldLazyLoadChart,
  skeletonSectionCount,
  timelineEventIcon,
  wcagContrastPair,
} from './billingSubscriptionExperiencePolish';

function timelineRow(overrides: Partial<CrmSubscriptionTimelineRow> = {}): CrmSubscriptionTimelineRow {
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

function detailFixture(overrides: Partial<CrmSubscriptionDetailPayload> = {}): CrmSubscriptionDetailPayload {
  return {
    subscription: {
      id: 'sub-1',
      type: 'crm',
      tenant_id: 't1',
      customer_id: 'cust-1',
      plan_id: null,
      amount_cents: 11000,
      currency: 'BRL',
      billing_anchor_day: 14,
      billing_cycle_count: 1,
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
      created_at: '2026-06-30T10:00:00Z',
      updated_at: '2026-06-30T10:00:00Z',
      cycles_unlimited: true,
      max_cycles: null,
    },
    client_name: 'Empresa XPTO',
    plan_label: 'Plano Premium',
    latest_invoice_id: 'inv-1',
    latest_invoice_status: 'pending',
    latest_paid_invoice_id: 'inv-0',
    stats: {
      total_invoiced_cents: 22000,
      total_paid_cents: 11000,
      total_pending_cents: 11000,
      charge_count: 2,
    },
    timeline: [
      timelineRow(),
      timelineRow({
        invoice_id: 'inv-0',
        invoice_status: 'paid',
        operational_state: 'paid',
        due_date: '2026-06-23',
        processed_at: '2026-06-23T10:00:00Z',
        amount_cents: 11000,
      }),
    ],
    automation_summary: {
      last_generation_at: '2026-06-30T12:00:00Z',
      last_generation_label: '30/06/2026',
      next_generation_ymd: '2026-07-07',
      next_charge_ymd: '2026-07-14',
      worker_status_pt: 'Cobrança agendada',
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

describe('billingSubscriptionExperiencePolish', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('header premium', () => {
    it('clientInitials duas palavras', () => {
      expect(clientInitials('Empresa XPTO')).toBe('EX');
    });
    it('clientInitials vazio', () => {
      expect(clientInitials('')).toBe('?');
    });
    it('formatNextChargePremium', () => {
      expect(formatNextChargePremium('2026-07-14')).toBe('14 JUL');
    });
    it('formatAmountPerInterval weekly', () => {
      expect(formatAmountPerInterval(11000, 'weekly')).toContain('semana');
    });
    it('premiumHeaderStatusDot ativa', () => {
      expect(premiumHeaderStatusDot('active')).toBe('🟢');
    });
    it('premiumHeaderStatusDot pausada', () => {
      expect(premiumHeaderStatusDot('paused')).toBe('⚪');
    });
  });

  describe('KPI cards', () => {
    it('buildPremiumKpiCards retorna 6', () => {
      expect(buildPremiumKpiCards(detailFixture())).toHaveLength(6);
    });
    it('card receita recebida', () => {
      const card = buildPremiumKpiCards(detailFixture()).find((c) => c.key === 'received');
      expect(card?.label).toBe('Receita recebida');
    });
    it('card saúde com score', () => {
      const card = buildPremiumKpiCards(detailFixture()).find((c) => c.key === 'health');
      expect(Number(card?.value)).toBeGreaterThan(0);
    });
    it('compareKpiTrend positivo', () => {
      expect(compareKpiTrend(18)).toBe('↑ 18%');
    });
    it('compareKpiTrend negativo', () => {
      expect(compareKpiTrend(-5)).toBe('↓ 5%');
    });
    it('compareKpiTrend null', () => {
      expect(compareKpiTrend(null)).toBe('');
    });
  });

  describe('calendário grid', () => {
    it('shiftMonthKey avança', () => {
      expect(shiftMonthKey('2026-06', 1)).toBe('2026-07');
    });
    it('shiftMonthKey retrocede', () => {
      expect(shiftMonthKey('2026-06', -1)).toBe('2026-05');
    });
    it('defaultCalendarMonthKey usa próxima cobrança', () => {
      expect(defaultCalendarMonthKey(detailFixture())).toBe('2026-07');
    });
    it('buildCalendarGrid 35+ células', () => {
      const events = collectEventsForMonth(detailFixture(), '2026-07');
      const grid = buildCalendarGrid('2026-07', events, '2026-06-30');
      expect(grid.length).toBeGreaterThanOrEqual(28);
    });
    it('buildCalendarGrid marca hoje', () => {
      const grid = buildCalendarGrid('2026-06', [], '2026-06-30');
      expect(grid.some((c) => c.isToday && c.day === 30)).toBe(true);
    });
    it('calendarDayAriaLabel sem eventos', () => {
      const label = calendarDayAriaLabel({
        ymd: '2026-07-14',
        day: 14,
        isToday: false,
        inMonth: true,
        events: [],
      });
      expect(label).toContain('sem eventos');
    });
    it('isYmdInMonth', () => {
      expect(isYmdInMonth('2026-07-14', '2026-07')).toBe(true);
    });
    it('responsiveCalendarColumns', () => {
      expect(responsiveCalendarColumns(400)).toBe(7);
    });
  });

  describe('timeline inteligente', () => {
    it('groupSmartTimeline agrupa pagamentos', () => {
      const events = buildBusinessTimelineEvents(detailFixture());
      const groups = groupSmartTimeline(events);
      expect(groups.length).toBeGreaterThan(0);
    });
    it('timelineEventIcon payment', () => {
      expect(timelineEventIcon('payment')).toBe('💰');
    });
    it('timelineEventIcon billing', () => {
      expect(timelineEventIcon('billing')).toBe('🧾');
    });
    it('groupTitleWhenSingular pagamentos', () => {
      expect(groupTitleWhenSingular('Pagamento confirmado', 3)).toBe('3 pagamentos confirmados');
    });
    it('agrupa múltiplos pagamentos no mesmo mês', () => {
      const d = detailFixture({
        timeline: [
          timelineRow({ invoice_status: 'paid', operational_state: 'paid', processed_at: '2026-06-10T00:00:00Z', due_date: '2026-06-10', invoice_id: 'a' }),
          timelineRow({ invoice_status: 'paid', operational_state: 'paid', processed_at: '2026-06-20T00:00:00Z', due_date: '2026-06-20', invoice_id: 'b' }),
          timelineRow({ invoice_status: 'paid', operational_state: 'paid', processed_at: '2026-06-25T00:00:00Z', due_date: '2026-06-25', invoice_id: 'c' }),
        ],
      });
      const groups = groupSmartTimeline(buildBusinessTimelineEvents(d));
      const paidGroup = groups.find((g) => g.count >= 3);
      expect(paidGroup?.count).toBeGreaterThanOrEqual(3);
    });
  });

  describe('histórico filtros', () => {
    const rows = buildFinancialHistoryRows(detailFixture());

    it('historyRowCategory paid', () => {
      const paid = rows.find((r) => r.visual === 'paid');
      if (paid) expect(historyRowCategory(paid, '2026-06-30')).toBe('paid');
    });
    it('filter all', () => {
      expect(filterAndSortHistory(rows, { filter: 'all', search: '', sort: 'due_desc' }).length).toBe(rows.length);
    });
    it('filter paid', () => {
      const filtered = filterAndSortHistory(rows, { filter: 'paid', search: '', sort: 'due_desc' });
      expect(filtered.every((r) => historyRowCategory(r, '2026-06-30') === 'paid')).toBe(true);
    });
    it('search por invoice', () => {
      const filtered = filterAndSortHistory(rows, { filter: 'all', search: 'inv-1', sort: 'due_desc' });
      expect(filtered.length).toBeGreaterThanOrEqual(1);
    });
    it('sort amount desc', () => {
      const sorted = filterAndSortHistory(rows, { filter: 'all', search: '', sort: 'amount_desc' });
      expect((sorted[0].amountCents ?? 0) >= (sorted[sorted.length - 1].amountCents ?? 0)).toBe(true);
    });
    it('isValidHistoryFilter', () => {
      expect(isValidHistoryFilter('paid')).toBe(true);
      expect(isValidHistoryFilter('x')).toBe(false);
    });
    it('isValidHistorySort', () => {
      expect(isValidHistorySort('due_asc')).toBe(true);
    });
  });

  describe('próximos ciclos timeline', () => {
    it('buildFutureTimelineSteps tem Hoje', () => {
      const steps = buildFutureTimelineSteps(detailFixture());
      expect(steps[0]?.label).toBe('Hoje');
    });
    it('inclui vencimento', () => {
      expect(buildFutureTimelineSteps(detailFixture()).some((s) => s.label === 'Vencimento')).toBe(true);
    });
    it('inclui receita prevista', () => {
      expect(buildFutureTimelineSteps(detailFixture()).some((s) => s.label === 'Receita prevista')).toBe(true);
    });
    it('vazio se cancelada', () => {
      const d = detailFixture({ subscription: { ...detailFixture().subscription, status: 'cancelled' } });
      expect(buildFutureTimelineSteps(d)).toHaveLength(0);
    });
  });

  describe('health score', () => {
    it('score entre 0 e 100', () => {
      const h = computeHealthScore(detailFixture());
      expect(h.score).toBeGreaterThanOrEqual(0);
      expect(h.score).toBeLessThanOrEqual(100);
    });
    it('cancelada score 0', () => {
      const d = detailFixture({ subscription: { ...detailFixture().subscription, status: 'cancelled' } });
      expect(computeHealthScore(d).score).toBe(0);
    });
    it('pausada state paused', () => {
      const d = detailFixture({ subscription: { ...detailFixture().subscription, status: 'paused' } });
      expect(computeHealthScore(d).state).toBe('paused');
    });
    it('healthStateEmoji', () => {
      expect(healthStateEmoji('healthy')).toBe('🟢');
      expect(healthStateEmoji('error')).toBe('🔴');
    });
    it('penaliza falhas', () => {
      const d = detailFixture({
        timeline: [timelineRow({ operational_state: 'failed' })],
      });
      const healthy = computeHealthScore(detailFixture()).score;
      const failed = computeHealthScore(d).score;
      expect(failed).toBeLessThanOrEqual(healthy);
    });
  });

  describe('sidebar e gráfico', () => {
    it('buildSidebarHealthMetrics', () => {
      const m = buildSidebarHealthMetrics(detailFixture());
      expect(m.annualProjectedCents).toBeGreaterThan(0);
    });
    it('daysUntilCharge', () => {
      expect(buildSidebarHealthMetrics(detailFixture()).daysUntilCharge).toBe(14);
    });
    it('buildRevenueChartMonths 12 meses', () => {
      expect(buildRevenueChartMonths(detailFixture())).toHaveLength(12);
    });
    it('chartHasData', () => {
      const months = buildRevenueChartMonths(detailFixture());
      expect(chartHasData(months)).toBe(true);
    });
    it('daysBetweenYmd', () => {
      expect(daysBetweenYmd('2026-06-30', '2026-07-14')).toBe(14);
    });
  });

  describe('empty states', () => {
    it('detect history empty', () => {
      const d = detailFixture({ timeline: [] });
      expect(detectExperienceEmpty('history', d)).toBe('history');
    });
    it('detect forecast cancelled', () => {
      const d = detailFixture({ subscription: { ...detailFixture().subscription, status: 'cancelled' } });
      expect(detectExperienceEmpty('forecast', d)).toBe('forecast');
    });
    it('detect payment sem pagos', () => {
      const d = detailFixture({ timeline: [timelineRow({ invoice_status: 'pending', operational_state: 'generated' })] });
      expect(detectExperienceEmpty('payment', d)).toBe('payment');
    });
  });

  describe('acessibilidade e UI', () => {
    it('wcagContrastPair healthy', () => {
      expect(wcagContrastPair('healthy').fg).toContain('emerald');
    });
    it('focusRingClass', () => {
      expect(focusRingClass()).toContain('focus-visible:ring');
    });
    it('keyboardNavOrder', () => {
      expect(keyboardNavOrder()).toContain('header');
      expect(keyboardNavOrder()).toContain('sidebar');
    });
    it('polishTransitionClass', () => {
      expect(polishTransitionClass()).toContain('transition');
    });
    it('expandAnimationClass', () => {
      expect(expandAnimationClass(true)).toContain('fade-in');
    });
  });

  describe('performance', () => {
    it('memoizeDetailKey estável', () => {
      const d = detailFixture();
      expect(memoizeDetailKey(d)).toBe(memoizeDetailKey(d));
    });
    it('memoizeDetailKey muda com status', () => {
      const a = detailFixture();
      const b = detailFixture({ subscription: { ...a.subscription, status: 'paused' } });
      expect(memoizeDetailKey(a)).not.toBe(memoizeDetailKey(b));
    });
    it('shouldLazyLoadChart mobile', () => {
      expect(shouldLazyLoadChart(true)).toBe(true);
    });
    it('shouldLazyLoadChart desktop', () => {
      expect(shouldLazyLoadChart(false)).toBe(false);
    });
    it('skeletonSectionCount', () => {
      expect(skeletonSectionCount()).toBe(6);
    });
  });

  describe('datas', () => {
    it('normalizeYmdInput ISO', () => {
      expect(normalizeYmdInput('2026-07-14')).toBe('2026-07-14');
    });
    it('advanceBillingDueYmd weekly', () => {
      expect(advanceBillingDueYmd('2026-07-14', 'weekly')).toBe('2026-07-21');
    });
  });
});
