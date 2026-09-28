import { describe, it, expect } from 'vitest';
import type { FinancialTimelineItem, FinancialTimelineMonthGroup } from './subscriptionFinancialExperience';
import type { FinancialEvent } from './financialEventTypes';
import {
  buildTimelineFinancialSections,
  futureMonthsVirtualWindow,
  itemBandLabel,
  resolveFocusEventId,
  shouldShowBandSeparator,
  slicePastMonthsForLazy,
  temporalBandForYmd,
  temporalBandLabel,
  timelineHistoryGateLabel,
} from './timelineFinancialSections';

const today = '2026-07-15';

function item(id: string, ymd: string, icon = '💰', title = 'Pago'): FinancialTimelineItem {
  return {
    id,
    ymd,
    icon,
    title,
    amountCents: 11000,
    dateLabel: ymd,
  };
}

function group(monthKey: string, items: FinancialTimelineItem[]): FinancialTimelineMonthGroup {
  const mi = Number(monthKey.slice(5, 7)) - 1;
  const names = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro'];
  return {
    monthKey,
    monthLabel: names[mi] ?? monthKey,
    summaryTitle: 'Recebeu',
    totalCents: items.reduce((s, i) => s + (i.amountCents ?? 0), 0),
    count: items.length,
    items,
  };
}

function ev(
  id: string,
  type: FinancialEvent['type'],
  ymd: string,
  dueYmd = ymd
): FinancialEvent {
  return {
    id,
    type,
    ymd,
    dueYmd,
    amountCents: 11000,
    competence: 'Jul/26',
    invoiceId: type === 'invoice_failed' ? null : `inv-${id}`,
    cycleId: 'c1',
    statusLabel: 'Pendente',
    statusBadge: 'pending',
    gateway: null,
    notes: null,
    paidAt: null,
    clientName: null,
    lastUpdatedAt: null,
    cycleKey: `ck-${id}`,
  };
}

describe('temporalBandForYmd', () => {
  it('today', () => expect(temporalBandForYmd('2026-07-15', today)).toBe('today'));
  it('this week', () => expect(temporalBandForYmd('2026-07-18', today)).toBe('this_week'));
  it('this month', () => expect(temporalBandForYmd('2026-07-28', today)).toBe('this_month'));
  it('future months', () => expect(temporalBandForYmd('2026-08-05', today)).toBe('future_months'));
  it('history', () => expect(temporalBandForYmd('2026-06-01', today)).toBe('history'));
});

describe('temporalBandLabel', () => {
  const bands = ['today', 'this_week', 'this_month', 'future_months', 'history'] as const;
  for (const b of bands) {
    it(`label for ${b}`, () => {
      expect(temporalBandLabel(b).length).toBeGreaterThan(2);
    });
  }
});

describe('buildTimelineFinancialSections ordering', () => {
  const groups = [
    group('2026-09', [item('sep', '2026-09-10', '🟠', 'Previsto')]),
    group('2026-08', [item('aug', '2026-08-14', '🟠', 'Previsto')]),
    group('2026-07', [
      item('jul-today', '2026-07-15', '🟠', 'Previsto'),
      item('jul-future', '2026-07-21', '🟠', 'Previsto'),
    ]),
    group('2026-06', [item('jun', '2026-06-30', '💰', 'Pago')]),
    group('2026-05', [item('may', '2026-05-15', '💰', 'Pago')]),
  ];

  const layout = buildTimelineFinancialSections(groups, [], today);

  it('starts at current month July', () => {
    expect(layout.presentAndFuture[0]?.monthKey).toBe('2026-07');
  });

  it('future months ascending after current', () => {
    const keys = layout.presentAndFuture.map((s) => s.monthKey);
    expect(keys).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  it('past months separated', () => {
    expect(layout.pastMonths.map((s) => s.monthKey)).toEqual(['2026-06', '2026-05']);
  });

  it('has past history gate', () => {
    expect(layout.hasPastHistory).toBe(true);
  });

  it('initial open is current month', () => {
    expect(layout.initialOpenMonthKey).toBe('2026-07');
  });

  it('current month items sorted asc', () => {
    const jul = layout.presentAndFuture[0];
    expect(jul?.items[0]?.ymd).toBe('2026-07-15');
    expect(jul?.items[1]?.ymd).toBe('2026-07-21');
  });

  it('past months default closed', () => {
    expect(layout.pastMonths.every((s) => s.defaultOpen === false)).toBe(true);
  });

  it('current month default open', () => {
    expect(layout.presentAndFuture[0]?.defaultOpen).toBe(true);
  });
});

describe('resolveFocusEventId', () => {
  it('prioritizes failure', () => {
    const id = resolveFocusEventId(
      [
        ev('pay', 'payment', '2026-07-01'),
        ev('fail', 'invoice_failed', '2026-07-14'),
        ev('due', 'invoice_due', '2026-07-20'),
      ],
      today
    );
    expect(id).toBe('fail');
  });

  it('overdue invoice_due before upcoming', () => {
    const id = resolveFocusEventId(
      [ev('due-old', 'invoice_due', '2026-07-01', '2026-07-01'), ev('up', 'upcoming_cycle', '2026-07-20')],
      today
    );
    expect(id).toBe('due-old');
  });

  it('today upcoming_cycle', () => {
    const id = resolveFocusEventId([ev('today', 'upcoming_cycle', today)], today);
    expect(id).toBe('today');
  });

  it('today invoice_due', () => {
    const id = resolveFocusEventId([ev('due-today', 'invoice_due', today, today)], today);
    expect(id).toBe('due-today');
  });
});

describe('shouldShowBandSeparator', () => {
  const items = [
    item('a', '2026-07-15', '🟠', 'Previsto'),
    item('b', '2026-07-18', '🟠', 'Previsto'),
    item('c', '2026-07-25', '🟠', 'Previsto'),
  ];

  it('first item shows Hoje', () => {
    expect(shouldShowBandSeparator(items, 0, today)).toBe('Hoje');
  });

  it('second item may show Esta semana', () => {
    expect(shouldShowBandSeparator(items, 1, today)).toBe('Esta semana');
  });

  it('third shows Este mês when beyond week', () => {
    expect(shouldShowBandSeparator(items, 2, today)).toBe('Este mês');
  });
});

describe('itemBandLabel', () => {
  it('returns label for item', () => {
    expect(itemBandLabel(item('x', today), today)).toBe('Hoje');
  });
});

describe('slicePastMonthsForLazy', () => {
  const past = [
    { monthKey: '2026-06', monthLabel: 'Junho', bucket: 'past' as const, items: [], summaryTitle: '', totalCents: 0, count: 0, defaultOpen: false, band: 'history' as const },
  ];
  it('empty when collapsed', () => {
    expect(slicePastMonthsForLazy(past, false)).toHaveLength(0);
  });
  it('shows when expanded', () => {
    expect(slicePastMonthsForLazy(past, true)).toHaveLength(1);
  });
});

describe('futureMonthsVirtualWindow', () => {
  const sections = [
    { monthKey: '2026-07', bucket: 'current' as const },
    { monthKey: '2026-08', bucket: 'future' as const },
    { monthKey: '2026-09', bucket: 'future' as const },
    { monthKey: '2026-10', bucket: 'future' as const },
  ].map((s) => ({
    ...s,
    monthLabel: s.monthKey,
    items: [],
    summaryTitle: '',
    totalCents: 0,
    count: 0,
    defaultOpen: false,
    band: 'future_months' as const,
  }));

  it('limits future months', () => {
    const { hiddenCount } = futureMonthsVirtualWindow(sections, 1);
    expect(hiddenCount).toBeGreaterThan(0);
  });

  it('keeps current always', () => {
    const { visible } = futureMonthsVirtualWindow(sections, 1);
    expect(visible.some((s) => s.bucket === 'current')).toBe(true);
  });
});

describe('timelineHistoryGateLabel', () => {
  it('singular', () => expect(timelineHistoryGateLabel(1)).toContain('histórico'));
  it('plural count', () => expect(timelineHistoryGateLabel(3)).toContain('3'));
});

describe('focus opens month with overdue', () => {
  it('opens month of overdue event', () => {
    const events = [ev('od', 'invoice_due', '2026-07-01', '2026-07-01')];
    const groups = [group('2026-07', [item('od', '2026-07-01', '🟠', 'Atrasada')])];
    const layout = buildTimelineFinancialSections(groups, events, today);
    expect(layout.focusEventId).toBe('od');
    expect(layout.initialOpenMonthKey).toBe('2026-07');
  });
});

describe('chronological scenarios', () => {
  const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  for (const mk of months) {
    it(`layout handles month ${mk}`, () => {
      const g = group(mk, [item(`i-${mk}`, `${mk}-15`)]);
      const layout = buildTimelineFinancialSections([g], [], today);
      expect(layout.presentAndFuture.length + layout.pastMonths.length).toBe(1);
    });
  }
});

describe('empty timeline', () => {
  it('no sections', () => {
    const layout = buildTimelineFinancialSections([], [], today);
    expect(layout.presentAndFuture).toHaveLength(0);
    expect(layout.hasPastHistory).toBe(false);
  });
});

describe('only past months', () => {
  it('all in past bucket', () => {
    const layout = buildTimelineFinancialSections(
      [group('2026-05', [item('m', '2026-05-01')])],
      [],
      today
    );
    expect(layout.presentAndFuture).toHaveLength(0);
    expect(layout.pastMonths).toHaveLength(1);
  });
});

describe('only future months', () => {
  it('ordered asc', () => {
    const layout = buildTimelineFinancialSections(
      [group('2026-08', [item('a', '2026-08-01')]), group('2026-09', [item('b', '2026-09-01')])],
      [],
      today
    );
    expect(layout.presentAndFuture.map((s) => s.monthKey)).toEqual(['2026-08', '2026-09']);
  });
});
