/**
 * Billing Engine V2 — Sprint 2.3D: Projection Engine (READ ONLY, sem side effects).
 */
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import { buildProjectedInvoice } from './billingProjectionBuilder.js';
import { getCachedProjection, setCachedProjection } from './projectionCache.js';
import { computeProjectionHash } from './projectionHash.js';
import {
  logProjectionEngine,
  logProjectionError,
  logProjectionHash,
} from './projectionLogger.js';
import { recordProjectionBuild } from './projectionMetrics.js';
import type { ProjectBillingInput, ProjectionResult } from './types.js';
import { PROJECTION_ENGINE_VERSION } from './types.js';

export class BillingProjectionEngine {
  /**
   * Projeta cobrança completa em memória — nunca persiste ou executa cobrança.
   */
  static project(input: ProjectBillingInput): ProjectionResult {
    const { context, skipCache = false } = input;
    const logPayload = {
      correlation_id: context.metadata.correlation_id ?? undefined,
      subscription_id: context.subscription.id,
      cycle_key: context.cycle,
    };

    const started = Date.now();

    try {
      logProjectionEngine('start', logPayload);

      if (!skipCache) {
        const cached = getCachedProjection(context);
        if (cached) {
          logProjectionEngine('complete', {
            ...logPayload,
            duration_ms: cached.duration,
            cache_hit: true,
          });
          recordProjectionBuild({
            durationMs: cached.duration,
            cacheHit: true,
          });
          return cached;
        }
      }

      const result = buildProjectedInvoice(context, false);

      const hash = computeProjectionHash(result.projectedInvoice);
      if (hash !== result.diagnostics.hash) {
        result.diagnostics.hash = hash;
        result.projectedInvoice.diagnostics.hash = hash;
      }

      logProjectionHash({ ...logPayload, hash });
      logProjectionEngine('complete', {
        ...logPayload,
        duration_ms: result.duration,
        cache_hit: false,
      });

      setCachedProjection(context, result);
      recordProjectionBuild({
        durationMs: result.duration,
        cacheHit: false,
        failed: !result.approved,
      });

      return result;
    } catch (error) {
      logProjectionError(logPayload, error, 'PROJECTION_ENGINE_FAILED');
      recordProjectionBuild({
        durationMs: Date.now() - started,
        cacheHit: false,
        failed: true,
      });
      throw error;
    }
  }
}

export function getProjectionEngineVersion(): string {
  return PROJECTION_ENGINE_VERSION;
}
