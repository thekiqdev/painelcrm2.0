import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Persister } from '@tanstack/query-persist-client-core';
import { get, set, del } from 'idb-keyval';

/** 24h — alinhado ao plano (TTL inteligente). */
export const CHAT_PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const PERSIST_KEY_PREFIX = 'painelcrm:rq:chat:v1';

const idbStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const v = await get<string>(name);
    return v ?? null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};

let activePersistStorageKey: string | null = null;

export function buildChatPersistStorageKey(tenantId: string, userId: string): string {
  return `${PERSIST_KEY_PREFIX}:${tenantId}:${userId}`;
}

export function buildChatPersistBuster(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`;
}

/** Opt-in em dev via VITE_CHAT_PERSIST_CACHE=1; em produção ativo por defeito. */
export function isChatPersistCacheEnabled(): boolean {
  const flag = import.meta.env.VITE_CHAT_PERSIST_CACHE as string | undefined;
  if (flag === '0' || flag === 'false') return false;
  if (flag === '1' || flag === 'true') return true;
  return import.meta.env.PROD;
}

/** Apenas queries críticas do chat — nunca uploads, typing ou websocket. */
export function shouldPersistChatQueryKey(queryKey: readonly unknown[]): boolean {
  if (!Array.isArray(queryKey) || queryKey.length < 2) return false;
  const root = queryKey[0];
  if (root === 'chat') {
    const sub = queryKey[1];
    return sub === 'instances' || sub === 'nav-unread';
  }
  if (root === 'floating-chat') {
    const sub = queryKey[1];
    return (
      sub === 'conversations' ||
      sub === 'bubble-recent' ||
      sub === 'messages' ||
      sub === 'minimized-meta' ||
      sub === 'conversation-meta'
    );
  }
  return false;
}

export function createChatPersister(tenantId: string, userId: string): Persister {
  const key = buildChatPersistStorageKey(tenantId, userId);
  activePersistStorageKey = key;
  return createAsyncStoragePersister({
    storage: idbStorage,
    key,
    throttleTime: 1200,
  });
}

export function registerActiveChatPersistSession(tenantId: string, userId: string): void {
  activePersistStorageKey = buildChatPersistStorageKey(tenantId, userId);
}

/** Logout, troca de tenant ou corrupção — remove IndexedDB do chat. */
export async function clearActiveChatPersistentCache(): Promise<void> {
  const key = activePersistStorageKey;
  activePersistStorageKey = null;
  if (!key) return;
  try {
    await del(key);
  } catch {
    /* ignore */
  }
}

export async function clearChatPersistentCacheForSession(
  tenantId: string,
  userId: string,
): Promise<void> {
  try {
    await del(buildChatPersistStorageKey(tenantId, userId));
  } catch {
    /* ignore */
  }
}
