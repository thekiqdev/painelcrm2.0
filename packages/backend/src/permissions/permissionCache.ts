/**
 * Cache de permissões por chave (ex.: permissions:{userId}:{version}).
 * Com versionamento, a invalidação é feita ao incrementar a versão (nova chave); o TTL limpa entradas antigas.
 */

import type { ModulePermissionsMap } from './permissionTypes.js';

export interface PermissionCacheAdapter {
  get(cacheKey: string): Promise<ModulePermissionsMap | null>;
  set(cacheKey: string, permissions: ModulePermissionsMap, ttlSeconds?: number): Promise<void>;
  invalidate(userId: string): Promise<void>;
}

const memoryStore = new Map<string, { data: ModulePermissionsMap; expiresAt?: number }>();

export const permissionCache: PermissionCacheAdapter = {
  async get(cacheKey: string): Promise<ModulePermissionsMap | null> {
    const entry = memoryStore.get(cacheKey);
    if (!entry) return null;
    if (entry.expiresAt != null && Date.now() > entry.expiresAt) {
      memoryStore.delete(cacheKey);
      return null;
    }
    return entry.data;
  },

  async set(cacheKey: string, permissions: ModulePermissionsMap, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds != null ? Date.now() + ttlSeconds * 1000 : undefined;
    memoryStore.set(cacheKey, { data: permissions, expiresAt });
  },

  async invalidate(userId: string): Promise<void> {
    const prefix = `permissions:${userId}:`;
    for (const key of memoryStore.keys()) {
      if (key.startsWith(prefix)) memoryStore.delete(key);
    }
  },
};
