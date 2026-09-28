/**
 * Billing Engine V2 — Sprint 2.3C: in-memory context cache (não persiste).
 */
import type { BillingExecutionContext } from './types.js';

type CacheEntry = {
  context: BillingExecutionContext;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 30_000;

function cacheKey(subscriptionId: string, cycleKey: string, correlationId?: string): string {
  return `${subscriptionId}:${cycleKey}:${correlationId ?? 'default'}`;
}

export class BillingExecutionContextCache {
  private readonly store = new Map<string, CacheEntry>();

  constructor(private readonly ttlMs: number = DEFAULT_TTL_MS) {}

  get(subscriptionId: string, cycleKey: string, correlationId?: string): BillingExecutionContext | null {
    const key = cacheKey(subscriptionId, cycleKey, correlationId);
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.context;
  }

  set(
    subscriptionId: string,
    cycleKey: string,
    context: BillingExecutionContext,
    correlationId?: string
  ): void {
    const key = cacheKey(subscriptionId, cycleKey, correlationId);
    this.store.set(key, { context, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

export const billingExecutionContextCache = new BillingExecutionContextCache();
