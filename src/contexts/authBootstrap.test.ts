import { describe, expect, it, vi } from 'vitest';
import { loadPostMeBootstrap } from './authBootstrap';

describe('loadPostMeBootstrap (MB-006)', () => {
  it('runs features and migration-flags in parallel', async () => {
    const order: string[] = [];
    const loadFeatures = vi.fn(async () => {
      order.push('features-start');
      await new Promise((r) => setTimeout(r, 30));
      order.push('features-done');
    });
    const loadMigrationFlags = vi.fn(async () => {
      order.push('flags-start');
      await new Promise((r) => setTimeout(r, 30));
      order.push('flags-done');
    });

    const t0 = Date.now();
    await loadPostMeBootstrap({ loadFeatures, loadMigrationFlags });
    const elapsed = Date.now() - t0;

    expect(loadFeatures).toHaveBeenCalledTimes(1);
    expect(loadMigrationFlags).toHaveBeenCalledTimes(1);
    // Both must start before either finishes (parallel).
    expect(order.indexOf('features-start')).toBeLessThan(order.indexOf('flags-done'));
    expect(order.indexOf('flags-start')).toBeLessThan(order.indexOf('features-done'));
    // Parallel ≈ max(30,30), not sum — allow CI jitter.
    expect(elapsed).toBeLessThan(55);
  });

  it('serial baseline would exceed parallel wall time', async () => {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const serialMs = await (async () => {
      const t0 = Date.now();
      await delay(25);
      await delay(25);
      return Date.now() - t0;
    })();
    const parallelMs = await (async () => {
      const t0 = Date.now();
      await Promise.all([delay(25), delay(25)]);
      return Date.now() - t0;
    })();
    expect(serialMs).toBeGreaterThanOrEqual(45);
    expect(parallelMs).toBeLessThan(serialMs);
    expect(parallelMs).toBeLessThan(45);
  });
});
