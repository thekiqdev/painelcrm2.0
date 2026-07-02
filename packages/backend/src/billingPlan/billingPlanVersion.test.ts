import { describe, it, expect } from 'vitest';
import { nextBillingPlanVersion, sortBillingPlansByVersionDesc } from './billingPlanVersion.js';
import type { BillingPlanRow } from './types.js';

describe('BillingPlanVersion', () => {
  it('nextBillingPlanVersion incrementa a partir da lista', () => {
    expect(nextBillingPlanVersion([])).toBe(1);
    expect(nextBillingPlanVersion([{ version: 1 }, { version: 3 }])).toBe(4);
  });

  it('sortBillingPlansByVersionDesc ordena decrescente', () => {
    const plans = [
      { version: 1 },
      { version: 3 },
      { version: 2 },
    ] as BillingPlanRow[];
    expect(sortBillingPlansByVersionDesc(plans).map((p) => p.version)).toEqual([3, 2, 1]);
  });
});
