/**
 * MB-026 — métricas Redis Socket.IO Adapter (atualiza Phase 7 prep).
 */
import { ensureCounter, ensureGauge, ensureHistogram, incCounter, observeHistogram, setGauge } from './registry.js';
import { getObservabilityConfig } from './config.js';

let defs = false;
let nodeId = 'unknown';

export function registerRedisAdapterMetricDefs(): void {
  if (defs) return;
  defs = true;
  ensureGauge('redis_adapter_ready', '1 when Redis Socket.IO adapter is active');
  ensureGauge('redis_adapter_health', '1 when last Redis ping succeeded');
  ensureGauge('redis_metrics_prep_enabled', 'OBS_REDIS_METRICS_PREP (legacy prep flag)');
  ensureCounter('redis_adapter_noop_total', 'Legacy prep noop (unused when adapter active)');
  ensureCounter('redis_adapter_reconnects_total', 'ioredis reconnect events');
  ensureCounter('redis_adapter_fallback_total', 'Times adapter fell back to memory');
  ensureHistogram('redis_ping_ms', 'Redis PING latency');
  ensureGauge('socketio_nodes_reported', 'This process reports as 1 active node');
  ensureGauge('socketio_node_info', 'Labelled node presence (value=1)');
  ensureCounter('socketio_broadcasts_total', 'Broadcast ops (shared with socketMetrics)');
  ensureHistogram('socketio_cross_node_hint_ms', 'Optional cross-node latency samples');
}

export function setSocketNodeId(id: string): void {
  nodeId = id || 'unknown';
  registerRedisAdapterMetricDefs();
  setGauge('socketio_nodes_reported', 1, { node: nodeId });
  setGauge('socketio_node_info', 1, { node: nodeId });
}

export function markRedisAdapterActive(id: string, keyPrefix: string): void {
  registerRedisAdapterMetricDefs();
  nodeId = id;
  setGauge('redis_adapter_ready', 1, { node: id, prefix: keyPrefix });
  setGauge('redis_adapter_health', 1, { node: id });
  setSocketNodeId(id);
}

export function markRedisAdapterFallback(reason: string): void {
  registerRedisAdapterMetricDefs();
  setGauge('redis_adapter_ready', 0, { node: nodeId });
  setGauge('redis_adapter_health', 0, { node: nodeId });
  if (getObservabilityConfig().enabled) {
    incCounter('redis_adapter_fallback_total', { reason: reason.slice(0, 64) });
  }
}

export function markRedisAdapterHealth(ok: boolean, pingMs?: number): void {
  registerRedisAdapterMetricDefs();
  setGauge('redis_adapter_health', ok ? 1 : 0, { node: nodeId });
  if (ok && typeof pingMs === 'number') {
    observeHistogram('redis_ping_ms', pingMs, { node: nodeId });
  }
}

export function recordRedisAdapterReconnect(role: string): void {
  registerRedisAdapterMetricDefs();
  if (!getObservabilityConfig().enabled) return;
  incCounter('redis_adapter_reconnects_total', { role: role.slice(0, 16), node: nodeId });
}

/** Sync refresh for /metrics/platform scrape. */
export function refreshRedisAdapterMetricsForScrape(): void {
  registerRedisAdapterMetricDefs();
  const cfg = getObservabilityConfig();
  setGauge('redis_metrics_prep_enabled', cfg.redisPrep ? 1 : 0);
}
