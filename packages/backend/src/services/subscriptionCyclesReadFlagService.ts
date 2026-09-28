/**
 * Flag global `subscription_cycles_read` em `superadmin_settings` (Etapa 2).
 */
import { pool } from '../utils/db.js';
import { SUBSCRIPTION_CYCLES_SUPERADMIN_KEYS } from '../config/subscriptionCyclesSuperadminKeys.js';

function isMissingSuperadminSettingsTable(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const msg = e instanceof Error ? e.message : String(e);
  return code === '42P01' || /relation\s+["']?superadmin_settings["']?\s+does not exist/i.test(msg);
}

/**
 * Default true quando a linha não existe ou valor vazio (alinhado à migração e ao painel Super Admin).
 * Se a tabela `superadmin_settings` não existir, devolve false (ambiente sem migrações).
 */
export async function isSubscriptionCyclesReadEnabled(): Promise<boolean> {
  try {
    const r = await pool.query<{ value: string | null }>(
      `SELECT value FROM superadmin_settings WHERE key = $1 LIMIT 1`,
      [SUBSCRIPTION_CYCLES_SUPERADMIN_KEYS.read]
    );
    const v = r.rows[0]?.value;
    if (v == null || String(v).trim() === '') return true;
    return String(v).toLowerCase() === 'true';
  } catch (e: unknown) {
    if (isMissingSuperadminSettingsTable(e)) {
      return false;
    }
    throw e;
  }
}
