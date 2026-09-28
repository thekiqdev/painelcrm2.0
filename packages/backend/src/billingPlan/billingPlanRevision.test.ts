import { describe, it, expect } from 'vitest';
import { nextBillingPlanRevision, sortByVersionThenRevisionDesc } from './billingPlanRevision.js';
import type { BillingPlanRow } from './types.js';

describe('BillingPlanRevision', () => {
  it('nextBillingPlanRevision na mesma version', () => {
    expect(nextBillingPlanRevision([], 1)).toBe(1);
    expect(
      nextBillingPlanRevision(
        [
          { version: 1, plan_revision: 1 },
          { version: 1, plan_revision: 2 },
        ],
        1
      )
    ).toBe(3);
  });

  it('sortByVersionThenRevisionDesc', () => {
    const sorted = sortByVersionThenRevisionDesc([
      { version: 1, plan_revision: 1 },
      { version: 2, plan_revision: 1 },
      { version: 2, plan_revision: 3 },
    ] as BillingPlanRow[]);
    expect(sorted[0].version).toBe(2);
    expect(sorted[0].plan_revision).toBe(3);
  });
});
