/**
 * Cache em memória do GET /api/announcements/updates/unread-count.
 * Reduz carga na BD e latência (o cliente faz poll ~45s; TTL por defeito igual).
 */
const DEFAULT_TTL_MS = Math.max(
  5000,
  parseInt(process.env.ANNOUNCEMENTS_UNREAD_COUNT_CACHE_TTL_MS || '45000', 10),
);

type Entry = { expiresAt: number; count: number };
const store = new Map<string, Entry>();

function cacheKey(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`;
}

export function getCachedUpdatesUnreadCount(tenantId: string, userId: string): number | undefined {
  const k = cacheKey(tenantId, userId);
  const e = store.get(k);
  if (!e || Date.now() >= e.expiresAt) {
    if (e) store.delete(k);
    return undefined;
  }
  return e.count;
}

export function setCachedUpdatesUnreadCount(tenantId: string, userId: string, count: number): void {
  store.set(cacheKey(tenantId, userId), {
    count,
    expiresAt: Date.now() + DEFAULT_TTL_MS,
  });
}

export function invalidateUpdatesUnreadCountCache(tenantId: string, userId: string): void {
  store.delete(cacheKey(tenantId, userId));
}
