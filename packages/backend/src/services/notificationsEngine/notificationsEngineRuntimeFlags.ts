/**
 * Cache em memória dos toggles globais do motor (lidos de superadmin_settings).
 * Atualizado no arranque, por intervalo no index.ts e após PUT no Super Admin.
 */
import type { Pool } from 'pg';
import { loadNotificationsEngineGlobalFlagsFromDb } from './notificationsEngineGlobalSettingsService.js';

export type NeRuntimeFlags = {
  enabled: boolean;
  businessEvents: boolean;
  whatsappSend: boolean;
};

const DEFAULT_FLAGS: NeRuntimeFlags = {
  enabled: true,
  businessEvents: true,
  whatsappSend: true,
};

let cache: NeRuntimeFlags = { ...DEFAULT_FLAGS };

export function getCachedNotificationsEngineFlags(): Readonly<NeRuntimeFlags> {
  return cache;
}

export async function refreshNotificationsEngineFlagsFromPool(pool: Pool): Promise<void> {
  const f = await loadNotificationsEngineGlobalFlagsFromDb(pool);
  cache = {
    enabled: f.enabled,
    businessEvents: f.businessEvents,
    whatsappSend: f.whatsappSend,
  };
}
