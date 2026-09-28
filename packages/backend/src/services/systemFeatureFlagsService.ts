/**
 * Flags em `system_feature_flags` (global/tenant) com cache em memória.
 */
import type { Pool } from 'pg';

const DEFAULT_FLAGS: Record<string, boolean> = {
  whatsapp_official_enabled: true,
  whatsapp_official_tenant_enabled: false,
  /** Grupos UazAPI (inbox, criar grupo, etc.) — default on até haver linha em `system_feature_flags`. */
  whatsapp_groups_enabled: true,
};

let cache: Map<string, boolean> = new Map(Object.entries(DEFAULT_FLAGS));

function isMissingTableError(msg: string): boolean {
  return (
    msg.includes('42P01') ||
    /relation\s+["']?system_feature_flags["']?\s+does not exist/i.test(msg)
  );
}

export async function refreshSystemFeatureFlagsFromPool(pool: Pool): Promise<void> {
  try {
    const r = await pool.query<{ key: string; value: boolean }>(
      `SELECT key, value FROM system_feature_flags
       WHERE scope = 'global' AND tenant_id IS NULL`
    );
    const next = new Map<string, boolean>(Object.entries(DEFAULT_FLAGS));
    for (const row of r.rows) {
      next.set(row.key, row.value);
    }
    cache = next;
  } catch (e) {
    const msg = (e as Error)?.message || '';
    if (isMissingTableError(msg)) {
      console.warn('[system_feature_flags] tabela ausente; usando defaults em memória.');
      cache = new Map(Object.entries(DEFAULT_FLAGS));
      return;
    }
    throw e;
  }
}

/** Leitura síncrona do cache (actualizado no arranque e após PUT). */
export function getSystemFlag(key: string): boolean {
  if (cache.has(key)) return cache.get(key)!;
  return DEFAULT_FLAGS[key] ?? false;
}

export function setSystemFlagCache(key: string, value: boolean): void {
  cache.set(key, value);
}
