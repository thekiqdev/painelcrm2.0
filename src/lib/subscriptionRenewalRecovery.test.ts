import { describe, it, expect } from 'vitest';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';
import { buildFinancialEvents } from './subscriptionFinancialEventBuilder';
import { buildFinancialAlerts } from './subscriptionFinancialExperience';
import { buildFinancialHistoryRows } from './billingSubscriptionExperience';
import { historyStatusDisplayLabel, historyRowCanGenerate } from './subscriptionActionExperience';
import {
  buildWorkerHistoryEntries,
  findNextChargeTimelineRow,
  historyFinancialStatusLabel,
  isDefinitiveCycleFailure,
  isJsDateStringFormat,
  isRecoverableCycleFailure,
  mapHistoryFinancialStatus,
  sanitizeBillingDateInput,
  workerHistoryFromJob,
} from './subscriptionRenewalRecovery';
import {
  formatCompetenceRange,
  formatNextInvoiceDateLong,
  resolveNextInvoiceExperience,
} from './subscriptionNextInvoice';

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
      total_received_cents: 0,
      open_amount_cents: 0,
      charge_count: 0,
      paid_count: 0,
    },
    timeline: [timelineRow()],
    automation_summary: {
      last_generation_at: null,
      last_generation_label: null,
      next_generation_ymd: '2026-07-14',
      next_charge_ymd: '2026-07-14',
    },
    cycles_raw: [],
    cycles_read_enabled: false,
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

describe('sanitizeBillingDateInput', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(sanitizeBillingDateInput('2026-07-14')).toBe('2026-07-14');
  });

  it('accepts ISO datetime', () => {
    expect(sanitizeBillingDateInput('2026-07-14T12:00:00Z')).toBe('2026-07-14');
  });

  it('accepts Date instance as ISO', () => {
    expect(sanitizeBillingDateInput(new Date('2026-07-14T12:00:00Z'))).toBe('2026-07-14');
  });

  it('parses Date.toString() via Date.parse', () => {
    const raw = new Date('2026-06-30T12:00:00Z').toString();
    expect(isJsDateStringFormat(raw)).toBe(true);
    expect(sanitizeBillingDateInput(raw)).toBe('2026-06-30');
  });

  it('rejects invalid garbage', () => {
    expect(sanitizeBillingDateInput('not-a-date')).toBeNull();
  });

  it('rejects empty', () => {
    expect(sanitizeBillingDateInput('')).toBeNull();
    expect(sanitizeBillingDateInput(null)).toBeNull();
  });

  it.each([
    'Tue Jun 30',
    'Tue Jun 30 2026',
    'Mon Jan 01 2025',
  ])('detects js date string %s', (s) => {
    expect(isJsDateStringFormat(s)).toBe(true);
  });
});

describe('isRecoverableCycleFailure', () => {
  it('failed without invoice and future due is recoverable', () => {
    expect(
      isRecoverableCycleFailure(
        timelineRow({ operational_state: 'failed', invoice_id: null, due_date: '2026-07-14' }),
        today
      )
    ).toBe(true);
  });

  it('failed with invoice is not recoverable', () => {
    expect(
      isRecoverableCycleFailure(
        timelineRow({ operational_state: 'failed', invoice_id: 'inv-1', due_date: '2026-07-14' }),
        today
      )
    ).toBe(false);
  });

  it('failed with past due is definitive', () => {
    expect(isRecoverableCycleFailure(timelineRow({ operational_state: 'failed', due_date: '2026-06-01' }), today)).toBe(
      false
    );
    expect(isDefinitiveCycleFailure(timelineRow({ operational_state: 'failed', due_date: '2026-06-01' }), today)).toBe(
      true
    );
  });

  it('due today is recoverable', () => {
    expect(isRecoverableCycleFailure(timelineRow({ operational_state: 'failed', due_date: today }), today)).toBe(true);
  });

  it('cycle_status failed without invoice is recoverable when future', () => {
    expect(
      isRecoverableCycleFailure(
        timelineRow({ operational_state: 'awaiting_generation', cycle_status: 'failed', due_date: '2026-08-01' }),
        today
      )
    ).toBe(true);
  });
});

describe('mapHistoryFinancialStatus', () => {
  it('maps paid', () => {
    expect(mapHistoryFinancialStatus(timelineRow({ invoice_status: 'paid', operational_state: 'paid' }), today)).toBe(
      'paga'
    );
  });

  it('maps recoverable failed to pendente', () => {
    expect(
      mapHistoryFinancialStatus(timelineRow({ operational_state: 'failed', invoice_id: null, due_date: '2026-07-14' }), today)
    ).toBe('pendente');
  });

  it('maps definitive failed to falhou', () => {
    expect(
      mapHistoryFinancialStatus(timelineRow({ operational_state: 'failed', invoice_id: null, due_date: '2026-05-01' }), today)
    ).toBe('falhou');
  });

  it('maps future without invoice to prevista', () => {
    expect(
      mapHistoryFinancialStatus(
        timelineRow({ operational_state: 'scheduled', invoice_id: null, due_date: '2026-12-01' }),
        today
      )
    ).toBe('prevista');
  });

  it('maps invoice pending to emitida', () => {
    expect(
      mapHistoryFinancialStatus(
        timelineRow({ invoice_id: 'inv-1', invoice_status: 'pending', operational_state: 'generated' }),
        today
      )
    ).toBe('emitida');
  });

  it.each(['prevista', 'pendente', 'emitida', 'paga', 'cancelada', 'reembolsada', 'falhou'] as const)(
    'label for %s',
    (status) => {
      expect(historyFinancialStatusLabel(status)).toBeTruthy();
    }
  );
});

describe('resolveNextInvoiceExperience', () => {
  it('shows pending when no invoice', () => {
    const next = resolveNextInvoiceExperience(detail(), today);
    expect(next.hasInvoice).toBe(false);
    expect(next.statusLabel).toBe('Prevista');
    expect(next.action).toBe('generate');
    expect(next.actionLabel).toBe('Gerar cobrança');
  });

  it('shows open action when candidate row has invoice (edge)', () => {
    const next = resolveNextInvoiceExperience(
      detail({
        timeline: [
          timelineRow({
            invoice_id: 'inv-abc-1234',
            invoice_status: 'pending',
            operational_state: 'generated',
          }),
          timelineRow({
            due_date: '2026-07-21',
            cycle_date: '2026-07-21',
            cycle_id: 'c2',
            invoice_id: null,
          }),
        ],
      }),
      today
    );
    expect(next.hasInvoice).toBe(false);
    expect(next.action).toBe('generate');
    expect(next.dueYmd).toBe('2026-07-21');
  });

  it('recoverable failure still pending', () => {
    const next = resolveNextInvoiceExperience(
      detail({
        timeline: [
          timelineRow({
            operational_state: 'failed',
            job_error_snippet: 'invalid input syntax for type date',
            due_date: '2026-07-14',
          }),
        ],
        recent_jobs: [
          {
            id: 'job-1',
            cycle_key: '2026-07-14',
            status: 'failed',
            scheduled_at: '2026-06-30T08:00:00Z',
            retry_at: null,
            attempts: 1,
            max_attempts: 3,
            result_invoice_id: null,
            error_message: 'invalid input syntax for type date: "Tue Jun 30"',
            completion_outcome: null,
            completion_detail: null,
            updated_at: '2026-06-30T09:00:00Z',
          },
        ],
      }),
      today
    );
    expect(next.statusLabel).toBe('Prevista');
    expect(next.isRecoverableFailure).toBe(true);
    expect(next.workerHistory.length).toBeGreaterThan(0);
  });

  it('formats date and amount', () => {
    const next = resolveNextInvoiceExperience(detail(), today);
    expect(next.dateLabel).toBe('14 Jul 2026');
    expect(next.amountLabel).toContain('110');
  });

  it('formats competence range', () => {
    expect(formatCompetenceRange('2026-07-14', '2026-07-21', '2026-07-14')).toContain('→');
  });

  it('formatNextInvoiceDateLong', () => {
    expect(formatNextInvoiceDateLong('2026-07-14')).toBe('14 Jul 2026');
  });
});

describe('buildFinancialEvents recovery', () => {
  it('recoverable failed emits upcoming_cycle not invoice_failed', () => {
    const events = buildFinancialEvents(
      detail({
        timeline: [timelineRow({ operational_state: 'failed', job_error_snippet: 'err' })],
      }),
      today
    );
    expect(events.some((e) => e.type === 'upcoming_cycle' && e.ymd === '2026-07-14')).toBe(true);
    expect(events.some((e) => e.type === 'invoice_failed')).toBe(false);
  });

  it('definitive failed emits invoice_failed', () => {
    const events = buildFinancialEvents(
      detail({
        timeline: [timelineRow({ operational_state: 'failed', due_date: '2026-05-01', cycle_date: '2026-05-01' })],
      }),
      today
    );
    expect(events.some((e) => e.type === 'invoice_failed')).toBe(true);
  });
});

describe('buildFinancialAlerts recovery', () => {
  it('no billing_missing alert for recoverable failure', () => {
    const alerts = buildFinancialAlerts(
      detail({ timeline: [timelineRow({ operational_state: 'failed' })] }),
      today
    );
    expect(alerts.some((a) => a.kind === 'billing_missing')).toBe(false);
  });

  it('billing_missing for definitive failure', () => {
    const alerts = buildFinancialAlerts(
      detail({ timeline: [timelineRow({ operational_state: 'failed', due_date: '2026-05-01' })] }),
      today
    );
    expect(alerts.some((a) => a.kind === 'billing_missing')).toBe(true);
  });
});

describe('buildFinancialHistoryRows recovery', () => {
  it('recoverable failed shows Prevista without error in notes', () => {
    const rows = buildFinancialHistoryRows(
      detail({
        timeline: [timelineRow({ operational_state: 'failed', job_error_snippet: 'timeout' })],
      }),
      today
    );
    expect(rows[0]?.statusPt).toBe('Prevista');
    expect(rows[0]?.notes ?? '').not.toContain('timeout');
    expect(rows[0]?.visual).toBe('future');
  });

  it('definitive failed keeps error notes', () => {
    const rows = buildFinancialHistoryRows(
      detail({
        timeline: [timelineRow({ operational_state: 'failed', due_date: '2026-05-01', job_error_snippet: 'timeout' })],
      }),
      today
    );
    const failedRow = rows.find((r) => r.notes?.toLowerCase().includes('timeout'));
    expect(failedRow?.notes).toBeTruthy();
  });
});

describe('historyStatusDisplayLabel recovery', () => {
  it('recoverable failed row shows Prevista', () => {
    const row = buildFinancialHistoryRows(
      detail({ timeline: [timelineRow({ operational_state: 'failed' })] }),
      today
    )[0]!;
    expect(historyStatusDisplayLabel(row, today)).toBe('Prevista');
  });

  it('historyRowCanGenerate only when canGenerateNow', () => {
    const row = buildFinancialHistoryRows(
      detail({ timeline: [timelineRow({ operational_state: 'failed' })] }),
      today
    )[0]!;
    expect(historyRowCanGenerate({ ...row, canGenerateNow: true }, today)).toBe(true);
    expect(historyRowCanGenerate(row, today)).toBe(row.canGenerateNow === true);
  });
});

describe('worker history', () => {
  it('builds from recent_jobs', () => {
    const entries = buildWorkerHistoryEntries(
      detail({
        recent_jobs: [
          {
            id: 'j1',
            cycle_key: '2026-07-14',
            status: 'failed',
            scheduled_at: '2026-06-30T08:00:00Z',
            retry_at: null,
            attempts: 1,
            max_attempts: 3,
            result_invoice_id: null,
            error_message: 'invalid input syntax for type date: "Tue Jun 30"',
            completion_outcome: null,
            completion_detail: null,
            updated_at: '2026-06-30T09:00:00Z',
          },
        ],
      })
    );
    expect(entries[0]?.error).toContain('invalid input syntax');
    expect(entries[0]?.label).toContain('Tentativa');
  });

  it('workerHistoryFromJob returns null without error on completed', () => {
    expect(
      workerHistoryFromJob({
        id: 'j1',
        cycle_key: '2026-07-14',
        status: 'completed',
        scheduled_at: '',
        retry_at: null,
        attempts: 1,
        max_attempts: 3,
        result_invoice_id: 'inv',
        error_message: null,
        completion_outcome: null,
        completion_detail: null,
        updated_at: '2026-06-30T09:00:00Z',
      })
    ).toBeNull();
  });
});

describe('findNextChargeTimelineRow', () => {
  it('matches next_charge_ymd', () => {
    const row = findNextChargeTimelineRow(detail(), today);
    expect(row?.due_date).toBe('2026-07-14');
  });

  it('picks first cycle without invoice (ignores stale next_charge_ymd)', () => {
    const row = findNextChargeTimelineRow(
      detail({
        automation_summary: { ...detail().automation_summary, next_charge_ymd: '2026-08-01' },
        timeline: [
          timelineRow({ due_date: '2026-07-14', cycle_date: '2026-07-14' }),
          timelineRow({ due_date: '2026-08-01', cycle_date: '2026-08-01', cycle_id: 'c2' }),
        ],
      }),
      today
    );
    expect(row?.due_date).toBe('2026-07-14');
  });
});

describe('next invoice always visible', () => {
  it('visible for active subscription', () => {
    expect(resolveNextInvoiceExperience(detail(), today).visible).toBe(true);
  });

  it('has action labels', () => {
    const without = resolveNextInvoiceExperience(detail(), today);
    const afterInvoiced = resolveNextInvoiceExperience(
      detail({ timeline: [timelineRow({ invoice_id: 'inv-1', operational_state: 'generated' })] }),
      today
    );
    expect(without.actionLabel).toBe('Gerar cobrança');
    expect(afterInvoiced.actionLabel).toBe('Gerar cobrança');
    expect(afterInvoiced.dueYmd).toBe('2026-07-21');
  });
});

describe('ISO date matrix', () => {
  const samples = [
    ['2026-07-14', '2026-07-14'],
    ['2026-07-14T00:00:00.000Z', '2026-07-14'],
    [new Date('2026-07-14T12:00:00Z'), '2026-07-14'],
  ] as const;

  it.each(samples)('sanitizes %s', (input, expected) => {
    expect(sanitizeBillingDateInput(input)).toBe(expected);
  });
});

describe('manual generate flow expectations', () => {
  it('pending before invoice then promotes to next competency', () => {
    const before = resolveNextInvoiceExperience(detail(), today);
    expect(before.hasInvoice).toBe(false);
    const after = resolveNextInvoiceExperience(
      detail({
        timeline: [
          timelineRow({
            invoice_id: 'new-inv',
            invoice_status: 'pending',
            operational_state: 'generated',
          }),
        ],
        latest_invoice_id: 'new-inv',
      }),
      today
    );
    expect(after.hasInvoice).toBe(false);
    expect(after.dueYmd).toBe('2026-07-21');
    expect(after.actionLabel).toBe('Gerar cobrança');
  });
});

describe('retry and worker labels', () => {
  it('retry job label', () => {
    const entry = workerHistoryFromJob({
      id: 'j2',
      cycle_key: '2026-07-14',
      status: 'failed',
      scheduled_at: '',
      retry_at: '2026-07-01T10:00:00Z',
      attempts: 2,
      max_attempts: 5,
      result_invoice_id: null,
      error_message: 'worker timeout',
      completion_outcome: null,
      completion_detail: null,
      updated_at: '2026-07-01T10:00:00Z',
    });
    expect(entry?.label).toContain('retry');
  });
});

describe('weekly and monthly competence', () => {
  it('weekly subscription competence', () => {
    const next = resolveNextInvoiceExperience(
      detail({
        subscription: { ...detail().subscription, billing_interval: 'weekly' },
      }),
      today
    );
    expect(next.competenceLabel).toContain('→');
  });

  it('monthly subscription', () => {
    const next = resolveNextInvoiceExperience(
      detail({
        subscription: {
          ...detail().subscription,
          billing_interval: 'monthly',
          next_billing_date: '2026-07-15',
        },
        timeline: [timelineRow({ due_date: '2026-07-15', period_start: '2026-07-15', period_end: '2026-08-15' })],
        automation_summary: { ...detail().automation_summary, next_charge_ymd: '2026-07-15' },
      }),
      today
    );
    expect(next.dueYmd).toBe('2026-07-15');
  });
});

describe('paused and cancelled', () => {
  it('paused status', () => {
    const next = resolveNextInvoiceExperience(
      detail({ subscription: { ...detail().subscription, status: 'paused' } }),
      today
    );
    expect(next.statusLabel).toBe('Pausada');
  });

  it('paid invoice promotes to next competency', () => {
    const next = resolveNextInvoiceExperience(
      detail({
        timeline: [
          timelineRow({ invoice_id: 'inv-p', invoice_status: 'paid', operational_state: 'paid' }),
        ],
      }),
      today
    );
    expect(next.statusLabel).toBe('Prevista');
    expect(next.dueYmd).toBe('2026-07-21');
    expect(next.hasInvoice).toBe(false);
  });
});

describe('edge cases', () => {
  it('empty timeline uses subscription next_billing_date', () => {
    const next = resolveNextInvoiceExperience(detail({ timeline: [] }), today);
    expect(next.dueYmd).toBe('2026-07-14');
  });

  it('gateway failed with invoice is not recoverable cycle failure', () => {
    expect(
      isRecoverableCycleFailure(
        timelineRow({
          operational_state: 'gateway_failed',
          invoice_id: 'inv-1',
          due_date: '2026-07-14',
        }),
        today
      )
    ).toBe(false);
  });
});

describe('status label matrix', () => {
  const cases: Array<[string, Partial<CrmSubscriptionTimelineRow>, string]> = [
    ['paid', { invoice_id: 'i', invoice_status: 'paid', operational_state: 'paid' }, 'paga'],
    ['cancelled', { invoice_id: 'i', invoice_status: 'cancelled', operational_state: 'cancelled' }, 'cancelada'],
    ['emitida', { invoice_id: 'i', invoice_status: 'pending', operational_state: 'generated' }, 'emitida'],
    ['recoverable', { operational_state: 'failed', invoice_id: null, due_date: '2026-08-01' }, 'pendente'],
    ['definitive', { operational_state: 'failed', invoice_id: null, due_date: '2026-04-01' }, 'falhou'],
  ];
  it.each(cases)('maps %s', (_name, overrides, expected) => {
    expect(mapHistoryFinancialStatus(timelineRow(overrides), today)).toBe(expected);
  });
});

describe('sanitizeBillingDateInput matrix', () => {
  it.each([
    ['2026-01-01', '2026-01-01'],
    ['2026-12-31T23:59:59Z', '2026-12-31'],
    ['', null],
    ['Tue Jun 30 2026 12:00:00 GMT+0000', '2026-06-30'],
  ] as const)('input %s', (input, expected) => {
    expect(sanitizeBillingDateInput(input)).toBe(expected);
  });
});

describe('worker history ordering', () => {
  it('sorts newest first', () => {
    const entries = buildWorkerHistoryEntries(
      detail({
        recent_jobs: [
          {
            id: 'old',
            cycle_key: '2026-07-01',
            status: 'failed',
            scheduled_at: '2026-06-01T08:00:00Z',
            retry_at: null,
            attempts: 1,
            max_attempts: 3,
            result_invoice_id: null,
            error_message: 'old error',
            completion_outcome: null,
            completion_detail: null,
            updated_at: '2026-06-01T09:00:00Z',
          },
          {
            id: 'new',
            cycle_key: '2026-07-14',
            status: 'failed',
            scheduled_at: '2026-06-30T08:00:00Z',
            retry_at: null,
            attempts: 1,
            max_attempts: 3,
            result_invoice_id: null,
            error_message: 'new error',
            completion_outcome: null,
            completion_detail: null,
            updated_at: '2026-06-30T09:00:00Z',
          },
        ],
      })
    );
    expect(entries[0]?.id).toBe('new');
  });
});

describe('next invoice action always present', () => {
  it.each(['active', 'paused'] as const)('subscription %s has action label', (status) => {
    const next = resolveNextInvoiceExperience(
      detail({ subscription: { ...detail().subscription, status } }),
      today
    );
    expect(next.actionLabel.length).toBeGreaterThan(0);
  });
});

describe('history financial labels complete', () => {
  it.each(['prevista', 'pendente', 'emitida', 'paga', 'cancelada', 'reembolsada', 'falhou'] as const)(
    'label %s',
    (status) => {
      expect(historyFinancialStatusLabel(status)).toMatch(/^[A-Z]/);
    }
  );
});

describe('definitive vs recoverable boundary', () => {
  it('yesterday is definitive', () => {
    expect(isDefinitiveCycleFailure(timelineRow({ operational_state: 'failed', due_date: '2026-06-29' }), today)).toBe(
      true
    );
  });
  it('today is recoverable', () => {
    expect(isRecoverableCycleFailure(timelineRow({ operational_state: 'failed', due_date: today }), today)).toBe(
      true
    );
  });
  it('tomorrow is recoverable', () => {
    expect(isRecoverableCycleFailure(timelineRow({ operational_state: 'failed', due_date: '2026-07-01' }), today)).toBe(
      true
    );
  });
  it('invoice blocks recoverable', () => {
    expect(
      isRecoverableCycleFailure(
        timelineRow({ operational_state: 'failed', invoice_id: 'x', due_date: '2026-08-01' }),
        today
      )
    ).toBe(false);
  });
});
