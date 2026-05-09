import { pool } from '../utils/db.js';
import { getSystemFlag, setSystemFlagCache } from './systemFeatureFlagsService.js';
import { getSuperadminAccount } from './whatsappOfficial/whatsappOfficialConfigService.js';
import { listInstancesForActor, type ChatInstanceDbRow } from '../utils/chatInstanceAccess.js';
import { getPlatformNotificationsGlobalSettingsRow } from './platformNotifications/platformNotificationsGlobalSettingsService.js';

const FLAG_KEYS = new Set([
  'whatsapp_official_enabled',
  'whatsapp_official_tenant_enabled',
  'whatsapp_groups_enabled',
]);

export type ConnectionsSummary = {
  whatsapp_official: {
    feature_enabled: boolean;
    tenant_feature_enabled: boolean;
    connected: boolean;
    status: string | null;
    display_phone_number: string | null;
    business_account_id: string | null;
    verified_name: string | null;
    phone_number_id: string | null;
    is_active: boolean | null;
  };
  uazapi: {
    instances_count: number;
    connected_count: number;
    designated_instance_id: string | null;
    /** Grupos WhatsApp (UazAPI) — listagem, sync, criar grupo, painel admin. */
    groups_feature_enabled: boolean;
    /** Prévia das instâncias (id, status, nome) */
    instances: Array<{ id: string; name: string; status: string; connected_phone?: string | null }>;
  };
};

function countConnectedUazapi(rows: ChatInstanceDbRow[]): number {
  return rows.filter((r) => {
    const st = (r.status || '').toLowerCase();
    if (st === 'open' || st === 'connected') return true;
    return Boolean(r.connected_phone?.trim());
  }).length;
}

export async function listConnectionsSummary(actorUserId: string): Promise<ConnectionsSummary> {
  const [accWrap, inst, settings] = await Promise.all([
    getSuperadminAccount(),
    listInstancesForActor(actorUserId),
    getPlatformNotificationsGlobalSettingsRow(pool),
  ]);

  const row = accWrap.account;
  const st = (row?.status || '').toLowerCase();
  const connected = st === 'connected' && (row?.is_active !== false);

  return {
    whatsapp_official: {
      feature_enabled: getSystemFlag('whatsapp_official_enabled'),
      tenant_feature_enabled: getSystemFlag('whatsapp_official_tenant_enabled'),
      connected: Boolean(connected),
      status: row?.status ?? null,
      display_phone_number: row?.display_phone_number ?? null,
      business_account_id: row?.business_account_id ?? null,
      verified_name: row?.verified_name ?? null,
      phone_number_id: row?.phone_number_id ?? null,
      is_active: row?.is_active ?? null,
    },
    uazapi: {
      instances_count: inst.length,
      connected_count: countConnectedUazapi(inst),
      designated_instance_id: settings.platform_notifications_whatsapp_chat_instance_id || null,
      groups_feature_enabled: getSystemFlag('whatsapp_groups_enabled'),
      instances: inst.slice(0, 20).map((i) => ({
        id: i.id,
        name: i.name,
        status: i.status,
        connected_phone: i.connected_phone ?? null,
      })),
    },
  };
}

export async function setGlobalConnectionFlag(
  key: string,
  value: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (!FLAG_KEYS.has(key)) {
    return { ok: false, error: 'Chave de flag inválida' };
  }
  try {
    const u = await pool.query(
      `UPDATE system_feature_flags SET value = $2
       WHERE key = $1 AND scope = 'global' AND tenant_id IS NULL
       RETURNING id`,
      [key, value]
    );
    if ((u.rowCount ?? 0) === 0) {
      await pool.query(
        `INSERT INTO system_feature_flags (key, value, scope, tenant_id) VALUES ($1, $2, 'global', NULL)`,
        [key, value]
      );
    }
  } catch (e) {
    const msg = (e as Error).message || '';
    if (msg.includes('42P01') || /system_feature_flags/i.test(msg)) {
      setSystemFlagCache(key, value);
      return { ok: true };
    }
    return { ok: false, error: msg };
  }
  setSystemFlagCache(key, value);
  return { ok: true };
}
