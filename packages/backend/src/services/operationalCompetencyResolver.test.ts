import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  resolveOperationalCompetencyFromContext,
  resolveChronologicalOperationalCompetency,
} from './operationalCompetencyResolverCore.js';

describe('operationalCompetencyResolverCore backend', () => {
  const advanceMonthly = (d: string) => {
    const [y, m] = d.split('-').map(Number);
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    return `${ny}-${String(nm).padStart(2, '0')}-${d.slice(8, 10)}`;
  };

  it('pending/queued/failed/skipped/cancelled são geráveis', () => {
    for (const status of ['pending', 'queued', 'failed', 'skipped', 'cancelled'] as const) {
      const r = resolveChronologicalOperationalCompetency(
        [{ id: 'c1', cycle_date: '2026-07-01', status, invoice_id: null }],
        advanceMonthly,
        'test'
      );
      expect(r.canGenerate).toBe(true);
    }
  });

  it('invoiced não gera', () => {
    const r = resolveOperationalCompetencyFromContext(
      {
        subscriptionId: 'sub',
        subscriptionStatus: 'active',
        billingInterval: 'monthly',
        cycles: [
          { id: 'c1', cycle_date: '2026-07-01', status: 'invoiced', invoice_id: 'inv' },
          { id: 'c2', cycle_date: '2026-08-01', status: 'pending', invoice_id: null },
        ],
      },
      { subscriptionId: 'sub', mode: 'NEXT_GENERATE' },
      advanceMonthly
    );
    expect(r.cycleId).toBe('c2');
  });
});
