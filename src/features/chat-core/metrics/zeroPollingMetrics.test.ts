import { describe, expect, it, beforeEach } from 'vitest';
import {
  getZeroPollingMetricsSnapshot,
  recordAutomaticHttpRefresh,
  recordManualRefresh,
  recordPollingRemoved,
  recordRuntimeCacheHit,
  recordRuntimeCacheMiss,
  recordSocketUpdate,
  resetZeroPollingMetricsForTests,
} from './zeroPollingMetrics';

describe('zeroPollingMetrics (Phase 9)', () => {
  beforeEach(() => {
    resetZeroPollingMetricsForTests();
  });

  it('accumulates counters independently', () => {
    recordPollingRemoved(2);
    recordSocketUpdate();
    recordManualRefresh();
    recordRuntimeCacheHit(3);
    recordRuntimeCacheMiss();
    const snap = getZeroPollingMetricsSnapshot();
    expect(snap.polling_removed_total).toBe(2);
    expect(snap.socket_updates_total).toBe(1);
    expect(snap.manual_refresh_total).toBe(1);
    expect(snap.runtime_cache_hits).toBe(3);
    expect(snap.runtime_cache_miss).toBe(1);
    expect(snap.automatic_http_refresh_total).toBe(0);
  });

  it('tracks automatic HTTP refreshes separately (target 0 in normal ops)', () => {
    recordAutomaticHttpRefresh();
    expect(getZeroPollingMetricsSnapshot().automatic_http_refresh_total).toBe(1);
  });
});
