/**
 * Cache em memória dos toggles globais do motor da PLATAFORMA (superadmin_settings).
 */
import type { Pool } from 'pg';
import { loadPlatformNotificationsGlobalFlagsFromDb } from './platformNotificationsGlobalSettingsService.js';

export type PlatformNeRuntimeFlags = {
  enabled: boolean;
  whatsappSend: boolean;
  verboseLog: boolean;
  businessEvents: boolean;
  pilotTargetTenantIds: string | null;
  /** @deprecated legado; o motor usa apenas `whatsappChatInstanceId`. */
  dispatchTenantId: string | null;
  /** @deprecated legado; o motor usa apenas `whatsappChatInstanceId`. */
  dispatchSenderUserId: string | null;
  /** `chat_instances.id` da instância WhatsApp do Super Admin designada para o motor da plataforma. */
  whatsappChatInstanceId: string | null;
};

const DEFAULT_FLAGS: PlatformNeRuntimeFlags = {
  enabled: true,
  whatsappSend: true,
  verboseLog: false,
  businessEvents: true,
  pilotTargetTenantIds: null,
  dispatchTenantId: null,
  dispatchSenderUserId: null,
  whatsappChatInstanceId: null,
};

let cache: PlatformNeRuntimeFlags = { ...DEFAULT_FLAGS };

export function getCachedPlatformNotificationsFlags(): Readonly<PlatformNeRuntimeFlags> {
  return cache;
}

export async function refreshPlatformNotificationsFlagsFromPool(pool: Pool): Promise<void> {
  const f = await loadPlatformNotificationsGlobalFlagsFromDb(pool);
  cache = {
    enabled: f.enabled,
    whatsappSend: f.whatsappSend,
    verboseLog: f.verboseLog,
    businessEvents: f.businessEvents,
    pilotTargetTenantIds: f.pilotTargetTenantIds,
    dispatchTenantId: f.dispatchTenantId,
    dispatchSenderUserId: f.dispatchSenderUserId,
    whatsappChatInstanceId: f.whatsappChatInstanceId,
  };
}
