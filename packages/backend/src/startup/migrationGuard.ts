import fs from 'fs';
import path from 'path';
import type { Pool } from 'pg';
import { MIGRATION_ORDER } from './migrationOrder.js';
import { resolveInitDir } from './migrationPaths.js';
import {
  computeMigrationChecksum,
  ensureSchemaMigrationsTable,
  listExecutedMigrations,
} from './schemaMigrationsRepository.js';

export type MigrationGuardStatus = 'ok' | 'warning' | 'blocked';

export type MigrationGuardResult = {
  status: MigrationGuardStatus;
  pending: string[];
  executed: string[];
  strict: boolean;
};

function isMigrationGuardStrict(): boolean {
  const v = (process.env.MIGRATION_GUARD_STRICT || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Migrations esperadas que existem em disco (mesma regra que migrate.ts). */
export function listExpectedMigrationFiles(): string[] {
  const initDir = resolveInitDir();
  return MIGRATION_ORDER.filter((file) => fs.existsSync(path.join(initDir, file)));
}

export function computePendingMigrations(expected: string[], executed: string[]): string[] {
  const executedSet = new Set(executed);
  return expected.filter((file) => !executedSet.has(file));
}

function logMigrationGuard(payload: Record<string, unknown>): void {
  console.log('[migration_guard]', JSON.stringify(payload));
}

export type MigrationGuardOptions = {
  /** Apenas testes — sobrescreve a lista de ficheiros esperados em disco. */
  expectedFiles?: string[];
};

/**
 * Verifica migrations pendentes antes da API ficar disponível.
 * Modo strict (`MIGRATION_GUARD_STRICT=1`): aborta o processo.
 */
export async function runMigrationGuard(
  pool: Pool,
  options?: MigrationGuardOptions,
): Promise<MigrationGuardResult> {
  const strict = isMigrationGuardStrict();
  const expected = options?.expectedFiles ?? listExpectedMigrationFiles();
  const executed = await listExecutedMigrations(pool);
  const pending = computePendingMigrations(expected, executed);

  if (pending.length === 0) {
    const result: MigrationGuardResult = {
      status: 'ok',
      pending: [],
      executed,
      strict,
    };
    logMigrationGuard({
      status: 'ok',
      pending: [],
      executed,
      strict,
    });
    return result;
  }

  if (strict) {
    logMigrationGuard({
      status: 'blocked',
      pending,
      executed,
      strict,
    });
    console.error(
      '[migration_guard] Existem migrations pendentes.\n\nExecute:\n\n  npm run migrate:tsx\n',
    );
    pending.forEach((file) => console.error(`  - ${file}`));
    process.exit(1);
    throw new Error('migration_guard_strict_blocked');
  }

  const result: MigrationGuardResult = {
    status: 'warning',
    pending,
    executed,
    strict,
  };
  logMigrationGuard({
    status: 'warning',
    pending,
    executed,
    strict,
  });
  pending.forEach((file) => console.warn(`[migration_guard] pending: ${file}`));
  return result;
}

/** Garante tabela de controle (útil no migrate.ts). */
export async function bootstrapSchemaMigrations(pool: Pool): Promise<void> {
  await ensureSchemaMigrationsTable(pool);
}

export { computeMigrationChecksum, registerMigrationExecuted } from './schemaMigrationsRepository.js';
