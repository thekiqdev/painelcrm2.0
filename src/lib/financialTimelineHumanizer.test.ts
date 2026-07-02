import { describe, it, expect } from 'vitest';
import type { FinancialEventType } from './financialEventTypes';
import type { FinancialTimelineItem } from './subscriptionFinancialExperience';
import {
  humanMonthSummaryTitle,
  humanizeTimelineEventType,
  humanizeTimelineItem,
} from './financialTimelineHumanizer';

const today = '2026-06-30';

function timelineItem(overrides: Partial<FinancialTimelineItem> = {}): FinancialTimelineItem {
  return {
    id: 't1',
    ymd: '2026-07-14',
    dateLabel: '14 Jul',
    title: 'Previsto',
    icon: '📅',
    amountCents: 11000,
    subtitle: null,
    eventType: 'upcoming_cycle',
    ...overrides,
  };
}

describe('humanizeTimelineEventType', () => {
  it('payment says Cliente pagou', () => {
    const h = humanizeTimelineEventType('payment', '2026-07-07', today, 11000);
    expect(h.title).toBe('Cliente pagou');
    expect(h.emoji).toBe('💰');
    expect(h.amountLine).toContain('110');
  });

  it('upcoming_cycle says Você deverá receber', () => {
    const h = humanizeTimelineEventType('upcoming_cycle', '2026-07-21', today, 11000);
    expect(h.title).toBe('Você deverá receber');
    expect(h.emoji).toBe('📅');
  });

  it('invoice_due future', () => {
    const h = humanizeTimelineEventType('invoice_due', '2026-07-28', today, 11000);
    expect(h.title).toBe('Você deverá receber');
    expect(h.actionLabel).toBeNull();
  });

  it('invoice_due overdue', () => {
    const h = humanizeTimelineEventType('invoice_due', '2026-06-20', today, 11000);
    expect(h.title).toBe('Pagamento em atraso');
    expect(h.actionLabel).toBe('Resolver agora');
  });

  it('invoice_failed', () => {
    const h = humanizeTimelineEventType('invoice_failed', '2026-07-14', today, 11000);
    expect(h.title).toBe('Cobrança não foi criada');
    expect(h.actionLabel).toBe('Resolver agora');
  });

  it('charge_attempt', () => {
    const h = humanizeTimelineEventType('charge_attempt', '2026-07-14', today, null);
    expect(h.title).toBe('Cobrança não foi criada');
  });

  it('invoice_generated', () => {
    const h = humanizeTimelineEventType('invoice_generated', '2026-07-21', today, 11000);
    expect(h.title).toBe('Cobrança será gerada');
    expect(h.emoji).toBe('🔵');
  });

  it('manual_charge', () => {
    expect(humanizeTimelineEventType('manual_charge', '2026-07-21', today, 11000).title).toBe(
      'Cobrança será gerada'
    );
  });

  it('invoice_reprocessed', () => {
    expect(humanizeTimelineEventType('invoice_reprocessed', '2026-07-10', today, 11000).title).toBe(
      'Cobrança reprocessada'
    );
  });

  it('invoice_cancelled', () => {
    expect(humanizeTimelineEventType('invoice_cancelled', '2026-07-10', today, 11000).title).toBe(
      'Cobrança cancelada'
    );
  });

  it('invoice_refunded', () => {
    expect(humanizeTimelineEventType('invoice_refunded', '2026-07-10', today, 11000).title).toBe(
      'Pagamento reembolsado'
    );
  });

  const allTypes: FinancialEventType[] = [
    'payment',
    'invoice_generated',
    'invoice_due',
    'invoice_failed',
    'invoice_cancelled',
    'invoice_reprocessed',
    'invoice_refunded',
    'upcoming_cycle',
    'manual_charge',
    'charge_attempt',
  ];

  allTypes.forEach((type) => {
    it(`returns dateLine for ${type}`, () => {
      const h = humanizeTimelineEventType(type, '2026-07-14', today, 11000);
      expect(h.dateLine.length).toBeGreaterThan(0);
    });
  });
});

describe('humanizeTimelineItem', () => {
  it('uses eventType when present', () => {
    const h = humanizeTimelineItem(timelineItem({ eventType: 'payment', icon: '💰' }), today);
    expect(h.title).toBe('Cliente pagou');
  });

  it('falls back to paid icon', () => {
    const h = humanizeTimelineItem(
      timelineItem({ eventType: undefined, icon: '💰', title: 'Pago' }),
      today
    );
    expect(h.title).toBe('Cliente pagou');
  });

  it('falls back to raw title', () => {
    const h = humanizeTimelineItem(
      timelineItem({ eventType: undefined, icon: '🔵', title: 'Emitida' }),
      today
    );
    expect(h.title).toBe('Emitida');
  });

  it('includes amount line', () => {
    const h = humanizeTimelineItem(timelineItem({ amountCents: 22000 }), today);
    expect(h.amountLine).toContain('220');
  });

  it('null amount omits amount line for generic', () => {
    const h = humanizeTimelineItem(
      timelineItem({ eventType: undefined, amountCents: null, icon: 'x', title: 'X' }),
      today
    );
    expect(h.amountLine).toBeNull();
  });
});

describe('humanMonthSummaryTitle', () => {
  it('paid month', () => {
    expect(humanMonthSummaryTitle(2, 22000)).toContain('Recebeu');
    expect(humanMonthSummaryTitle(2, 22000)).toContain('220');
  });

  it('no payments', () => {
    expect(humanMonthSummaryTitle(0, 0)).toBe('Movimentação do mês');
  });

  it('single payment', () => {
    expect(humanMonthSummaryTitle(1, 11000)).toMatch(/Recebeu/);
  });
});

describe('human copy consistency', () => {
  it('never uses raw Falha title', () => {
    const h = humanizeTimelineEventType('invoice_failed', '2026-07-14', today, 11000);
    expect(h.title).not.toBe('Falha');
  });

  it('never uses Próximo recebimento title', () => {
    const h = humanizeTimelineEventType('upcoming_cycle', '2026-07-21', today, 11000);
    expect(h.title).not.toBe('Próximo recebimento');
  });

  it('never uses Recebeu R$ in item title', () => {
    const h = humanizeTimelineEventType('payment', '2026-07-07', today, 11000);
    expect(h.title).not.toMatch(/^Recebeu/);
  });
});
