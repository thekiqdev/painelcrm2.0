/**
 * Toggles globais do motor de notificações da PLATAFORMA em `superadmin_settings`.
 * Chaves separadas do motor do tenant (`notifications_engine_*`).
 */
import type { Pool } from 'pg';

export const PN_GLOBAL_KEY_ENABLED = 'platform_notifications_enabled';
export const PN_GLOBAL_KEY_WHATSAPP_SEND = 'platform_notifications_whatsapp_send_enabled';
export const PN_GLOBAL_KEY_VERBOSE_LOG = 'platform_notifications_verbose_log';
export const PN_GLOBAL_KEY_PILOT_TARGET_TENANTS = 'platform_notifications_pilot_target_tenant_ids';
export const PN_GLOBAL_KEY_DISPATCH_TENANT_ID = 'platform_notifications_dispatch_tenant_id';
export const PN_GLOBAL_KEY_DISPATCH_SENDER_USER_ID = 'platform_notifications_dispatch_sender_user_id';
/** Instância `chat_instances.id` ligada ao utilizador Super Admin — remetente oficial do motor da plataforma. */
export const PN_GLOBAL_KEY_WHATSAPP_CHAT_INSTANCE_ID = 'platform_notifications_whatsapp_chat_instance_id';
export const PN_GLOBAL_KEY_BUSINESS_EVENTS = 'platform_notifications_business_events_enabled';

export type PlatformNotificationsGlobalFlags = {
  platform_notifications_enabled: boolean;
  platform_notifications_whatsapp_send_enabled: boolean;
  platform_notifications_verbose_log: boolean;
  platform_notifications_business_events_enabled: boolean;
  platform_notifications_pilot_target_tenant_ids: string | null;
  platform_notifications_dispatch_tenant_id: string | null;
  platform_notifications_dispatch_sender_user_id: string | null;
  platform_notifications_whatsapp_chat_instance_id: string | null;
};

function parseBoolSetting(raw: string | null | undefined, defaultValue: boolean): boolean {
  if (raw == null || String(raw).trim() === '') return defaultValue;
  const v = String(raw).trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return defaultValue;
}

function isMissingSuperadminSettingsTable(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const msg = e instanceof Error ? e.message : String(e);
  return code === '42P01' || /relation\s+["']?superadmin_settings["']?\s+does not exist/i.test(msg);
}

export async function loadPlatformNotificationsGlobalFlagsFromDb(pool: Pool): Promise<{
  enabled: boolean;
  whatsappSend: boolean;
  verboseLog: boolean;
  businessEvents: boolean;
  pilotTargetTenantIds: string | null;
  dispatchTenantId: string | null;
  dispatchSenderUserId: string | null;
  whatsappChatInstanceId: string | null;
}> {
  const keys = [
    PN_GLOBAL_KEY_ENABLED,
    PN_GLOBAL_KEY_WHATSAPP_SEND,
    PN_GLOBAL_KEY_VERBOSE_LOG,
    PN_GLOBAL_KEY_BUSINESS_EVENTS,
    PN_GLOBAL_KEY_PILOT_TARGET_TENANTS,
    PN_GLOBAL_KEY_DISPATCH_TENANT_ID,
    PN_GLOBAL_KEY_DISPATCH_SENDER_USER_ID,
    PN_GLOBAL_KEY_WHATSAPP_CHAT_INSTANCE_ID,
  ];
  try {
    const r = await pool.query<{ key: string; value: string | null }>(
      `SELECT key, value FROM superadmin_settings
       WHERE key = ANY($1::text[])`,
      [keys],
    );
    const map: Record<string, string | null> = {};
    for (const row of r.rows) {
      map[row.key] = row.value;
    }
    const pilot = map[PN_GLOBAL_KEY_PILOT_TARGET_TENANTS]?.trim() || null;
    const dTenant = map[PN_GLOBAL_KEY_DISPATCH_TENANT_ID]?.trim() || null;
    const dSender = map[PN_GLOBAL_KEY_DISPATCH_SENDER_USER_ID]?.trim() || null;
    const waInst = map[PN_GLOBAL_KEY_WHATSAPP_CHAT_INSTANCE_ID]?.trim() || null;
    return {
      enabled: parseBoolSetting(map[PN_GLOBAL_KEY_ENABLED], true),
      whatsappSend: parseBoolSetting(map[PN_GLOBAL_KEY_WHATSAPP_SEND], true),
      verboseLog: parseBoolSetting(map[PN_GLOBAL_KEY_VERBOSE_LOG], false),
      businessEvents: parseBoolSetting(map[PN_GLOBAL_KEY_BUSINESS_EVENTS], true),
      pilotTargetTenantIds: pilot && pilot.length > 0 ? pilot : null,
      dispatchTenantId: dTenant && dTenant.length > 0 ? dTenant : null,
      dispatchSenderUserId: dSender && dSender.length > 0 ? dSender : null,
      whatsappChatInstanceId: waInst && waInst.length > 0 ? waInst : null,
    };
  } catch (e: unknown) {
    if (isMissingSuperadminSettingsTable(e)) {
      console.warn(
        '[platform-notifications/global] superadmin_settings ausente; flags assumidas como padrão (ligado).',
      );
      return {
        enabled: true,
        whatsappSend: true,
        verboseLog: false,
        businessEvents: true,
        pilotTargetTenantIds: null,
        dispatchTenantId: null,
        dispatchSenderUserId: null,
        whatsappChatInstanceId: null,
      };
    }
    throw e;
  }
}

export async function getPlatformNotificationsGlobalSettingsRow(pool: Pool): Promise<PlatformNotificationsGlobalFlags> {
  const f = await loadPlatformNotificationsGlobalFlagsFromDb(pool);
  return {
    platform_notifications_enabled: f.enabled,
    platform_notifications_whatsapp_send_enabled: f.whatsappSend,
    platform_notifications_verbose_log: f.verboseLog,
    platform_notifications_business_events_enabled: f.businessEvents,
    platform_notifications_pilot_target_tenant_ids: f.pilotTargetTenantIds,
    platform_notifications_dispatch_tenant_id: f.dispatchTenantId,
    platform_notifications_dispatch_sender_user_id: f.dispatchSenderUserId,
    platform_notifications_whatsapp_chat_instance_id: f.whatsappChatInstanceId,
  };
}

export type PlatformNotificationsGlobalSettingsInput = Partial<{
  platform_notifications_enabled: boolean;
  platform_notifications_whatsapp_send_enabled: boolean;
  platform_notifications_verbose_log: boolean;
  platform_notifications_business_events_enabled: boolean;
  platform_notifications_pilot_target_tenant_ids: string | null;
  platform_notifications_dispatch_tenant_id: string | null;
  platform_notifications_dispatch_sender_user_id: string | null;
  platform_notifications_whatsapp_chat_instance_id: string | null;
}>;

export async function upsertPlatformNotificationsGlobalSettings(
  pool: Pool,
  input: PlatformNotificationsGlobalSettingsInput,
): Promise<PlatformNotificationsGlobalFlags> {
  const upsert = async (key: string, value: string) => {
    await pool.query(
      `INSERT INTO superadmin_settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, value],
    );
  };
  try {
    if (input.platform_notifications_enabled !== undefined) {
      await upsert(PN_GLOBAL_KEY_ENABLED, input.platform_notifications_enabled ? 'true' : 'false');
    }
    if (input.platform_notifications_whatsapp_send_enabled !== undefined) {
      await upsert(PN_GLOBAL_KEY_WHATSAPP_SEND, input.platform_notifications_whatsapp_send_enabled ? 'true' : 'false');
    }
    if (input.platform_notifications_verbose_log !== undefined) {
      await upsert(PN_GLOBAL_KEY_VERBOSE_LOG, input.platform_notifications_verbose_log ? 'true' : 'false');
    }
    if (input.platform_notifications_business_events_enabled !== undefined) {
      await upsert(
        PN_GLOBAL_KEY_BUSINESS_EVENTS,
        input.platform_notifications_business_events_enabled ? 'true' : 'false',
      );
    }
    if (input.platform_notifications_pilot_target_tenant_ids !== undefined) {
      const v = input.platform_notifications_pilot_target_tenant_ids?.trim() ?? '';
      await upsert(PN_GLOBAL_KEY_PILOT_TARGET_TENANTS, v);
    }
    if (input.platform_notifications_dispatch_tenant_id !== undefined) {
      const v = input.platform_notifications_dispatch_tenant_id?.trim() ?? '';
      await upsert(PN_GLOBAL_KEY_DISPATCH_TENANT_ID, v);
    }
    if (input.platform_notifications_dispatch_sender_user_id !== undefined) {
      const v = input.platform_notifications_dispatch_sender_user_id?.trim() ?? '';
      await upsert(PN_GLOBAL_KEY_DISPATCH_SENDER_USER_ID, v);
    }
    if (input.platform_notifications_whatsapp_chat_instance_id !== undefined) {
      const v = input.platform_notifications_whatsapp_chat_instance_id?.trim() ?? '';
      await upsert(PN_GLOBAL_KEY_WHATSAPP_CHAT_INSTANCE_ID, v);
    }
    return await getPlatformNotificationsGlobalSettingsRow(pool);
  } catch (e: unknown) {
    if (isMissingSuperadminSettingsTable(e)) {
      throw new Error(
        'Tabela superadmin_settings não existe. Execute as migrações (database/init/31_superadmin_settings.sql).',
      );
    }
    throw e;
  }
}
