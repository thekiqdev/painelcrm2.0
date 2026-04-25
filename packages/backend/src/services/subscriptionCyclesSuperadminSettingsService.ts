/**
 * Leitura/escrita das flags globais de ciclos de assinatura no painel Super Admin.
 */
import { pool } from '../utils/db.js';
import { SUBSCRIPTION_CYCLES_SUPERADMIN_KEYS } from '../config/subscriptionCyclesSuperadminKeys.js';
import { clearSubscriptionCyclesWriteFlagCache } from './subscriptionCyclesWriteFlagService.js';

function parseStoredBool(value: string | null | undefined): boolean {
  if (value == null || String(value).trim() === '') return true;
  return String(value).toLowerCase() === 'true';
}

export interface SubscriptionCyclesSuperadminSettings {
  subscription_cycles_read: boolean;
  subscription_cycles_write: boolean;
}

export async function getSubscriptionCyclesSuperadminSettings(): Promise<SubscriptionCyclesSuperadminSettings> {
  const r = await pool.query<{ key: string; value: string | null }>(
    `SELECT key, value FROM superadmin_settings WHERE key = ANY($1::text[])`,
    [[SUBSCRIPTION_CYCLES_SUPERADMIN_KEYS.read, SUBSCRIPTION_CYCLES_SUPERADMIN_KEYS.write]]
  );
  const map: Record<string, string | null> = {};
  r.rows.forEach((row) => {
    map[row.key] = row.value;
  });
  return {
    subscription_cycles_read: parseStoredBool(map[SUBSCRIPTION_CYCLES_SUPERADMIN_KEYS.read]),
    subscription_cycles_write: parseStoredBool(map[SUBSCRIPTION_CYCLES_SUPERADMIN_KEYS.write]),
  };
}

export async function updateSubscriptionCyclesSuperadminSettings(
  partial: Partial<Pick<SubscriptionCyclesSuperadminSettings, 'subscription_cycles_read' | 'subscription_cycles_write'>>
): Promise<SubscriptionCyclesSuperadminSettings> {
  if (partial.subscription_cycles_read != null) {
    await pool.query(
      `INSERT INTO superadmin_settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [SUBSCRIPTION_CYCLES_SUPERADMIN_KEYS.read, partial.subscription_cycles_read ? 'true' : 'false']
    );
  }
  if (partial.subscription_cycles_write != null) {
    await pool.query(
      `INSERT INTO superadmin_settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [SUBSCRIPTION_CYCLES_SUPERADMIN_KEYS.write, partial.subscription_cycles_write ? 'true' : 'false']
    );
  }
  clearSubscriptionCyclesWriteFlagCache();
  return getSubscriptionCyclesSuperadminSettings();
}
