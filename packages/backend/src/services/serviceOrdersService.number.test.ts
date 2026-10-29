import { describe, expect, it } from 'vitest';
import { randomInt } from 'crypto';

/** Espelho da faixa usada em allocateServiceOrderNumber (100000–999999). */
const MIN = 100_000;
const MAX = 999_999;

describe('service order public number', () => {
  it('random candidates are always 6 digits', () => {
    for (let i = 0; i < 200; i++) {
      const n = randomInt(MIN, MAX + 1);
      expect(n).toBeGreaterThanOrEqual(MIN);
      expect(n).toBeLessThanOrEqual(MAX);
      expect(String(n)).toHaveLength(6);
    }
  });
});
