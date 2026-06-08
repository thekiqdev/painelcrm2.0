import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import {
  CORRELATION_HEADER,
  parseCorrelationHeader,
  requestContextStorage,
} from '../context/requestContext.js';
import { logCorrelation } from '../platform/platformFeatureFlagLogger.js';
import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';

/**
 * Middleware P0: propaga x-correlation-id em todo o request (ALS).
 * Não altera auth nem resposta de negócio.
 */
export async function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const headerVal = req.headers[CORRELATION_HEADER] ?? req.headers[CORRELATION_HEADER.toLowerCase()];
    const parsed = parseCorrelationHeader(headerVal);
    const correlationId = parsed ?? randomUUID();

    const ctx = {
      correlationId,
      method: req.method,
      path: req.originalUrl || req.url,
    };

    res.setHeader(CORRELATION_HEADER, correlationId);

    const run = () => {
      logCorrelation('request_start', {
        correlation_id: correlationId,
        method: ctx.method,
        path: ctx.path,
      });
      res.on('finish', () => {
        logCorrelation('request_finish', {
          correlation_id: correlationId,
          status: res.statusCode,
          method: ctx.method,
          path: ctx.path,
        });
      });
      next();
    };

    const enabled = await featureFlagRegistry.isEnabled('platform.correlation_middleware_v1', {});
    if (!enabled) {
      run();
      return;
    }

    requestContextStorage.run(ctx, run);
  } catch (e) {
    console.error('[CORRELATION] middleware_error', e);
    next(e);
  }
}
