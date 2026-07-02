import { describe, it, expect } from 'vitest';
import { runBillingShadowComparison } from './billingShadowExecutor.js';

describe('runBillingShadowComparison (archived)', () => {
  it('retorna null — shadow desligado em 3.2B', async () => {
    const result = await runBillingShadowComparison({
      subscription: { id: 'sub-1', type: 'customer', tenant_id: 't1' } as never,
      cycleKey: '2026-06-01',
      periodStartYmd: '2026-06-01',
      executionMode: 'automatic',
      correlationId: 'c1',
      renewalResult: { success: true, logs: [], executionTime: 0, executionMode: 'automatic' },
    });
    expect(result).toBeNull();
  });
});
