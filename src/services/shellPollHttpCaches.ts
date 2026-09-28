/**
 * TF8 E4 — soft caches dos polls do shell (badges + catálogos).
 */

import { createSoftHttpCache } from './shellHttpSoftCache';

/** Badges: coalescem storm de eventos + remount (~20s). */
export const SHELL_BADGE_TTL_MS = 20_000;

/** Catálogos (tags / categories): mudam raro (~60s). */
export const SHELL_CATALOG_TTL_MS = 60_000;

export const ticketMenuCountCache = createSoftHttpCache<number>({ ttlMs: SHELL_BADGE_TTL_MS });
export const notificationsUnreadCache = createSoftHttpCache<number>({ ttlMs: SHELL_BADGE_TTL_MS });
export const ticketCategoriesCache = createSoftHttpCache<unknown[]>({ ttlMs: SHELL_CATALOG_TTL_MS });
export const kanbanTagsCache = createSoftHttpCache<unknown[]>({ ttlMs: SHELL_CATALOG_TTL_MS });

export function resetShellPollHttpCaches(): void {
  ticketMenuCountCache.reset();
  notificationsUnreadCache.reset();
  ticketCategoriesCache.reset();
  kanbanTagsCache.reset();
}
