/**
 * Fundação do Kanban Ops (P0-A): tenant, lock de seed, boards canônicos.
 */
import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import { SUPERADMIN_OPS_KANBAN_TENANT_ID } from '../config/superadminOpsKanban.js';

/** Nomes dos boards operacionais (canônico = mais antigo por nome). */
export const OPS_KANBAN_CANONICAL_BOARD_NAMES = [
  'Aquisição',
  'Recovery',
  'Onboarding',
  'Expansão',
  'Reativação',
] as const;

/** Chave estável para pg_advisory_xact_lock (serializa seed no Postgres). */
export const OPS_KANBAN_SEED_ADVISORY_LOCK_KEY = 0x1f1a0f0a;

export type OpsTenantCheckResult =
  | { ok: true; tenantId: string; slug: string; status: string }
  | { ok: false; reason: 'ops_tenant_missing' };

export async function assertSuperadminOpsTenantExists(): Promise<OpsTenantCheckResult> {
  const r = await pool.query<{ id: string; slug: string; status: string }>(
    `SELECT id::text, slug, status FROM tenants WHERE id = $1::uuid LIMIT 1`,
    [SUPERADMIN_OPS_KANBAN_TENANT_ID],
  );
  const row = r.rows[0];
  if (!row) {
    console.error('[opsKanban] CRITICAL ops_tenant_missing', {
      tenant_id: SUPERADMIN_OPS_KANBAN_TENANT_ID,
      hint: 'Run migration 259_superadmin_ops_tenant_p0.sql and ensure an active plan exists.',
    });
    return { ok: false, reason: 'ops_tenant_missing' };
  }
  return { ok: true, tenantId: row.id, slug: row.slug, status: row.status };
}

let inProcessSeedTail: Promise<void> = Promise.resolve();

/** Serializa seed no mesmo processo Node (complementa advisory lock no DB). */
export async function runSerializedOpsKanbanSeed<T>(fn: () => Promise<T>): Promise<T> {
  const prev = inProcessSeedTail;
  let release!: () => void;
  inProcessSeedTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

export async function acquireOpsKanbanSeedAdvisoryLock(client: PoolClient): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [OPS_KANBAN_SEED_ADVISORY_LOCK_KEY]);
}

/** Board ativo mais antigo por nome (canônico). */
export async function findCanonicalOpsBoardIdByName(
  client: PoolClient,
  name: string,
): Promise<string | null> {
  const r = await client.query<{ id: string }>(
    `SELECT id::text FROM chat_kanban_boards
     WHERE tenant_id = $1::uuid
       AND archived_at IS NULL
       AND lower(btrim(name)) = lower(btrim($2))
     ORDER BY created_at ASC, id ASC
     LIMIT 1`,
    [SUPERADMIN_OPS_KANBAN_TENANT_ID, name],
  );
  return r.rows[0]?.id ?? null;
}

export async function findCanonicalOpsBoardIdByNameFromPool(name: string): Promise<string | null> {
  const r = await pool.query<{ id: string }>(
    `SELECT id::text FROM chat_kanban_boards
     WHERE tenant_id = $1::uuid
       AND archived_at IS NULL
       AND lower(btrim(name)) = lower(btrim($2))
     ORDER BY created_at ASC, id ASC
     LIMIT 1`,
    [SUPERADMIN_OPS_KANBAN_TENANT_ID, name],
  );
  return r.rows[0]?.id ?? null;
}

/** IDs canônicos dos 5 boards operacionais (para filtrar UI). */
export async function listCanonicalOpsBoardIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const name of OPS_KANBAN_CANONICAL_BOARD_NAMES) {
    const id = await findCanonicalOpsBoardIdByNameFromPool(name);
    if (id) ids.add(id);
  }
  return ids;
}

export function normalizeOpsBoardName(name: string): string {
  return name.trim().toLowerCase();
}
