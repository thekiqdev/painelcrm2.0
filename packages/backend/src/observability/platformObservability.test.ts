import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ensureCounter,
  ensureHistogram,
  incCounter,
  observeHistogram,
  getMetricsSnapshot,
  renderPrometheusText,
  resetMetricsRegistryForTests,
} from './registry.js';
import { recordWorkerRun } from './workerMetrics.js';
import { recordCacheEvent } from './cacheMetrics.js';
import { recordChatClientSample } from './chatBackendMetrics.js';

describe('MB-024 platform observability registry', () => {
  const prev = process.env.OBS_METRICS;

  beforeEach(() => {
    resetMetricsRegistryForTests();
    process.env.OBS_METRICS = '1';
    process.env.OBS_METRICS_SAMPLE_RATE = '1';
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.OBS_METRICS;
    else process.env.OBS_METRICS = prev;
    resetMetricsRegistryForTests();
  });

  it('accumulates counters and histograms', () => {
    ensureCounter('t_requests', 'test');
    ensureHistogram('t_latency', 'test', [10, 50, 100]);
    incCounter('t_requests', { method: 'GET' });
    observeHistogram('t_latency', 12, { method: 'GET' });
    const snap = getMetricsSnapshot();
    expect(snap.counters.t_requests?.[0]?.value).toBe(1);
    expect(snap.histograms.t_latency?.[0]?.count).toBe(1);
    expect(renderPrometheusText()).toContain('t_requests');
  });

  it('records worker / cache / chat client samples when enabled', () => {
    recordWorkerRun('sla', 5, true);
    recordCacheEvent('hit', 'inbox');
    recordChatClientSample({ inbox_ms: 40, messages_ms: 12, unread: 1 });
    const snap = getMetricsSnapshot();
    expect(snap.counters.worker_runs_total?.length).toBeGreaterThan(0);
    expect(snap.counters.cache_hit_total?.length).toBeGreaterThan(0);
    expect(snap.counters.chat_client_samples_total?.[0]?.value).toBe(1);
  });
});
