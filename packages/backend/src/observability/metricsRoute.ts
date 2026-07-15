import type { Express, Request, Response } from 'express';
import { getObservabilityConfig } from './config.js';
import { getMetricsSnapshot, renderPrometheusText } from './registry.js';
import { refreshRedisPrepMetrics } from './redisPrepMetrics.js';
import { recordChatClientSample } from './chatBackendMetrics.js';
import { getRedisAdapterRuntimeStatus } from '../realtime/redisSocketAdapter.js';

function authorized(req: Request): boolean {
  const cfg = getObservabilityConfig();
  // Beacon FE envia só agregados numéricos (sem PII) — não exige token scrape.
  if (req.method === 'POST' && String(req.path || '').includes('chat-client')) return true;
  if (!cfg.metricsToken) return true;
  const header = String(req.headers.authorization || '');
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const q = typeof req.query.token === 'string' ? req.query.token : '';
  return bearer === cfg.metricsToken || q === cfg.metricsToken;
}

export function installMetricsRoutes(app: Express): void {
  app.get('/metrics/platform', (req: Request, res: Response) => {
    const cfg = getObservabilityConfig();
    if (!cfg.enabled) {
      res.status(404).json({ error: 'observability_disabled', hint: 'Set OBS_METRICS=1' });
      return;
    }
    if (!authorized(req)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    refreshRedisPrepMetrics();
    const format = String(req.query.format || 'json').toLowerCase();
    if (format === 'prometheus' || format === 'text') {
      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.status(200).send(renderPrometheusText());
      return;
    }
    res.status(200).json({
      ok: true,
      config: {
        sampleRate: cfg.sampleRate,
        sqlSlowMs: cfg.sqlSlowMs,
        redisPrep: cfg.redisPrep,
      },
      redisAdapter: getRedisAdapterRuntimeStatus(),
      metrics: getMetricsSnapshot(),
    });
  });

  /** Beacon leve do FE (MB-025) — amostrado; sem auth de sessão para reduzir overhead (token opcional). */
  app.post('/metrics/platform/chat-client', (req: Request, res: Response) => {
    const cfg = getObservabilityConfig();
    if (!cfg.enabled) {
      res.status(404).json({ error: 'observability_disabled' });
      return;
    }
    if (!authorized(req)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const body = (req.body || {}) as Record<string, unknown>;
    recordChatClientSample({
      inbox_ms: num(body.inbox_ms),
      messages_ms: num(body.messages_ms),
      realtime_ms: num(body.realtime_ms),
      unread: num(body.unread),
      store_sync: num(body.store_sync),
      bridge_sync: num(body.bridge_sync),
    });
    res.status(204).end();
  });
}

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
