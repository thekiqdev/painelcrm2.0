import { describe, expect, it } from 'vitest';
import { resolveMainRenewalItemDue } from './recurringCustomerRenewalItemDueAnchor.js';

describe('resolveMainRenewalItemDue (E2 × fatura principal)', () => {
  it('com E2 ligado, exclui item cujo scheduled_due_date difere do periodStart do ciclo', () => {
    const r = resolveMainRenewalItemDue({
      childInvoicesE2Enabled: true,
      scheduledDueDate: '2026-03-15',
      periodStart: '2026-03-01',
      prevInvoiceDueDate: '2026-02-01',
    });
    expect(r.excludedForE2ChildPath).toBe(true);
  });

  it('com E2 ligado, inclui quando scheduled_due_date alinha ao periodStart', () => {
    const r = resolveMainRenewalItemDue({
      childInvoicesE2Enabled: true,
      scheduledDueDate: '2026-03-01',
      periodStart: '2026-03-01',
      prevInvoiceDueDate: '2026-02-01',
    });
    expect(r.excludedForE2ChildPath).toBe(false);
    expect(r.itemDue).toBe('2026-03-01');
  });

  it('com E2 desligado, não exclui por scheduled_due_date fora do ciclo — ancora na due da fatura anterior', () => {
    const r = resolveMainRenewalItemDue({
      childInvoicesE2Enabled: false,
      scheduledDueDate: '2026-03-15',
      periodStart: '2026-03-01',
      prevInvoiceDueDate: '2026-02-01',
    });
    expect(r.excludedForE2ChildPath).toBe(false);
    expect(r.itemDue).toBe('2026-02-01');
  });

  it('scheduled null usa due da fatura anterior', () => {
    const r = resolveMainRenewalItemDue({
      childInvoicesE2Enabled: true,
      scheduledDueDate: null,
      periodStart: '2026-03-01',
      prevInvoiceDueDate: '2026-02-15',
    });
    expect(r.itemDue).toBe('2026-02-15');
  });
});
