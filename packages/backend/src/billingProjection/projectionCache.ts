/**
 * Billing Engine V2 — Sprint 2.3D: cache in-memory de projeções (TTL curto).
 */
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import type { ProjectionResult } from './types.js';

const DEFAULT_TTL_MS = 30_000;

type CacheEntry = {
  result: ProjectionResult;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

function cacheKey(context: BillingExecutionContext): string {
  const correlation = context.metadata.correlation_id ?? '';
  return `${context.subscription.id}:${context.cycle}:${correlation}`;
}

export function getCachedProjection(context: BillingExecutionContext): ProjectionResult | null {
  const key = cacheKey(context);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return {
    ...entry.result,
    diagnostics: { ...entry.result.diagnostics, cacheHit: true },
    projectedInvoice: {
      ...entry.result.projectedInvoice,
      diagnostics: { ...entry.result.projectedInvoice.diagnostics, cacheHit: true },
    },
  };
}

export function setCachedProjection(context: BillingExecutionContext, result: ProjectionResult): void {
  const key = cacheKey(context);
  cache.set(key, { result, expiresAt: Date.now() + DEFAULT_TTL_MS });
}

export function clearProjectionCacheForTests(): void {
  cache.clear();
}
