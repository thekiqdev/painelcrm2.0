/**
 * Toggles globais do motor de notificações em `superadmin_settings`.
 * Controlo operacional via Super Admin; leitura em runtime com cache (ver notificationsEngineRuntimeFlags).
 */
import type { Pool } from 'pg';

export const NE_GLOBAL_KEY_ENABLED = 'notifications_engine_enabled';
export const NE_GLOBAL_KEY_BUSINESS_EVENTS = 'notifications_engine_business_events_enabled';
export const NE_GLOBAL_KEY_WHATSAPP_SEND = 'notifications_engine_whatsapp_send_enabled';

export type NotificationsEngineGlobalFlags = {
  notifications_engine_enabled: boolean;
  notifications_engine_business_events_enabled: boolean;
  notifications_engine_whatsapp_send_enabled: boolean;
};

function parseBoolSetting(raw: string | null | undefined, defaultTrue: boolean): boolean {
  if (raw == null || String(raw).trim() === '') return defaultTrue;
  const v = String(raw).trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return defaultTrue;
}

function isMissingSuperadminSettingsTable(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const msg = e instanceof Error ? e.message : String(e);
  return code === '42P01' || /relation\s+["']?superadmin_settings["']?\s+does not exist/i.test(msg);
}

export async function loadNotificationsEngineGlobalFlagsFromDb(pool: Pool): Promise<{
  enabled: boolean;
  businessEvents: boolean;
  whatsappSend: boolean;
}> {
  try {
    const r = await pool.query<{ key: string; value: string | null }>(
      `SELECT key, value FROM superadmin_settings
       WHERE key IN ($1, $2, $3)`,
      [NE_GLOBAL_KEY_ENABLED, NE_GLOBAL_KEY_BUSINESS_EVENTS, NE_GLOBAL_KEY_WHATSAPP_SEND],
    );
    const map: Record<string, string | null> = {};
    for (const row of r.rows) {
      map[row.key] = row.value;
    }
    return {
      enabled: parseBoolSetting(map[NE_GLOBAL_KEY_ENABLED], true),
      businessEvents: parseBoolSetting(map[NE_GLOBAL_KEY_BUSINESS_EVENTS], true),
      whatsappSend: parseBoolSetting(map[NE_GLOBAL_KEY_WHATSAPP_SEND], true),
    };
  } catch (e: unknown) {
    if (isMissingSuperadminSettingsTable(e)) {
      console.warn(
        '[notifications-engine/global] superadmin_settings ausente; flags globais assumidas como true.',
      );
      return { enabled: true, businessEvents: true, whatsappSend: true };
    }
    throw e;
  }
}

export async function getNotificationsEngineGlobalSettingsRow(
  pool: Pool,
): Promise<NotificationsEngineGlobalFlags> {
  const f = await loadNotificationsEngineGlobalFlagsFromDb(pool);
  return {
    notifications_engine_enabled: f.enabled,
    notifications_engine_business_events_enabled: f.businessEvents,
    notifications_engine_whatsapp_send_enabled: f.whatsappSend,
  };
}

export async function upsertNotificationsEngineGlobalSettings(
  pool: Pool,
  input: Partial<NotificationsEngineGlobalFlags>,
): Promise<NotificationsEngineGlobalFlags> {
  try {
    if (input.notifications_engine_enabled !== undefined) {
      await pool.query(
        `INSERT INTO superadmin_settings (key, value, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [NE_GLOBAL_KEY_ENABLED, input.notifications_engine_enabled ? 'true' : 'false'],
      );
    }
    if (input.notifications_engine_business_events_enabled !== undefined) {
      await pool.query(
        `INSERT INTO superadmin_settings (key, value, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [NE_GLOBAL_KEY_BUSINESS_EVENTS, input.notifications_engine_business_events_enabled ? 'true' : 'false'],
      );
    }
    if (input.notifications_engine_whatsapp_send_enabled !== undefined) {
      await pool.query(
        `INSERT INTO superadmin_settings (key, value, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [NE_GLOBAL_KEY_WHATSAPP_SEND, input.notifications_engine_whatsapp_send_enabled ? 'true' : 'false'],
      );
    }
    return await getNotificationsEngineGlobalSettingsRow(pool);
  } catch (e: unknown) {
    if (isMissingSuperadminSettingsTable(e)) {
      throw new Error(
        'Tabela superadmin_settings não existe. Execute as migrações (database/init/31_superadmin_settings.sql).',
      );
    }
    throw e;
  }
}
