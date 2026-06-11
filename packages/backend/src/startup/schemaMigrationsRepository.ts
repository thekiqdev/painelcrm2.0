import { createHash } from 'crypto';
import fs from 'fs';
import type { Pool } from 'pg';
import { resolveSchemaMigrationsSqlPath } from './migrationPaths.js';

export function computeMigrationChecksum(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export async function ensureSchemaMigrationsTable(pool: Pool): Promise<void> {
  const ddlPath = resolveSchemaMigrationsSqlPath();
  const sql = fs.readFileSync(ddlPath, 'utf8');
  await pool.query(sql);
}

export async function listExecutedMigrations(pool: Pool): Promise<string[]> {
  try {
    const r = await pool.query<{ filename: string }>(
      `SELECT filename FROM schema_migrations ORDER BY filename`,
    );
    return r.rows.map((row) => row.filename);
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    if (msg.includes('42P01') || /schema_migrations.*does not exist/i.test(msg)) {
      return [];
    }
    throw e;
  }
}

export async function registerMigrationExecuted(
  pool: Pool,
  filename: string,
  checksum: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO schema_migrations (filename, executed_at, checksum)
     VALUES ($1, now(), $2)
     ON CONFLICT (filename) DO NOTHING`,
    [filename, checksum],
  );
}
