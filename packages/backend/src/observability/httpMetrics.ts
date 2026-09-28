import type { Express, Request, Response, NextFunction } from 'express';
import { getObservabilityConfig, shouldSampleObservation } from './config.js';
import { ensureCounter, ensureHistogram, incCounter, observeHistogram } from './registry.js';

let installed = false;

export function registerHttpMetricDefs(): void {
  ensureCounter('http_requests_total', 'Total HTTP requests');
  ensureCounter('http_errors_total', 'HTTP responses with status >= 400');
  ensureHistogram('http_request_duration_ms', 'HTTP request latency');
}

export function installHttpMetrics(app: Express): void {
  if (installed) return;
  installed = true;
  registerHttpMetricDefs();

  app.use((req: Request, res: Response, next: NextFunction) => {
    const cfg = getObservabilityConfig();
    if (!cfg.enabled || !shouldSampleObservation(cfg.sampleRate)) {
      next();
      return;
    }
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const route = (req.route?.path && String(req.baseUrl || '') + String(req.route.path)) ||
        (req.path || 'unknown');
      const status = String(res.statusCode || 0);
      const method = req.method || 'GET';
      const labels = { method, route: truncateRoute(route), status };
      incCounter('http_requests_total', labels);
      observeHistogram('http_request_duration_ms', ms, labels);
      if (res.statusCode >= 400) {
        incCounter('http_errors_total', { method, status, class: status[0] + 'xx' });
      }
    });
    next();
  });
}

function truncateRoute(route: string): string {
  const s = route.length > 120 ? route.slice(0, 120) : route;
  return s.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id').replace(/\d{4,}/g, ':n');
}
