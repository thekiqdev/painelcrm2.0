import { describe, it, expect } from 'vitest';
import {
  buildActionsFromCapabilities,
  resolveInvoiceAvailableActions,
  invoiceStatusFromEventType,
  type InvoiceActionId,
} from './invoiceAvailableActions';
import {
  INVOICE_PDF_FEATURE_ENABLED,
  resolveInvoiceCapabilities,
  type InvoiceCapabilities,
} from './invoiceCapabilities';

function caps(overrides: Partial<InvoiceCapabilities>): InvoiceCapabilities {
  return {
    supportsPdf: false,
    supportsPublicUrl: false,
    supportsEmail: false,
    supportsPix: false,
    supportsGateway: false,
    supportsOpen: false,
    supportsRegisterPayment: false,
    supportsGenerate: false,
    supportsChangeDue: false,
    supportsViewHistory: false,
    supportsResolve: false,
    supportsReprocess: false,
    ...overrides,
  };
}

describe('resolveInvoiceCapabilities', () => {
  it('paid invoice has open copy send', () => {
    const c = resolveInvoiceCapabilities({
      invoiceId: 'inv-1',
      invoiceStatus: 'paid',
      eventType: 'payment',
      canViewInvoices: true,
    });
    expect(c.supportsOpen).toBe(true);
    expect(c.supportsPublicUrl).toBe(true);
    expect(c.supportsEmail).toBe(true);
    expect(c.supportsRegisterPayment).toBe(false);
    expect(c.supportsPdf).toBe(false);
  });

  it('pending invoice allows register payment', () => {
    const c = resolveInvoiceCapabilities({
      invoiceId: 'inv-1',
      invoiceStatus: 'pending',
      eventType: 'invoice_due',
      canViewInvoices: true,
    });
    expect(c.supportsRegisterPayment).toBe(true);
  });

  it('forecast without invoice allows generate and change due', () => {
    const c = resolveInvoiceCapabilities({
      invoiceId: null,
      eventType: 'upcoming_cycle',
      canViewInvoices: true,
    });
    expect(c.supportsGenerate).toBe(true);
    expect(c.supportsChangeDue).toBe(true);
    expect(c.supportsOpen).toBe(false);
  });

  it('failed without invoice allows resolve', () => {
    const c = resolveInvoiceCapabilities({
      invoiceId: null,
      eventType: 'invoice_failed',
      canViewInvoices: true,
    });
    expect(c.supportsResolve).toBe(true);
    expect(c.supportsGenerate).toBe(true);
  });

  it('failed with invoice allows reprocess', () => {
    const c = resolveInvoiceCapabilities({
      invoiceId: 'inv-f',
      eventType: 'invoice_failed',
      canViewInvoices: true,
    });
    expect(c.supportsReprocess).toBe(true);
  });

  it('hides all when cannot view invoices', () => {
    const c = resolveInvoiceCapabilities({
      invoiceId: 'inv-1',
      invoiceStatus: 'paid',
      canViewInvoices: false,
    });
    expect(c.supportsOpen).toBe(false);
    expect(c.supportsPublicUrl).toBe(false);
  });

  it('pdf disabled by default', () => {
    expect(INVOICE_PDF_FEATURE_ENABLED).toBe(false);
    const c = resolveInvoiceCapabilities({ invoiceId: 'x', canViewInvoices: true });
    expect(c.supportsPdf).toBe(false);
  });

  it('pdf when capability enabled manually', () => {
    const actions = buildActionsFromCapabilities(
      caps({ supportsPdf: true, supportsOpen: true }),
      undefined
    );
    expect(actions.some((a) => a.id === 'download_pdf')).toBe(true);
  });

  it('no pdf action when capability false', () => {
    const actions = resolveInvoiceAvailableActions({
      invoiceId: 'inv-1',
      invoiceStatus: 'paid',
      canViewInvoices: true,
    });
    expect(actions.some((a) => a.id === 'download_pdf')).toBe(false);
  });

  it('gateway flag', () => {
    const c = resolveInvoiceCapabilities({
      invoiceId: 'inv-1',
      gateway: 'mercadopago',
      canViewInvoices: true,
    });
    expect(c.supportsGateway).toBe(true);
  });
});

describe('resolveInvoiceAvailableActions', () => {
  it('paid actions order', () => {
    const actions = resolveInvoiceAvailableActions({
      invoiceId: 'inv-paid',
      invoiceStatus: 'paid',
      eventType: 'payment',
      canViewInvoices: true,
    });
    const ids = actions.map((a) => a.id);
    expect(ids).toContain('open');
    expect(ids).toContain('copy_public_link');
    expect(ids).toContain('send_again');
    expect(ids).not.toContain('register_payment');
  });

  it('pending actions include register', () => {
    const actions = resolveInvoiceAvailableActions({
      invoiceId: 'inv-p',
      invoiceStatus: 'pending',
      eventType: 'invoice_due',
      canViewInvoices: true,
    });
    expect(actions.map((a) => a.id)).toContain('register_payment');
  });

  it('forecast with handlers', () => {
    const actions = resolveInvoiceAvailableActions(
      { invoiceId: null, eventType: 'upcoming_cycle', canViewInvoices: true },
      { onGenerateBilling: () => {}, onChangeDue: () => {} }
    );
    expect(actions.map((a) => a.id)).toEqual(
      expect.arrayContaining(['generate_now', 'change_due'])
    );
  });

  it('view history when handler provided', () => {
    const actions = resolveInvoiceAvailableActions(
      { invoiceId: 'inv-1', invoiceStatus: 'paid', canViewInvoices: true },
      { onViewHistory: () => {} }
    );
    expect(actions.some((a) => a.id === 'view_history')).toBe(true);
  });

  it('labels match spec', () => {
    const actions = resolveInvoiceAvailableActions({
      invoiceId: 'inv-1',
      invoiceStatus: 'paid',
      canViewInvoices: true,
    });
    const open = actions.find((a) => a.id === 'open');
    expect(open?.label).toBe('Abrir cobrança');
    const copy = actions.find((a) => a.id === 'copy_public_link');
    expect(copy?.label).toBe('Copiar link público');
  });

  it('no duplicate action ids', () => {
    const actions = resolveInvoiceAvailableActions(
      {
        invoiceId: 'inv-1',
        invoiceStatus: 'pending',
        eventType: 'invoice_failed',
        canViewInvoices: true,
      },
      { onGenerateBilling: () => {} }
    );
    const ids = actions.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('invoiceStatusFromEventType', () => {
  const cases: [import('./financialEventTypes').FinancialEventType, string | null][] = [
    ['payment', 'paid'],
    ['invoice_due', 'pending'],
    ['invoice_generated', 'pending'],
    ['invoice_failed', 'failed'],
    ['invoice_cancelled', 'cancelled'],
    ['invoice_refunded', 'refunded'],
    ['upcoming_cycle', null],
  ];
  for (const [type, status] of cases) {
    it(`${type} → ${status}`, () => {
      expect(invoiceStatusFromEventType(type)).toBe(status);
    });
  }
});

describe('buildActionsFromCapabilities matrix', () => {
  const ids: InvoiceActionId[] = [
    'open',
    'copy_public_link',
    'send_again',
    'download_pdf',
    'register_payment',
    'generate_now',
    'change_due',
    'resolve',
    'reprocess',
    'view_history',
  ];

  for (const id of ids) {
    it(`can include ${id} when capability on`, () => {
      const key = {
        open: 'supportsOpen',
        copy_public_link: 'supportsPublicUrl',
        send_again: 'supportsEmail',
        download_pdf: 'supportsPdf',
        register_payment: 'supportsRegisterPayment',
        generate_now: 'supportsGenerate',
        change_due: 'supportsChangeDue',
        resolve: 'supportsResolve',
        reprocess: 'supportsReprocess',
        view_history: 'supportsViewHistory',
      }[id] as keyof InvoiceCapabilities;
      const partial = caps({ [key]: true } as Partial<InvoiceCapabilities>);
      const handlers =
        id === 'generate_now' || id === 'resolve' || id === 'reprocess'
          ? { onGenerateBilling: () => {} }
          : id === 'change_due'
            ? { onChangeDue: () => {} }
            : id === 'view_history'
              ? { onViewHistory: () => {} }
              : undefined;
      const actions = buildActionsFromCapabilities(partial, handlers);
      expect(actions.some((a) => a.id === id)).toBe(true);
    });
  }
});

describe('PDF feature flag scenarios', () => {
  const statuses = ['paid', 'pending', 'overdue', 'failed'];
  for (const status of statuses) {
    it(`no pdf for ${status} when flag off`, () => {
      const actions = resolveInvoiceAvailableActions({
        invoiceId: `inv-${status}`,
        invoiceStatus: status,
        canViewInvoices: true,
      });
      expect(actions.some((a) => a.id === 'download_pdf')).toBe(false);
    });
  }

  it('pdf appears when supportsPdf true', () => {
    const actions = buildActionsFromCapabilities(
      caps({ supportsPdf: true, supportsOpen: true }),
      undefined
    );
    expect(actions.find((a) => a.id === 'download_pdf')?.label).toBe('Baixar PDF');
  });
});

describe('capability combinations', () => {
  const combos = [
    { invoiceId: null, eventType: 'upcoming_cycle' as const },
    { invoiceId: 'a', eventType: 'payment' as const, invoiceStatus: 'paid' },
    { invoiceId: 'b', eventType: 'invoice_due' as const, invoiceStatus: 'pending' },
    { invoiceId: null, eventType: 'invoice_failed' as const },
    { invoiceId: 'c', eventType: 'manual_charge' as const, invoiceStatus: 'pending' },
    { invoiceId: 'd', eventType: 'charge_attempt' as const, invoiceStatus: 'pending' },
    { invoiceId: 'e', eventType: 'invoice_cancelled' as const, invoiceStatus: 'cancelled' },
    { invoiceId: 'f', eventType: 'invoice_refunded' as const, invoiceStatus: 'refunded' },
  ];

  for (const combo of combos) {
    it(`resolves actions for ${combo.eventType}`, () => {
      const actions = resolveInvoiceAvailableActions(
        { ...combo, canViewInvoices: true },
        { onGenerateBilling: () => {}, onChangeDue: () => {}, onViewHistory: () => {} }
      );
      expect(Array.isArray(actions)).toBe(true);
    });
  }
});
