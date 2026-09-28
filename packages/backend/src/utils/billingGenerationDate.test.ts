import { describe, it, expect } from 'vitest';
import {
  clampRecurringInvoiceGenerateDaysBeforeDue,
  computeRecurringInvoiceGenerationDateYmd,
  subtractCalendarDaysFromIsoYmd,
} from './billingGenerationDate.js';

describe('billingGenerationDate', () => {
  it('subtractCalendarDaysFromIsoYmd: 2026-05-25 menos 5 => 2026-05-20', () => {
    expect(subtractCalendarDaysFromIsoYmd('2026-05-25', 5)).toBe('2026-05-20');
  });

  it('clamp: fora do intervalo 0–60', () => {
    expect(clampRecurringInvoiceGenerateDaysBeforeDue(-3)).toBe(0);
    expect(clampRecurringInvoiceGenerateDaysBeforeDue(999)).toBe(60);
    expect(clampRecurringInvoiceGenerateDaysBeforeDue(5.7)).toBe(5);
  });

  it('computeRecurringInvoiceGenerationDateYmd alinha ao exemplo produto', () => {
    expect(computeRecurringInvoiceGenerationDateYmd('2026-05-25', 5)).toBe('2026-05-20');
    expect(computeRecurringInvoiceGenerationDateYmd('2026-05-25', 0)).toBe('2026-05-25');
  });
});
