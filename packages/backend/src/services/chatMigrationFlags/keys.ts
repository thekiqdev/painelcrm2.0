/** Chaves oficiais das Feature Flags da migração Chat (F1–F4 + desenvolvimento). */

export const CHAT_MIGRATION_FLAG_KEYS = [
  'CHAT_SINGLE_SOCKET',
  'CHAT_WS_PATCH_MESSAGE',
  'CHAT_WS_PATCH_CONVERSATION',
  'CHAT_WS_PATCH_MESSAGE_UPDATED',
  'CHAT_WS_PATCH_DELETE',
  'CHAT_WS_PATCH_ATTENDANCE',
  'CHAT_INSTANCE_REGISTRY',
  'CHAT_UNREAD_ENGINE',
  'CHAT_ATTENDANCE_RECONCILE',
  'CHAT_AGGREGATED_FLOAT',
  'CHAT_AGGREGATED_LEAD',
  'CHAT_AGGREGATED_SIDEBAR',
  'CHAT_AGGREGATED_CHAT',
  'CHAT_AGGREGATED_API_SHADOW',
  'CHAT_AGGREGATED_DEV_LOG',
  'CHAT_CORE_METRICS',
  'CHAT_CORE_STORE',
] as const;

export type ChatMigrationFlagKey = (typeof CHAT_MIGRATION_FLAG_KEYS)[number];

export const CHAT_MIGRATION_FLAGS_SETTINGS_KEY = 'chat_migration_flags';

export function isChatMigrationFlagKey(key: string): key is ChatMigrationFlagKey {
  return (CHAT_MIGRATION_FLAG_KEYS as readonly string[]).includes(key);
}

export const CHAT_AGGREGATED_SURFACE_FLAG_KEYS = [
  'CHAT_AGGREGATED_FLOAT',
  'CHAT_AGGREGATED_LEAD',
  'CHAT_AGGREGATED_SIDEBAR',
  'CHAT_AGGREGATED_CHAT',
] as const satisfies readonly ChatMigrationFlagKey[];
