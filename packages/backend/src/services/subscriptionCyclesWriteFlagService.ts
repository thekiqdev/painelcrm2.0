/**
 * Flag global `subscription_cycles_write` em `superadmin_settings` (Etapa 3 — dual-write).
 */
import { pool } from '../utils/db.js';
import { SUBSCRIPTION_CYCLES_SUPERADMIN_KEYS } from '../config/subscriptionCyclesSuperadminKeys.js';

function isMissingSuperadminSettingsTable(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const msg = e instanceof Error ? e.message : String(e);
  return code === '42P01' || /relation\s+["']?superadmin_settings["']?\s+does not exist/i.test(msg);
}

let cache: { value: boolean; readAtMs: number } | null = null;
const CACHE_TTL_MS = 20_000;

/**
 * Default true quando a linha não existe ou valor vazio (painel Super Admin pode desligar).
 * Tabela ausente: false (sem migrações). Cache ~20s.
 */
export async function isSubscriptionCyclesWriteEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cache && now - cache.readAtMs < CACHE_TTL_MS) {
    return cache.value;
  }
  try {
    const r = await pool.query<{ value: string | null }>(
      `SELECT value FROM superadmin_settings WHERE key = $1 LIMIT 1`,
      [SUBSCRIPTION_CYCLES_SUPERADMIN_KEYS.write]
    );
    const raw = r.rows[0]?.value;
    const vBool =
      raw == null || String(raw).trim() === '' ? true : String(raw).toLowerCase() === 'true';
    cache = { value: vBool, readAtMs: now };
    return vBool;
  } catch (e: unknown) {
    if (isMissingSuperadminSettingsTable(e)) {
      cache = { value: false, readAtMs: now };
      return false;
    }
    throw e;
  }
}

/** Para testes ou reload explícito. */
export function clearSubscriptionCyclesWriteFlagCache(): void {
  cache = null;
}
