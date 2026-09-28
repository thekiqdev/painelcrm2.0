/**
 * Phase 7 prep — agora delega a métricas reais do adapter (Phase 8).
 */
export {
  registerRedisAdapterMetricDefs as registerRedisPrepMetricDefs,
  refreshRedisAdapterMetricsForScrape as refreshRedisPrepMetrics,
} from './redisAdapterMetrics.js';
