/**
 * TD S5 — rate limit de verify DNS (tenant + Partner).
 * Default: 5 / minuto por chave (`tenant:{id}` | `partner:{id}`).
 */

const WINDOW_MS = 60_000;

function maxRequests(): number {
  const n = parseInt(process.env.RATE_LIMIT_DOMAIN_VERIFY_MAX || '5', 10);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

const store = new Map<string, { count: number; resetAt: number }>();

/** @returns true se permitido; false se excedeu. */
export function checkDomainVerifyRateLimit(key: string): boolean {
  const max = maxRequests();
  const now = Date.now();
  const entry = store.get(key);
  if (!entry) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (now >= entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + WINDOW_MS;
    return true;
  }
  entry.count += 1;
  return entry.count <= max;
}

/** Testes / reset em hot-reload. */
export function resetDomainVerifyRateLimitStore(): void {
  store.clear();
}
