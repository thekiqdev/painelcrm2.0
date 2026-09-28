/**
 * Configurações de cobrança do Super Admin (Fase 3).
 * Armazenado em superadmin_settings: billing_grace_period_days, billing_auto_suspend_enabled, etc.
 */
import { pool } from '../utils/db.js';

export interface BillingSettings {
  grace_period_days: number;
  auto_suspend_enabled: boolean;
}

const DEFAULT_GRACE_PERIOD_DAYS = 3;
const DEFAULT_AUTO_SUSPEND = true;

function isMissingSuperadminSettingsTable(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const msg = e instanceof Error ? e.message : String(e);
  return (
    code === '42P01' ||
    /relation\s+["']?superadmin_settings["']?\s+does not exist/i.test(msg)
  );
}

export async function getBillingSettings(): Promise<BillingSettings> {
  try {
    const r = await pool.query<{ key: string; value: string | null }>(
      `SELECT key, value FROM superadmin_settings WHERE key IN ('billing_grace_period_days', 'billing_auto_suspend_enabled')`
    );
    const map: Record<string, string | null> = {};
    r.rows.forEach((row) => {
      map[row.key] = row.value;
    });
    const grace = map.billing_grace_period_days;
    const autoSuspend = map.billing_auto_suspend_enabled;
    return {
      grace_period_days:
        grace != null ? parseInt(grace, 10) || DEFAULT_GRACE_PERIOD_DAYS : DEFAULT_GRACE_PERIOD_DAYS,
      auto_suspend_enabled: autoSuspend != null ? autoSuspend === 'true' : DEFAULT_AUTO_SUSPEND,
    };
  } catch (e: unknown) {
    if (isMissingSuperadminSettingsTable(e)) {
      console.warn(
        '[getBillingSettings] tabela superadmin_settings ausente; usando grace_period_days e auto_suspend padrão (rode migrate ou database/init/31_superadmin_settings.sql)'
      );
      return {
        grace_period_days: DEFAULT_GRACE_PERIOD_DAYS,
        auto_suspend_enabled: DEFAULT_AUTO_SUSPEND,
      };
    }
    throw e;
  }
}

export async function updateBillingSettings(settings: Partial<BillingSettings>): Promise<BillingSettings> {
  try {
    if (settings.grace_period_days != null) {
      await pool.query(
        `INSERT INTO superadmin_settings (key, value, updated_at) VALUES ('billing_grace_period_days', $1, now())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()`,
        [String(settings.grace_period_days)]
      );
    }
    if (settings.auto_suspend_enabled != null) {
      await pool.query(
        `INSERT INTO superadmin_settings (key, value, updated_at) VALUES ('billing_auto_suspend_enabled', $1, now())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()`,
        [settings.auto_suspend_enabled ? 'true' : 'false']
      );
    }
    return await getBillingSettings();
  } catch (e: unknown) {
    if (isMissingSuperadminSettingsTable(e)) {
      throw new Error(
        'Tabela superadmin_settings não existe neste banco. Execute as migrações (inclui database/init/31_superadmin_settings.sql).'
      );
    }
    throw e;
  }
}
