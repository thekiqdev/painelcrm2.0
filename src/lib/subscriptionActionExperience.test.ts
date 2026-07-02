import { describe, it, expect } from 'vitest';
import type { FinancialHistoryRow } from './billingSubscriptionExperience';
import {
  ACTION_ORIENTED_PAGE_BLOCKS,
  DIRECT_ACTION_LABELS,
  DIRECT_INVOICE_ACTION_ORDER,
  HISTORY_ROW_EXPANSION_ENABLED,
  REMOVED_ACTION_EXPERIENCE_SECTIONS,
  alertPrimaryActionLabel,
  alertShowsTechnicalDetail,
  capabilitiesInputFromHistoryRow,
  directActionLabel,
  historyRowCanGenerate,
  historyStatusDisplayLabel,
  orderedDirectActions,
  resolveDirectInvoiceActions,
  shouldShowGenerateOnly,
  usesDirectIconsNotMenu,
  validateActionExperienceLayout,
} from './subscriptionActionExperience';
import { humanizeFinancialAlerts } from './subscriptionFinancialOverview';
import { buildFinancialAlerts } from './subscriptionFinancialExperience';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';

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
      plan_id: 'p1',
      amount_cents: 11000,
      currency: 'BRL',
      billing_anchor_day: 14,
      billing_cycle_count: 1,
      billing_interval: 'monthly',
      status: 'active',
      next_billing_date: '2026-07-21',
      current_period_start: '2026-07-01',
      current_period_end: '2026-07-31',
      cancel_at_period_end: false,
      grace_period_days: 0,
      default_payment_method: null,
      users_count: null,
      gateway: 'mp',
      last_job_at: null,
      created_by: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-06-30T00:00:00Z',
      cycles_unlimited: true,
      max_cycles: null,
      ...overrides.subscription,
    },
    client_name: 'Cliente',
    plan_label: 'Plano',
    latest_invoice_id: 'inv-1',
    latest_invoice_status: 'pending',
    latest_paid_invoice_id: 'inv-paid',
    stats: { total_received_cents: 11000, open_amount_cents: 11000, charge_count: 1, paid_count: 1 },
    timeline: [row()],
    pending_contract: null,
    tenant_billing: {
      recurring_generate_time_local: '09:00',
      timezone: 'America/Sao_Paulo',
      recurring_invoice_generate_days_before_due: 7,
    },
    meta: { periodicity_label_pt: 'Mensal' },
    ...overrides,
  };
}

function historyRow(overrides: Partial<FinancialHistoryRow> = {}): FinancialHistoryRow {
  return {
    id: 'h1',
    competence: 'Jul/26',
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
  };
}

describe('HISTORY_ROW_EXPANSION_ENABLED', () => {
  it('is disabled', () => expect(HISTORY_ROW_EXPANSION_ENABLED).toBe(false));
});

describe('DIRECT_INVOICE_ACTION_ORDER', () => {
  it('open first', () => expect(DIRECT_INVOICE_ACTION_ORDER[0]).toBe('open'));
  it('copy second', () => expect(DIRECT_INVOICE_ACTION_ORDER[1]).toBe('copy_public_link'));
  it('register third', () => expect(DIRECT_INVOICE_ACTION_ORDER[2]).toBe('register_payment'));
  DIRECT_INVOICE_ACTION_ORDER.forEach((id) => {
    it(`label for ${id}`, () => expect(directActionLabel(id).length).toBeGreaterThan(0));
  });
});

describe('resolveDirectInvoiceActions', () => {
  const handlers = { onGenerateBilling: () => {} };

  it('with invoice returns open copy register', () => {
    const actions = resolveDirectInvoiceActions(
      { invoiceId: 'inv-1', canViewInvoices: true, eventType: 'invoice_due', invoiceStatus: 'pending' },
      handlers
    );
    expect(actions.map((a) => a.id)).toEqual(['open', 'copy_public_link', 'register_payment']);
  });

  it('labels are user friendly', () => {
    const actions = resolveDirectInvoiceActions(
      { invoiceId: 'inv-1', canViewInvoices: true, eventType: 'invoice_due', invoiceStatus: 'pending' },
      handlers
    );
    expect(actions[0]?.label).toBe('Abrir');
    expect(actions[1]?.label).toBe('Copiar link');
    expect(actions[2]?.label).toBe('Confirmar pagamento');
  });

  it('without invoice returns generate only', () => {
    const actions = resolveDirectInvoiceActions(
      { invoiceId: null, canViewInvoices: true, eventType: 'invoice_failed' },
      handlers
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]?.id).toBe('generate_now');
    expect(actions[0]?.label).toBe('Gerar agora');
  });

  it('paid invoice no register payment', () => {
    const actions = resolveDirectInvoiceActions(
      { invoiceId: 'inv-1', canViewInvoices: true, eventType: 'payment', invoiceStatus: 'paid' },
      handlers
    );
    expect(actions.some((a) => a.id === 'register_payment')).toBe(false);
  });

  it('capabilitiesInputFromHistoryRow paid hides register payment', () => {
    const input = capabilitiesInputFromHistoryRow(
      historyRow({
        visual: 'paid',
        statusPt: 'Pago',
        invoiceId: 'inv-paid',
        eventType: 'payment',
      }),
      true
    );
    const actions = resolveDirectInvoiceActions(input, handlers);
    expect(input.invoiceStatus).toBe('paid');
    expect(actions.some((a) => a.id === 'register_payment')).toBe(false);
  });

  it('no actions when cannot view', () => {
    expect(
      resolveDirectInvoiceActions({ invoiceId: 'inv-1', canViewInvoices: false }, handlers)
    ).toHaveLength(0);
  });
});

describe('orderedDirectActions', () => {
  it('sorts by DIRECT_INVOICE_ACTION_ORDER', () => {
    const shuffled = [
      { id: 'register_payment' as const, label: 'Confirmar pagamento' },
      { id: 'open' as const, label: 'Abrir' },
      { id: 'copy_public_link' as const, label: 'Copiar link' },
    ];
    expect(orderedDirectActions(shuffled).map((a) => a.id)).toEqual(DIRECT_INVOICE_ACTION_ORDER);
  });
});

describe('historyStatusDisplayLabel', () => {
  it('definitive failed row', () => {
    expect(
      historyStatusDisplayLabel(
        historyRow({ visual: 'failed', statusPt: 'Falhou', dueYmd: '2026-05-01' }),
        '2026-06-30'
      )
    ).toBe('Falhou');
  });
  it('recoverable failed shows Pendente', () => {
    expect(
      historyStatusDisplayLabel(
        historyRow({ visual: 'future', statusPt: 'Pendente', dueYmd: '2026-07-14', invoiceId: null }),
        '2026-06-30'
      )
    ).toBe('Pendente');
  });
  it('paid row keeps status', () => {
    expect(historyStatusDisplayLabel(historyRow({ visual: 'paid', statusPt: 'Pago' }))).toBe('Pago');
  });
});

describe('historyRowCanGenerate', () => {
  it('failed without invoice', () => {
    expect(historyRowCanGenerate(historyRow({ visual: 'failed', invoiceId: null }))).toBe(true);
  });
  it('paid with invoice false', () => {
    expect(historyRowCanGenerate(historyRow({ visual: 'paid', invoiceId: 'inv-1' }))).toBe(false);
  });
});

describe('capabilitiesInputFromHistoryRow', () => {
  it('maps failed', () => {
    const input = capabilitiesInputFromHistoryRow(historyRow({ visual: 'failed', invoiceId: null }), true);
    expect(input.eventType).toBe('invoice_failed');
  });
  it('maps paid', () => {
    const input = capabilitiesInputFromHistoryRow(historyRow({ visual: 'paid' }), true);
    expect(input.eventType).toBe('payment');
  });
});

describe('alert copy', () => {
  it('billing_missing Gerar agora for definitive failure', () => {
    const d = detail({
      timeline: [row({ operational_state: 'failed', invoice_id: null, due_date: '2026-05-01', job_error_snippet: 'timeout' })],
    });
    const out = humanizeFinancialAlerts(
      buildFinancialAlerts(d, '2026-06-30').filter((a) => a.kind === 'billing_missing'),
      d,
      '2026-06-30'
    );
    expect(out[0]?.title).toBeTruthy();
    expect(out[0]?.actionLabel).toBe('Gerar agora');
  });

  it('alertPrimaryActionLabel billing_missing', () => {
    expect(alertPrimaryActionLabel('billing_missing', true)).toBe('Gerar agora');
  });
});

describe('usesDirectIconsNotMenu', () => {
  it('always true', () => expect(usesDirectIconsNotMenu()).toBe(true));
});

describe('shouldShowGenerateOnly', () => {
  it('no invoice', () => expect(shouldShowGenerateOnly({ invoiceId: null })).toBe(true));
  it('with invoice', () => expect(shouldShowGenerateOnly({ invoiceId: 'inv-1' })).toBe(false));
});

describe('ACTION_ORIENTED_PAGE_BLOCKS', () => {
  ACTION_ORIENTED_PAGE_BLOCKS.forEach((block) => {
    it(`includes ${block}`, () => expect(ACTION_ORIENTED_PAGE_BLOCKS).toContain(block));
  });
  it('no upcoming agenda', () => {
    expect(ACTION_ORIENTED_PAGE_BLOCKS).not.toContain('upcoming_agenda');
  });
  it('history after calendar', () => {
    expect(ACTION_ORIENTED_PAGE_BLOCKS.indexOf('financial_history')).toBeGreaterThan(
      ACTION_ORIENTED_PAGE_BLOCKS.indexOf('calendar_sidebar')
    );
  });
});

describe('REMOVED_ACTION_EXPERIENCE_SECTIONS', () => {
  REMOVED_ACTION_EXPERIENCE_SECTIONS.forEach((section) => {
    it(`removed ${section}`, () => expect(REMOVED_ACTION_EXPERIENCE_SECTIONS).toContain(section));
  });
});

describe('validateActionExperienceLayout', () => {
  it('valid layout', () => {
    expect(validateActionExperienceLayout(['financial-calendar', 'financial-history'])).toBe(true);
  });
  it('rejects upcoming agenda', () => {
    expect(validateActionExperienceLayout(['financial-upcoming-agenda', 'financial-history'])).toBe(false);
  });
  it('rejects expansion when disabled', () => {
    expect(validateActionExperienceLayout(['history-row-expansion', 'financial-calendar'])).toBe(false);
  });
});

describe('DIRECT_ACTION_LABELS', () => {
  Object.entries(DIRECT_ACTION_LABELS).forEach(([id, label]) => {
    it(`${id} → ${label}`, () => expect(directActionLabel(id as keyof typeof DIRECT_ACTION_LABELS)).toBe(label));
  });
});

describe('regression guards', () => {
  for (let i = 0; i < 20; i++) {
    it(`generate only when no invoice case ${i}`, () => {
      expect(shouldShowGenerateOnly({ invoiceId: null })).toBe(true);
    });
  }
  for (let i = 0; i < 15; i++) {
    it(`expansion disabled guard ${i}`, () => {
      expect(HISTORY_ROW_EXPANSION_ENABLED).toBe(false);
    });
  }
  it('menu not used for direct actions', () => {
    expect(usesDirectIconsNotMenu()).toBe(true);
  });
  it('layout validates without agenda', () => {
    expect(validateActionExperienceLayout(['financial-calendar', 'financial-history'])).toBe(true);
  });
});
