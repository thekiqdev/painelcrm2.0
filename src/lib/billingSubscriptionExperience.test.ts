import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';
import {
  FRIENDLY_BILLING_ERROR_MESSAGES,
  advanceBillingDueYmd,
  billingVisualStateLabel,
  buildBusinessTimelineEvents,
  buildCalendarEventFromTimelineRow,
  buildCalendarMonths,
  buildFinancialHistoryRows,
  buildFinancialSummary,
  buildFutureCycles,
  buildSummaryCards,
  buildTechnicalDiagnostics,
  calendarLegend,
  experienceLayoutColumns,
  friendlyBillingMessage,
  mapOperationalStateToVisual,
  monthKeyToLabelPt,
  normalizeYmdInput,
  resolveGenerationYmd,
  resolveSubscriptionSituation,
  subscriptionExperienceHeaderLines,
  subscriptionHeadlineStatus,
  ymdToMonthKey,
} from './billingSubscriptionExperience';

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
    status_pt: 'Aguardando pagamento',
    operational_state: 'generated',
    operational_state_pt: 'Fatura gerada',
    amount_cents: 9000,
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
      amount_cents: 9000,
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
      total_invoiced_cents: 18000,
      total_paid_cents: 9000,
      total_pending_cents: 9000,
      charge_count: 2,
    },
    timeline: [timelineRow()],
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

describe('billingSubscriptionExperience', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('friendlyBillingMessage', () => {
    it('mapeia BILLING_PLAN_NOT_FOUND', () => {
      expect(friendlyBillingMessage('BILLING_PLAN_NOT_FOUND')).toBe(
        FRIENDLY_BILLING_ERROR_MESSAGES.BILLING_PLAN_NOT_FOUND
      );
    });
    it('mapeia customer_unresolvable', () => {
      expect(friendlyBillingMessage('customer_unresolvable')).toContain('Cliente');
    });
    it('traduz status_paused', () => {
      expect(friendlyBillingMessage('status_paused')).toContain('pausada');
    });
    it('traduz enqueue_', () => {
      expect(friendlyBillingMessage('enqueue_busy')).toContain('fila');
    });
    it('retorna fallback para vazio', () => {
      expect(friendlyBillingMessage('')).toContain('inesperado');
    });
    it('humaniza código desconhecido', () => {
      expect(friendlyBillingMessage('some_unknown_code')).toBe('Some Unknown Code');
    });
  });

  describe('normalizeYmdInput', () => {
    it('aceita YYYY-MM-DD', () => {
      expect(normalizeYmdInput('2026-07-14')).toBe('2026-07-14');
    });
    it('rejeita Date inválida', () => {
      expect(normalizeYmdInput(new Date('invalid'))).toBeNull();
    });
    it('converte Date válida para ISO date', () => {
      expect(normalizeYmdInput(new Date('2026-07-14T15:00:00Z'))).toBe('2026-07-14');
    });
    it('nunca usa toString de Date como SQL', () => {
      const d = new Date('2026-07-14T15:00:00Z');
      const normalized = normalizeYmdInput(d);
      expect(normalized).not.toContain('GMT');
      expect(normalized).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
    it('retorna null para lixo', () => {
      expect(normalizeYmdInput('not-a-date')).toBeNull();
    });
  });

  describe('calendar', () => {
    it('ymdToMonthKey', () => {
      expect(ymdToMonthKey('2026-07-14')).toBe('2026-07');
    });
    it('monthKeyToLabelPt', () => {
      expect(monthKeyToLabelPt('2026-07')).toBe('Julho 2026');
    });
    it('calendarLegend tem 6 entradas', () => {
      expect(calendarLegend()).toHaveLength(6);
    });
    it('mapOperationalStateToVisual paid', () => {
      expect(mapOperationalStateToVisual('paid')).toBe('paid');
    });
    it('mapOperationalStateToVisual failed', () => {
      expect(mapOperationalStateToVisual('failed')).toBe('overdue');
    });
    it('mapOperationalStateToVisual reprocessed', () => {
      expect(mapOperationalStateToVisual('generated', { has_auto_retry: true } as CrmSubscriptionTimelineRow)).toBe(
        'reprocessed'
      );
    });
    it('buildCalendarEventFromTimelineRow gera geração e vencimento', () => {
      const events = buildCalendarEventFromTimelineRow(
        timelineRow(),
        detailFixture().tenant_billing,
        0,
        'weekly'
      );
      expect(events.some((e) => e.kind === 'generation')).toBe(true);
      expect(events.some((e) => e.kind === 'due')).toBe(true);
    });
    it('buildCalendarMonths agrupa por mês', () => {
      const months = buildCalendarMonths(detailFixture(), 2);
      expect(months.length).toBeGreaterThan(0);
      expect(months[0].events.length).toBeGreaterThan(0);
    });
    it('buildCalendarMonths inclui futuros', () => {
      const months = buildCalendarMonths(detailFixture(), 3);
      const all = months.flatMap((m) => m.events);
      expect(all.some((e) => e.visual === 'future')).toBe(true);
    });
  });

  describe('timeline', () => {
    it('inclui assinatura criada', () => {
      const events = buildBusinessTimelineEvents(detailFixture());
      expect(events.some((e) => e.title === 'Assinatura criada')).toBe(true);
    });
    it('inclui próxima cobrança agendada', () => {
      const events = buildBusinessTimelineEvents(detailFixture());
      expect(events.some((e) => e.title === 'Próxima cobrança agendada')).toBe(true);
    });
    it('inclui pagamento confirmado quando pago', () => {
      const d = detailFixture({
        timeline: [timelineRow({ invoice_status: 'paid', operational_state: 'paid' })],
      });
      expect(buildBusinessTimelineEvents(d).some((e) => e.title === 'Pagamento confirmado')).toBe(true);
    });
    it('inclui plano preparado sem faturas', () => {
      const d = detailFixture({ timeline: [] });
      expect(buildBusinessTimelineEvents(d).some((e) => e.title === 'Plano de cobrança preparado')).toBe(true);
    });
    it('ordena por data', () => {
      const events = buildBusinessTimelineEvents(detailFixture());
      for (let i = 1; i < events.length; i += 1) {
        expect(events[i].ymd >= events[i - 1].ymd).toBe(true);
      }
    });
  });

  describe('histórico financeiro', () => {
    it('mapeia linhas da timeline', () => {
      const rows = buildFinancialHistoryRows(detailFixture());
      expect(rows).toHaveLength(1);
      expect(rows[0].competence).toBe('Jul/26');
    });
    it('inclui invoice id', () => {
      expect(buildFinancialHistoryRows(detailFixture())[0].invoiceId).toBe('inv-1');
    });
    it('exclui lifecycle', () => {
      const d = detailFixture({
        timeline: [
          timelineRow(),
          timelineRow({ merge_source: 'lifecycle', cycle_label: 'Pausa' }),
        ],
      });
      expect(buildFinancialHistoryRows(d)).toHaveLength(1);
    });
  });

  describe('resumo financeiro', () => {
    it('calcula receita recebida', () => {
      expect(buildFinancialSummary(detailFixture()).receivedRevenueCents).toBe(9000);
    });
    it('calcula valor em aberto', () => {
      expect(buildFinancialSummary(detailFixture()).openAmountCents).toBe(9000);
    });
    it('calcula ticket médio', () => {
      const d = detailFixture({
        timeline: [timelineRow({ invoice_status: 'paid', operational_state: 'paid' })],
      });
      expect(buildFinancialSummary(d).averageTicketCents).toBe(9000);
    });
    it('conta faturas', () => {
      expect(buildFinancialSummary(detailFixture()).invoiceCount).toBe(2);
    });
    it('projeta receita futura', () => {
      expect(buildFinancialSummary(detailFixture()).projectedRevenueCents).toBeGreaterThan(9000);
    });
  });

  describe('summary cards', () => {
    it('retorna 6 cards', () => {
      expect(buildSummaryCards(detailFixture())).toHaveLength(6);
    });
    it('status ativa', () => {
      expect(buildSummaryCards(detailFixture()).find((c) => c.key === 'status')?.value).toBe('Ativa');
    });
    it('próxima geração formatada', () => {
      const card = buildSummaryCards(detailFixture()).find((c) => c.key === 'next_gen');
      expect(card?.value).toMatch(/07\/07\/2026/);
    });
  });

  describe('situação e estados', () => {
    it('ativa com fatura pendente', () => {
      expect(resolveSubscriptionSituation(detailFixture()).label).toContain('confirmação');
    });
    it('pausada', () => {
      const d = detailFixture({ subscription: { ...detailFixture().subscription, status: 'paused' } });
      expect(resolveSubscriptionSituation(d).visualState).toBe('paused');
    });
    it('cancelada', () => {
      const d = detailFixture({ subscription: { ...detailFixture().subscription, status: 'cancelled' } });
      expect(resolveSubscriptionSituation(d).visualState).toBe('cancelled');
    });
    it('preparando sem faturas', () => {
      const d = detailFixture({ timeline: [] });
      expect(resolveSubscriptionSituation(d).visualState).toBe('preparing');
    });
    it('erro com job snippet', () => {
      const d = detailFixture({
        timeline: [timelineRow({ operational_state: 'failed', job_error_snippet: 'BILLING_PLAN_NOT_FOUND' })],
      });
      expect(resolveSubscriptionSituation(d).hasError).toBe(true);
    });
    it('agendada com histórico pago', () => {
      const d = detailFixture({
        timeline: [timelineRow({ invoice_status: 'paid', operational_state: 'paid' })],
        automation_summary: {
          ...detailFixture().automation_summary,
          worker_status_pt: 'Cobrança agendada',
        },
      });
      expect(resolveSubscriptionSituation(d).label).toContain('agendada');
    });
    it('billingVisualStateLabel cobre todos', () => {
      expect(billingVisualStateLabel('generating')).toBe('Gerando cobrança');
      expect(billingVisualStateLabel('payment_pending')).toBe('Pagamento pendente');
    });
  });

  describe('próximos ciclos', () => {
    it('gera 12 ciclos', () => {
      expect(buildFutureCycles(detailFixture(), 12)).toHaveLength(12);
    });
    it('retorna vazio se cancelada', () => {
      const d = detailFixture({ subscription: { ...detailFixture().subscription, status: 'cancelled' } });
      expect(buildFutureCycles(d)).toHaveLength(0);
    });
    it('respeita max_cycles (Sprint 3)', () => {
      const d = detailFixture({
        subscription: {
          ...detailFixture().subscription,
          cycles_unlimited: false,
          max_cycles: 4,
        },
        cycles_raw: [
          {
            id: 'c1',
            cycle_date: '2026-05-14',
            period_start: '2026-05-14',
            period_end: '2026-06-14',
            status: 'invoiced',
            invoice_id: 'inv-a',
            job_id: null,
            processed_at: null,
            skipped_reason: null,
            error_message: null,
          },
          {
            id: 'c2',
            cycle_date: '2026-06-14',
            period_start: '2026-06-14',
            period_end: '2026-07-14',
            status: 'invoiced',
            invoice_id: 'inv-b',
            job_id: null,
            processed_at: null,
            skipped_reason: null,
            error_message: null,
          },
        ],
      });
      // max 4, emitted 2 → restantes 2
      expect(buildFutureCycles(d, 12)).toHaveLength(2);
    });
    it('subscriptionHeadlineStatus finalizada', () => {
      const d = detailFixture({ subscription: { ...detailFixture().subscription, status: 'completed' } });
      expect(subscriptionHeadlineStatus(d).label).toBe('Finalizada');
    });
    it('advanceBillingDueYmd weekly', () => {
      expect(advanceBillingDueYmd('2026-07-14', 'weekly')).toBe('2026-07-21');
    });
    it('advanceBillingDueYmd monthly', () => {
      expect(advanceBillingDueYmd('2026-07-14', 'monthly')).toBe('2026-08-14');
    });
    it('cada ciclo tem geração antes do vencimento', () => {
      const cycle = buildFutureCycles(detailFixture(), 1)[0];
      expect(cycle.generationYmd! < cycle.dueYmd).toBe(true);
    });
  });

  describe('header e layout', () => {
    it('subscriptionExperienceHeaderLines', () => {
      const lines = subscriptionExperienceHeaderLines(detailFixture());
      expect(lines.planName).toBe('Plano Premium');
      expect(lines.clientLabel).toBe('Empresa XPTO');
      expect(lines.amountLabel).toContain('R$');
    });
    it('subscriptionHeadlineStatus ativa', () => {
      expect(subscriptionHeadlineStatus(detailFixture()).label).toBe('Ativa');
    });
    it('subscriptionHeadlineStatus pausada', () => {
      const d = detailFixture({ subscription: { ...detailFixture().subscription, status: 'paused' } });
      expect(subscriptionHeadlineStatus(d).label).toBe('Pausada');
    });
    it('experienceLayoutColumns mobile', () => {
      expect(experienceLayoutColumns(400).main).toBe(1);
    });
    it('experienceLayoutColumns desktop', () => {
      expect(experienceLayoutColumns(1280).main).toBe(2);
    });
  });

  describe('técnico e geração', () => {
    it('resolveGenerationYmd com antecipação (weekly herda geral + cap 6)', () => {
      // fixture: weekly + geral=7 + weekly null → efetivo 6 → 2026-07-14 − 6 = 2026-07-08
      expect(resolveGenerationYmd('2026-07-14', detailFixture().tenant_billing, 'weekly')).toBe(
        '2026-07-08'
      );
    });
    it('resolveGenerationYmd weekly explícito =2', () => {
      const tb = {
        ...detailFixture().tenant_billing,
        recurring_invoice_generate_days_before_due: 7,
        recurring_invoice_generate_days_before_due_weekly: 2,
      };
      expect(resolveGenerationYmd('2026-07-14', tb, 'weekly')).toBe('2026-07-12');
    });
    it('resolveGenerationYmd monthly ignora weekly', () => {
      const tb = {
        ...detailFixture().tenant_billing,
        recurring_invoice_generate_days_before_due: 7,
        recurring_invoice_generate_days_before_due_weekly: 2,
      };
      expect(resolveGenerationYmd('2026-07-14', tb, 'monthly')).toBe('2026-07-07');
    });
    it('buildTechnicalDiagnostics', () => {
      const d = detailFixture({
        recent_jobs: [
          {
            id: 'job-1',
            cycle_key: '2026-07-14',
            status: 'failed',
            scheduled_at: '2026-07-07',
            retry_at: null,
            attempts: 2,
            max_attempts: 3,
            result_invoice_id: null,
            error_message: 'stack',
            completion_outcome: null,
            completion_detail: null,
            updated_at: '2026-07-07T10:00:00Z',
          },
        ],
      });
      const tech = buildTechnicalDiagnostics(d);
      expect(tech.jobId).toBe('job-1');
      expect(tech.engineVersion).toBe('3.0');
    });
  });
});
