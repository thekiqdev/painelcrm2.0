import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FinancialAlert } from './subscriptionFinancialExperience';
import type { UpcomingReceipt } from './subscriptionFinancialExperience';
import {
  UPCOMING_VISIBLE_DEFAULT,
  UPCOMING_EXPAND_BATCH,
  UPCOMING_SCROLL_MAX_PX,
  sliceUpcomingReceipts,
  upcomingExpandLabel,
  paymentEventChipLabel,
  paymentEventChipVariant,
  resolveKpiClickAction,
  isKpiClickable,
  exclusiveAccordionKey,
  resolveErrorModalContent,
  calendarHoverSummary,
  shouldUseUpcomingInternalScroll,
  upcomingListMaxHeightPx,
  swipeMonthDirection,
  historyFilterFromHash,
  invoiceOpensNewTabProps,
  keyboardActivatesClick,
  focusTrapSelector,
} from './subscriptionFinancialRefinement';
import {
  invoiceCrmPath,
  invoiceCrmAbsoluteUrl,
  invoicePublicUrl,
  invoicePdfPath,
  invoiceResendPath,
  copyInvoicePublicUrl,
  copyInvoiceNumber,
  openInvoiceInNewTab,
  openInvoicePdfInNewTab,
  openInvoiceResendInNewTab,
} from './invoiceQuickActions';

function receipt(id: string): UpcomingReceipt {
  return {
    id,
    ymd: '2026-07-14',
    dateLabel: '14 Jul',
    amountCents: 11000,
    statusLabel: 'Previsto',
  };
}

function receipts(n: number): UpcomingReceipt[] {
  return Array.from({ length: n }, (_, i) => receipt(`r-${i}`));
}

function alert(kind: FinancialAlert['kind']): FinancialAlert {
  return {
    id: `a-${kind}`,
    kind,
    emoji: '⚠️',
    title: 'Título',
    message: 'Mensagem de teste',
    actionLabel: 'Ação',
  };
}

describe('subscriptionFinancialRefinement constants', () => {
  it('UPCOMING_VISIBLE_DEFAULT is 4', () => {
    expect(UPCOMING_VISIBLE_DEFAULT).toBe(4);
  });
  it('UPCOMING_EXPAND_BATCH is 8', () => {
    expect(UPCOMING_EXPAND_BATCH).toBe(8);
  });
  it('UPCOMING_SCROLL_MAX_PX is 320', () => {
    expect(UPCOMING_SCROLL_MAX_PX).toBe(320);
  });
});

describe('sliceUpcomingReceipts', () => {
  it('shows all when count <= default', () => {
    const list = receipts(3);
    const r = sliceUpcomingReceipts(list, false);
    expect(r.visible).toHaveLength(3);
    expect(r.canExpand).toBe(false);
    expect(r.hiddenCount).toBe(0);
  });
  it('shows only 4 when collapsed and many items', () => {
    const list = receipts(12);
    const r = sliceUpcomingReceipts(list, false);
    expect(r.visible).toHaveLength(4);
    expect(r.hiddenCount).toBe(8);
    expect(r.canExpand).toBe(true);
  });
  it('shows all when expanded', () => {
    const list = receipts(12);
    const r = sliceUpcomingReceipts(list, true);
    expect(r.visible).toHaveLength(12);
    expect(r.canExpand).toBe(false);
  });
  it('exactly 4 items has no expand', () => {
    const r = sliceUpcomingReceipts(receipts(4), false);
    expect(r.canExpand).toBe(false);
  });
  it('5 items triggers expand', () => {
    const r = sliceUpcomingReceipts(receipts(5), false);
    expect(r.hiddenCount).toBe(1);
    expect(r.canExpand).toBe(true);
  });
});

describe('upcomingExpandLabel', () => {
  it('singular for 1 hidden', () => {
    expect(upcomingExpandLabel(1)).toBe('Mostrar mais 1 ciclo');
  });
  it('plural for 8 hidden', () => {
    expect(upcomingExpandLabel(8)).toBe('Mostrar mais 8 ciclos');
  });
  it('caps at expand batch', () => {
    expect(upcomingExpandLabel(20)).toBe('Mostrar mais 8 ciclos');
  });
});

describe('paymentEventChipLabel', () => {
  it('paid', () => expect(paymentEventChipLabel('paid')).toBe('Pago'));
  it('invoiced', () => expect(paymentEventChipLabel('invoiced')).toBe('Emitida'));
  it('due', () => expect(paymentEventChipLabel('due')).toBe('Vencimento'));
  it('overdue', () => expect(paymentEventChipLabel('overdue')).toBe('Atrasada'));
  it('cancelled', () => expect(paymentEventChipLabel('cancelled')).toBe('Cancelada'));
  it('reprocessed', () => expect(paymentEventChipLabel('reprocessed')).toBe('Reprocessada'));
});

describe('paymentEventChipVariant', () => {
  it('maps paid', () => expect(paymentEventChipVariant('paid')).toBe('paid'));
  it('maps invoiced', () => expect(paymentEventChipVariant('invoiced')).toBe('invoiced'));
  it('maps due', () => expect(paymentEventChipVariant('due')).toBe('due'));
  it('maps overdue', () => expect(paymentEventChipVariant('overdue')).toBe('overdue'));
  it('maps cancelled', () => expect(paymentEventChipVariant('cancelled')).toBe('cancelled'));
  it('maps reprocessed to muted', () => expect(paymentEventChipVariant('reprocessed')).toBe('muted'));
});

describe('resolveKpiClickAction', () => {
  it('received scrolls paid history', () => {
    expect(resolveKpiClickAction('received', null)).toEqual({ type: 'scroll_history', filter: 'paid' });
  });
  it('open scrolls pending history', () => {
    expect(resolveKpiClickAction('open', null)).toEqual({ type: 'scroll_history', filter: 'pending' });
  });
  it('last_payment opens invoice when id present', () => {
    expect(resolveKpiClickAction('last_payment', 'inv-99')).toEqual({
      type: 'open_invoice',
      invoiceId: 'inv-99',
    });
  });
  it('last_payment falls back to paid history', () => {
    expect(resolveKpiClickAction('last_payment', null)).toEqual({ type: 'scroll_history', filter: 'paid' });
  });
  it('status scrolls calendar', () => {
    expect(resolveKpiClickAction('status', null)).toEqual({
      type: 'scroll_to',
      targetId: 'financial-calendar',
    });
  });
  it('forecast_12m is none', () => {
    expect(resolveKpiClickAction('forecast_12m', null)).toEqual({ type: 'none' });
  });
});

describe('isKpiClickable', () => {
  it('received clickable', () => expect(isKpiClickable('received')).toBe(true));
  it('open clickable', () => expect(isKpiClickable('open')).toBe(true));
  it('last_payment clickable', () => expect(isKpiClickable('last_payment')).toBe(true));
  it('status clickable', () => expect(isKpiClickable('status')).toBe(true));
  it('next_receipt clickable', () => expect(isKpiClickable('next_receipt')).toBe(true));
});

describe('exclusiveAccordionKey', () => {
  it('opens closed month', () => {
    expect(exclusiveAccordionKey(null, '2026-06')).toBe('2026-06');
  });
  it('closes open month', () => {
    expect(exclusiveAccordionKey('2026-06', '2026-06')).toBeNull();
  });
  it('switches month', () => {
    expect(exclusiveAccordionKey('2026-06', '2026-07')).toBe('2026-07');
  });
});

describe('resolveErrorModalContent', () => {
  it('billing_missing content', () => {
    const c = resolveErrorModalContent(alert('billing_missing'));
    expect(c.title).toContain('Cobrança');
    expect(c.solution).toBeTruthy();
    expect(c.actionLabel).toBe('Gerar agora');
  });
  it('client_overdue uses alert message', () => {
    const a = alert('client_overdue');
    const c = resolveErrorModalContent(a);
    expect(c.reason).toBe(a.message);
  });
  it('gateway_failed content', () => {
    const c = resolveErrorModalContent(alert('gateway_failed'));
    expect(c.title).toContain('Pagamento');
  });
});

describe('calendarHoverSummary', () => {
  it('joins day title and amount', () => {
    const s = calendarHoverSummary(14, '14 Jul', 'Fatura', 'R$ 110,00');
    expect(s).toContain('14');
    expect(s).toContain('Fatura');
    expect(s).toContain('R$ 110,00');
  });
  it('works without amount', () => {
    expect(calendarHoverSummary(1, '1 Jan', 'Previsto', null)).not.toContain('null');
  });
});

describe('upcoming scroll helpers', () => {
  it('no scroll when collapsed', () => {
    expect(shouldUseUpcomingInternalScroll(20, false)).toBe(false);
  });
  it('scroll when expanded and many', () => {
    expect(shouldUseUpcomingInternalScroll(10, true)).toBe(true);
  });
  it('no scroll when expanded few', () => {
    expect(shouldUseUpcomingInternalScroll(5, true)).toBe(false);
  });
  it('max height when scroll', () => {
    expect(upcomingListMaxHeightPx(true)).toBe(320);
  });
  it('undefined height when no scroll', () => {
    expect(upcomingListMaxHeightPx(false)).toBeUndefined();
  });
});

describe('swipeMonthDirection', () => {
  it('prev on swipe right', () => expect(swipeMonthDirection(60)).toBe('prev'));
  it('next on swipe left', () => expect(swipeMonthDirection(-60)).toBe('next'));
  it('null on small move', () => expect(swipeMonthDirection(10)).toBeNull());
  it('respects threshold', () => expect(swipeMonthDirection(50, 60)).toBeNull());
});

describe('historyFilterFromHash', () => {
  it('parses paid', () => expect(historyFilterFromHash('#financial-history-paid')).toBe('paid'));
  it('parses pending', () => expect(historyFilterFromHash('#financial-history-pending')).toBe('pending'));
  it('invalid returns null', () => expect(historyFilterFromHash('#other')).toBeNull());
});

describe('invoiceOpensNewTabProps', () => {
  it('target blank', () => {
    expect(invoiceOpensNewTabProps().target).toBe('_blank');
    expect(invoiceOpensNewTabProps().rel).toBe('noopener noreferrer');
  });
});

describe('keyboardActivatesClick', () => {
  it('Enter', () => expect(keyboardActivatesClick('Enter')).toBe(true));
  it('Space', () => expect(keyboardActivatesClick(' ')).toBe(true));
  it('Tab false', () => expect(keyboardActivatesClick('Tab')).toBe(false));
});

describe('focusTrapSelector', () => {
  it('includes focus trap root', () => {
    expect(focusTrapSelector()).toContain('data-focus-trap-root');
  });
});

describe('invoiceQuickActions paths', () => {
  it('invoiceCrmPath encodes id', () => {
    expect(invoiceCrmPath('inv/1')).toContain('inv%2F1');
  });
  it('invoicePdfPath adds query', () => {
    expect(invoicePdfPath('x')).toContain('download=pdf');
  });
  it('invoiceResendPath adds action', () => {
    expect(invoiceResendPath('x')).toContain('action=resend');
  });
  it('invoicePublicUrl uses pay link with token', () => {
    const url = invoicePublicUrl('inv-1', 'tok-abc');
    expect(url).toContain('/pay/tok-abc');
  });
  it('invoicePublicUrl falls back to CRM without token', () => {
    const url = invoicePublicUrl('inv-1');
    expect(url).toContain('/customer-invoices/inv-1');
  });
});

describe('invoiceQuickActions clipboard', () => {
  const writeText = vi.fn();

  beforeEach(() => {
    writeText.mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('copyInvoicePublicUrl writes url', async () => {
    const ok = await copyInvoicePublicUrl('inv-1', 'tok');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalled();
  });

  it('copyInvoiceNumber writes id', async () => {
    const ok = await copyInvoiceNumber('inv-42');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('inv-42');
  });
});

describe('invoiceQuickActions window open', () => {
  const open = vi.fn();

  beforeEach(() => {
    open.mockReturnValue(null);
    vi.stubGlobal('window', { open });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('openInvoiceInNewTab', () => {
    openInvoiceInNewTab('inv-1');
    expect(open).toHaveBeenCalledWith('/customer-invoices/inv-1', '_blank', 'noopener,noreferrer');
  });
  it('openInvoicePdfInNewTab', () => {
    open.mockClear();
    openInvoicePdfInNewTab('inv-1');
    expect(open.mock.calls[0][0]).toContain('download=pdf');
  });
  it('openInvoiceResendInNewTab', () => {
    open.mockClear();
    openInvoiceResendInNewTab('inv-1');
    expect(open.mock.calls[0][0]).toContain('action=resend');
  });
});

describe('invoiceCrmAbsoluteUrl', () => {
  it('includes path', () => {
    expect(invoiceCrmAbsoluteUrl('abc')).toContain('/customer-invoices/abc');
  });
});

describe('mobile refinement scenarios', () => {
  it('expand label works for mobile list', () => {
    expect(upcomingExpandLabel(12)).toMatch(/8 ciclo/);
  });
  it('swipe enables month navigation', () => {
    expect(swipeMonthDirection(-80)).toBe('next');
  });
});

describe('accessibility refinement scenarios', () => {
  it('keyboard enter activates', () => expect(keyboardActivatesClick('Enter')).toBe(true));
  it('keyboard escape does not activate click', () => expect(keyboardActivatesClick('Escape')).toBe(false));
  it('focus trap selector targets interactive elements', () => {
    expect(focusTrapSelector()).toContain('button');
    expect(focusTrapSelector()).toContain('a');
  });
});

describe('popover and calendar refinement scenarios', () => {
  it('chip labels for calendar legend kinds', () => {
    expect(paymentEventChipLabel('paid')).toBe('Pago');
    expect(paymentEventChipLabel('invoiced')).toBe('Emitida');
  });
  it('hover summary for due event', () => {
    const s = calendarHoverSummary(14, '14 Jul', 'Vence hoje', 'R$110');
    expect(s).toContain('Vence hoje');
  });
});

describe('history filter KPI integration', () => {
  it('received maps to paid filter', () => {
    const a = resolveKpiClickAction('received', null);
    if (a.type === 'scroll_history') expect(a.filter).toBe('paid');
  });
  it('open maps to pending filter', () => {
    const a = resolveKpiClickAction('open', null);
    if (a.type === 'scroll_history') expect(a.filter).toBe('pending');
  });
});

describe('timeline accordion refinement', () => {
  it('only one month open at a time', () => {
    expect(exclusiveAccordionKey('2026-06', '2026-07')).toBe('2026-07');
    expect(exclusiveAccordionKey('2026-07', '2026-07')).toBeNull();
  });
});

describe('sidebar resolve modal refinement', () => {
  it('no stacktrace in modal content', () => {
    const c = resolveErrorModalContent(alert('gateway_failed'));
    expect(c.reason).not.toContain('Error:');
    expect(c.reason).not.toContain('at ');
  });
});
