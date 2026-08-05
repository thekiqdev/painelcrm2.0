import { describe, expect, it } from 'vitest';
import { formatDueDate, invoiceRowToBag } from '../flowInvoiceActions.js';

describe('formatDueDate', () => {
  it('converte YYYY-MM-DD para dd/mm/yyyy', () => {
    expect(formatDueDate('2026-08-05')).toBe('05/08/2026');
  });

  it('não corta Date.toString() para Wed Aug 05', () => {
    // UTC midnight = data civil correta com getters UTC
    const d = new Date(Date.UTC(2026, 7, 5));
    expect(formatDueDate(d)).toBe('05/08/2026');
  });

  it('aceita ISO com hora', () => {
    expect(formatDueDate('2026-01-01T00:00:00.000Z')).toBe('01/01/2026');
  });

  it('preserva dd/mm/yyyy', () => {
    expect(formatDueDate('01/01/2026')).toBe('01/01/2026');
  });
});

describe('invoiceRowToBag', () => {
  it('formata due_date Date no menu', () => {
    const item = invoiceRowToBag({
      id: 'inv-1',
      invoice_number: 'CINV-1',
      amount_cents: 49000,
      due_date: new Date(Date.UTC(2026, 7, 5)),
      status: 'pending',
      payment_token: 'tok',
    });
    expect(item.due_date).toBe('05/08/2026');
  });
});
