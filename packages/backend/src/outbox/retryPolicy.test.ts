import { describe, it, expect } from 'vitest';
import { computeNextRetryAt } from './retryPolicy.js';

describe('computeNextRetryAt', () => {
  it('uses exponential backoff steps', () => {
    const base = new Date('2026-01-01T00:00:00.000Z');
    const t1 = computeNextRetryAt(1, base);
    expect(t1.getTime() - base.getTime()).toBe(30_000);
    const t3 = computeNextRetryAt(3, base);
    expect(t3.getTime() - base.getTime()).toBe(600_000);
  });

  it('caps at last backoff step', () => {
    const base = new Date('2026-01-01T00:00:00.000Z');
    const t99 = computeNextRetryAt(99, base);
    expect(t99.getTime() - base.getTime()).toBe(86_400_000);
  });
});
