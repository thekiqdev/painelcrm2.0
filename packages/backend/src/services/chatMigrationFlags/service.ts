/**
 * Persistência e cache das Feature Flags da migração Chat (superadmin_settings).
 * Fonte única — não utilizar variáveis .env para estas flags.
 */
import { pool } from '../../utils/db.js';
import {
  CHAT_MIGRATION_FLAG_KEYS,
  CHAT_MIGRATION_FLAGS_SETTINGS_KEY,
  CHAT_AGGREGATED_SURFACE_FLAG_KEYS,
  type ChatMigrationFlagKey,
  isChatMigrationFlagKey,
} from './keys.js';

export type ChatMigrationFlagsMap = Record<ChatMigrationFlagKey, boolean>;

function defaultFlags(): ChatMigrationFlagsMap {
  return Object.fromEntries(CHAT_MIGRATION_FLAG_KEYS.map((k) => [k, false])) as ChatMigrationFlagsMap;
}

let cache: ChatMigrationFlagsMap = defaultFlags();
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 5_000;

function parseStoredFlags(raw: string | null | undefined): ChatMigrationFlagsMap {
  const base = defaultFlags();
  if (!raw?.trim()) return base;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of CHAT_MIGRATION_FLAG_KEYS) {
      if (typeof parsed[key] === 'boolean') {
        base[key] = parsed[key];
      }
    }
    return base;
  } catch {
    return base;
  }
}

function serializeFlags(flags: ChatMigrationFlagsMap): string {
  return JSON.stringify(flags);
}

export function getCachedChatMigrationFlags(): Readonly<ChatMigrationFlagsMap> {
  return cache;
}

export function isChatMigrationFlagEnabled(key: ChatMigrationFlagKey): boolean {
  return cache[key] === true;
}

/** Backend API agregada ativa quando qualquer superfície F4 está ligada no painel. */
export function isChatAggregatedConversationsEnabled(): boolean {
  return CHAT_AGGREGATED_SURFACE_FLAG_KEYS.some((k) => cache[k]);
}

/** TF6 — shadow nunca no hot path de produção (mesmo se flag ON no painel). */
let shadowProdFailSafeWarned = false;

export function isChatAggregatedApiShadowEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') {
    if (isChatMigrationFlagEnabled('CHAT_AGGREGATED_API_SHADOW') && !shadowProdFailSafeWarned) {
      shadowProdFailSafeWarned = true;
      console.warn(
        '[chat-migration] CHAT_AGGREGATED_API_SHADOW ignored in production (TF6 fail-safe)',
      );
    }
    return false;
  }
  return isChatMigrationFlagEnabled('CHAT_AGGREGATED_API_SHADOW');
}

export function isChatAggregatedDevLogEnabled(): boolean {
  // TF6 — dumps `rowIds×200` não devem rodar no hot path de produção.
  if (process.env.NODE_ENV === 'production') return false;
  return isChatMigrationFlagEnabled('CHAT_AGGREGATED_DEV_LOG');
}

export function logChatAggregatedDev(event: string, payload: Record<string, unknown>): void {
  if (!isChatAggregatedDevLogEnabled()) return;
  console.info(`[chat-aggregated-dev] ${event}`, payload);
}

export async function loadChatMigrationFlagsFromDb(): Promise<ChatMigrationFlagsMap> {
  const r = await pool.query<{ value: string | null }>(
    `SELECT value FROM superadmin_settings WHERE key = $1 LIMIT 1`,
    [CHAT_MIGRATION_FLAGS_SETTINGS_KEY],
  );
  const flags = parseStoredFlags(r.rows[0]?.value ?? null);
  cache = flags;
  cacheLoadedAt = Date.now();
  return flags;
}

export async function ensureChatMigrationFlagsFresh(): Promise<Readonly<ChatMigrationFlagsMap>> {
  if (Date.now() - cacheLoadedAt > CACHE_TTL_MS) {
    await loadChatMigrationFlagsFromDb();
  }
  return cache;
}

export async function getChatMigrationFlagsForApi(): Promise<{
  flags: ChatMigrationFlagsMap;
  updated_at: string | null;
}> {
  await ensureChatMigrationFlagsFresh();
  const r = await pool.query<{ updated_at: Date | null }>(
    `SELECT updated_at FROM superadmin_settings WHERE key = $1 LIMIT 1`,
    [CHAT_MIGRATION_FLAGS_SETTINGS_KEY],
  );
  return {
    flags: { ...cache },
    updated_at: r.rows[0]?.updated_at?.toISOString() ?? null,
  };
}

export async function updateChatMigrationFlag(
  key: ChatMigrationFlagKey,
  enabled: boolean,
): Promise<ChatMigrationFlagsMap> {
  await ensureChatMigrationFlagsFresh();
  const next = { ...cache, [key]: enabled };
  await pool.query(
    `INSERT INTO superadmin_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [CHAT_MIGRATION_FLAGS_SETTINGS_KEY, serializeFlags(next)],
  );
  cache = next;
  cacheLoadedAt = Date.now();
  return { ...next };
}

export function clearChatMigrationFlagsCacheForTests(): void {
  cache = defaultFlags();
  cacheLoadedAt = 0;
}

export function setChatMigrationFlagsCacheForTests(partial: Partial<ChatMigrationFlagsMap>): void {
  cache = { ...defaultFlags(), ...partial };
  cacheLoadedAt = Date.now();
}

export { isChatMigrationFlagKey };
