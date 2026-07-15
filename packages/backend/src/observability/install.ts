import type { Express } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import { appLogger } from './appLogger.js';
import { getObservabilityConfig } from './config.js';
import { installHttpMetrics } from './httpMetrics.js';
import { installMetricsRoutes } from './metricsRoute.js';
import { startRuntimeMetricsSampler } from './runtimeMetrics.js';
import { registerSqlMetricDefs } from './sqlMetrics.js';
import { registerWorkerMetricDefs } from './workerMetrics.js';
import { registerCacheMetricDefs } from './cacheMetrics.js';
import { registerChatBackendMetricDefs } from './chatBackendMetrics.js';
import { registerRedisPrepMetricDefs, refreshRedisPrepMetrics } from './redisPrepMetrics.js';
import { attachSocketObservability } from './socketMetrics.js';

let installed = false;

/**
 * MB-024 — monta coleta + endpoints. Idempotente. Opt-in via OBS_METRICS=1.
 */
export function installPlatformObservability(app: Express): void {
  if (installed) return;
  installed = true;

  const cfg = getObservabilityConfig();
  registerSqlMetricDefs();
  registerWorkerMetricDefs();
  registerCacheMetricDefs();
  registerChatBackendMetricDefs();
  registerRedisPrepMetricDefs();

  installMetricsRoutes(app);

  if (!cfg.enabled) {
    appLogger.boot('observability', 'platform metrics disabled (OBS_METRICS!=1)');
    return;
  }

  installHttpMetrics(app);
  startRuntimeMetricsSampler();
  refreshRedisPrepMetrics();
  appLogger.boot('observability', 'platform metrics enabled', {
    sampleRate: cfg.sampleRate,
    sqlSlowMs: cfg.sqlSlowMs,
    redisPrep: cfg.redisPrep,
    tokenRequired: Boolean(cfg.metricsToken),
  });
}

export function installSocketObservability(io: SocketIOServer): void {
  attachSocketObservability(io);
}
