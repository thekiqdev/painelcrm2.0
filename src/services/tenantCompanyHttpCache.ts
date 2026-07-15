/**
 * MB-010 — Single-flight + soft cache para GET /api/me/tenant/company.
 * Dedup Brand ∥ Settings sem alterar contrato.
 */

import {
  recordRuntimeCacheHit,
  recordRuntimeCacheMiss,
} from '@/features/chat-core/metrics/zeroPollingMetrics';
import type { TenantCompanyPayload } from './tenantCompanyTypes';

export type TenantCompanyHttpCacheStats = {
  httpExecuted: number;
  httpAvoided: number;
  inFlightJoins: number;
};

/** Phase 9 — cache sessão (invalida em logout/patch). */
const TTL_MS = 24 * 60 * 60_000;

let cache: TenantCompanyPayload | null = null;
let fetchedAt = 0;
let inFlight: Promise<{ data?: TenantCompanyPayload; error?: string }> | null = null;

const stats: TenantCompanyHttpCacheStats = {
  httpExecuted: 0,
  httpAvoided: 0,
  inFlightJoins: 0,
};

export function invalidateTenantCompanyHttpCache(): void {
  cache = null;
  fetchedAt = 0;
}

export function resetTenantCompanyHttpCache(): void {
  invalidateTenantCompanyHttpCache();
  inFlight = null;
  stats.httpExecuted = 0;
  stats.httpAvoided = 0;
  stats.inFlightJoins = 0;
}

export function getTenantCompanyHttpCacheStats(): Readonly<TenantCompanyHttpCacheStats> {
  return { ...stats };
}

export function peekTenantCompanyHttpCache(): TenantCompanyPayload | null {
  if (!cache) return null;
  if (Date.now() - fetchedAt >= TTL_MS) return null;
  return cache;
}

export async function getTenantCompanySingleFlight(
  fetchFn: () => Promise<{ data?: TenantCompanyPayload; error?: string }>,
): Promise<{ data?: TenantCompanyPayload; error?: string }> {
  const peeked = peekTenantCompanyHttpCache();
  if (peeked) {
    stats.httpAvoided += 1;
    recordRuntimeCacheHit();
    return { data: peeked };
  }

  if (inFlight) {
    stats.inFlightJoins += 1;
    stats.httpAvoided += 1;
    return inFlight;
  }

  inFlight = (async () => {
    try {
      stats.httpExecuted += 1;
      recordRuntimeCacheMiss();
      const res = await fetchFn();
      if (!res.error && res.data) {
        cache = res.data;
        fetchedAt = Date.now();
      }
      return res;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export function seedTenantCompanyHttpCache(data: TenantCompanyPayload): void {
  cache = data;
  fetchedAt = Date.now();
}
