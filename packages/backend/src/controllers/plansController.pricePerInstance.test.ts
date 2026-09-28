import { describe, expect, it } from 'vitest';
import { normalizePlanPricePerInstanceCents } from '../controllers/plansController.js';

describe('normalizePlanPricePerInstanceCents', () => {
  it('null/undefined/negativo → null (não vendável)', () => {
    expect(normalizePlanPricePerInstanceCents(null)).toBeNull();
    expect(normalizePlanPricePerInstanceCents(undefined)).toBeNull();
    expect(normalizePlanPricePerInstanceCents(-1)).toBeNull();
  });

  it('aceita inteiros >= 0', () => {
    expect(normalizePlanPricePerInstanceCents(0)).toBe(0);
    expect(normalizePlanPricePerInstanceCents(1500)).toBe(1500);
    expect(normalizePlanPricePerInstanceCents(99.7)).toBe(99);
  });
});
