import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  computePendingMigrations,
  runMigrationGuard,
} from './migrationGuard.js';
import { registerMigrationExecuted } from './schemaMigrationsRepository.js';

const SAMPLE_ORDER = ['000_schema_migrations.sql', '270_ops_gateway_rollout.sql'];

const listExecutedMigrationsMock = vi.hoisted(() => vi.fn());

vi.mock('./schemaMigrationsRepository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./schemaMigrationsRepository.js')>();
  return {
    ...actual,
    listExecutedMigrations: listExecutedMigrationsMock,
    ensureSchemaMigrationsTable: vi.fn(),
  };
});

function mockPool(): Pool {
  return { query: vi.fn() } as unknown as Pool;
}

function guardOpts(executed: string[]) {
  listExecutedMigrationsMock.mockResolvedValue(executed);
  return { expectedFiles: [...SAMPLE_ORDER] };
}

describe('migrationGuard', () => {
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MIGRATION_GUARD_STRICT;
    listExecutedMigrationsMock.mockResolvedValue([]);
  });

  it('nenhuma migration pendente → status ok', async () => {
    const result = await runMigrationGuard(mockPool(), guardOpts([...SAMPLE_ORDER]));

    expect(result.status).toBe('ok');
    expect(result.pending).toEqual([]);
    expect(result.strict).toBe(false);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('uma migration pendente → status warning', async () => {
    const result = await runMigrationGuard(mockPool(), guardOpts([SAMPLE_ORDER[1]!]));

    expect(result.status).toBe('warning');
    expect(result.pending).toEqual([SAMPLE_ORDER[0]]);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('modo warn — backend continua (sem exit)', async () => {
    process.env.MIGRATION_GUARD_STRICT = '0';

    await runMigrationGuard(mockPool(), guardOpts([]));

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('modo strict — aborta startup', async () => {
    process.env.MIGRATION_GUARD_STRICT = '1';

    await runMigrationGuard(mockPool(), guardOpts([]));

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('schema_migrations vazia — todas as migrations esperadas ficam pendentes', () => {
    const pending = computePendingMigrations(SAMPLE_ORDER, []);
    expect(pending).toEqual(SAMPLE_ORDER);
  });

  it('registro idempotente — ON CONFLICT não duplica', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    const pool = { query } as unknown as Pool;

    await registerMigrationExecuted(pool, '270_ops_gateway_rollout.sql', 'abc123');
    await registerMigrationExecuted(pool, '270_ops_gateway_rollout.sql', 'abc123');

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[0]?.[0])).toContain('ON CONFLICT (filename) DO NOTHING');
  });
});
