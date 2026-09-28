/**
 * Feature Flag Manager — migração Chat (F1–F4).
 * Fonte única: valores persistidos no painel Super Admin (GET /api/chat/migration-flags).
 * Não utilizar variáveis .env para estas flags.
 */
import { apiClient } from '@/integrations/api/client';
import {
  CHAT_MIGRATION_FLAG_KEYS,
  createDefaultChatMigrationFlags,
  type ChatMigrationFlagKey,
  type ChatMigrationFlagsMap,
} from '@/lib/chatMigrationFlags/catalog';

let flags: ChatMigrationFlagsMap = createDefaultChatMigrationFlags();
let loaded = false;
let loadPromise: Promise<void> | null = null;
let updatedAt: string | null = null;

export function isChatMigrationFlagsLoaded(): boolean {
  return loaded;
}

export function getChatMigrationFlagsUpdatedAt(): string | null {
  return updatedAt;
}

export function getChatMigrationFlagsSnapshot(): Readonly<ChatMigrationFlagsMap> {
  return { ...flags };
}

export function isChatMigrationFlagEnabled(key: ChatMigrationFlagKey): boolean {
  return flags[key] === true;
}

export function resetChatMigrationFlagsToDefaults(): void {
  flags = createDefaultChatMigrationFlags();
  loaded = false;
  loadPromise = null;
  updatedAt = null;
}

/** Somente testes — não usar em produção. */
export function setChatMigrationFlagsForTests(partial: Partial<ChatMigrationFlagsMap>): void {
  flags = { ...createDefaultChatMigrationFlags(), ...partial };
  loaded = true;
}

export async function loadChatMigrationFlags(options?: { force?: boolean }): Promise<void> {
  if (loaded && !options?.force) return;
  if (loadPromise && !options?.force) {
    await loadPromise;
    return;
  }

  loadPromise = (async () => {
    const token = apiClient.getToken();
    if (!token) {
      resetChatMigrationFlagsToDefaults();
      return;
    }

    const res = await apiClient.get<{
      ok: boolean;
      flags?: Partial<ChatMigrationFlagsMap>;
      updated_at?: string | null;
      error?: string;
    }>('/api/chat/migration-flags');

    const next = createDefaultChatMigrationFlags();
    if (!res.error && res.data?.ok && res.data.flags) {
      for (const key of CHAT_MIGRATION_FLAG_KEYS) {
        if (typeof res.data.flags[key] === 'boolean') {
          next[key] = res.data.flags[key]!;
        }
      }
      updatedAt = res.data.updated_at ?? null;
    }

    flags = next;
    loaded = true;
  })();

  try {
    await loadPromise;
  } finally {
    loadPromise = null;
  }
}

/** Após PATCH no Super Admin — atualiza cache local imediatamente. */
export function applyChatMigrationFlagPatch(key: ChatMigrationFlagKey, enabled: boolean): void {
  flags = { ...flags, [key]: enabled };
  loaded = true;
}

export async function refreshChatMigrationFlagsFromServer(): Promise<void> {
  await loadChatMigrationFlags({ force: true });
}
