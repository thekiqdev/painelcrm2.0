import type pg from 'pg';
import { pool } from '../utils/db.js';
import type { PlatformWorkerHeartbeatRow, PlatformWorkerStatus } from './workerTypes.js';

let tableExistsCache: boolean | undefined;

export async function platformWorkerHeartbeatTableExists(): Promise<boolean> {
  if (tableExistsCache !== undefined) return tableExistsCache;
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'platform_worker_heartbeats'`,
  );
  tableExistsCache = parseInt(r.rows[0]?.c ?? '0', 10) >= 1;
  return tableExistsCache;
}

function mapRow(row: Record<string, unknown>): PlatformWorkerHeartbeatRow {
  return {
    worker_id: String(row.worker_id),
    worker_type: String(row.worker_type),
    status: row.status as PlatformWorkerStatus,
    started_at: String(row.started_at),
    last_heartbeat_at: String(row.last_heartbeat_at),
    last_success_at: row.last_success_at != null ? String(row.last_success_at) : null,
    last_error_at: row.last_error_at != null ? String(row.last_error_at) : null,
    correlation_id: row.correlation_id != null ? String(row.correlation_id) : null,
    lock_token: row.lock_token != null ? String(row.lock_token) : null,
    locked_at: row.locked_at != null ? String(row.locked_at) : null,
    metadata_json: (row.metadata_json ?? {}) as Record<string, unknown>,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function upsertWorkerHeartbeat(input: {
  workerId: string;
  workerType: string;
  status: PlatformWorkerStatus;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
  lastSuccess?: boolean;
  lastError?: boolean;
  lockToken?: string | null;
  clearLock?: boolean;
}): Promise<void> {
  if (!(await platformWorkerHeartbeatTableExists())) return;

  const metadata = JSON.stringify(input.metadata ?? {});
  await pool.query(
    `INSERT INTO platform_worker_heartbeats (
       worker_id, worker_type, status, correlation_id, metadata_json,
       last_heartbeat_at, last_success_at, last_error_at, lock_token, locked_at, updated_at
     ) VALUES (
       $1, $2, $3::platform_worker_status, $4, $5::jsonb, now(),
       CASE WHEN $6 THEN now() ELSE NULL END,
       CASE WHEN $7 THEN now() ELSE NULL END,
       $8, CASE WHEN $8 IS NOT NULL THEN now() ELSE NULL END, now()
     )
     ON CONFLICT (worker_id) DO UPDATE SET
       worker_type = EXCLUDED.worker_type,
       status = EXCLUDED.status,
       correlation_id = COALESCE(EXCLUDED.correlation_id, platform_worker_heartbeats.correlation_id),
       metadata_json = platform_worker_heartbeats.metadata_json || EXCLUDED.metadata_json,
       last_heartbeat_at = now(),
       last_success_at = CASE WHEN $6 THEN now() ELSE platform_worker_heartbeats.last_success_at END,
       last_error_at = CASE WHEN $7 THEN now() ELSE platform_worker_heartbeats.last_error_at END,
       lock_token = CASE WHEN $9 THEN NULL ELSE COALESCE(EXCLUDED.lock_token, platform_worker_heartbeats.lock_token) END,
       locked_at = CASE WHEN $9 THEN NULL WHEN EXCLUDED.lock_token IS NOT NULL THEN now() ELSE platform_worker_heartbeats.locked_at END,
       updated_at = now()`,
    [
      input.workerId,
      input.workerType,
      input.status,
      input.correlationId ?? null,
      metadata,
      input.lastSuccess === true,
      input.lastError === true,
      input.lockToken ?? null,
      input.clearLock === true,
    ],
  );
}

export async function listWorkerHeartbeats(
  client: pg.Pool | pg.PoolClient = pool,
): Promise<PlatformWorkerHeartbeatRow[]> {
  if (!(await platformWorkerHeartbeatTableExists())) return [];
  const r = await client.query(`SELECT * FROM platform_worker_heartbeats ORDER BY last_heartbeat_at DESC`);
  return r.rows.map((row) => mapRow(row));
}

export async function findStaleWorkerHeartbeats(staleMinutes: number, limit: number): Promise<PlatformWorkerHeartbeatRow[]> {
  if (!(await platformWorkerHeartbeatTableExists())) return [];
  const r = await pool.query(
    `SELECT *
     FROM platform_worker_heartbeats
     WHERE status IN ('starting', 'healthy', 'degraded')
       AND last_heartbeat_at < now() - ($1::int * interval '1 minute')
     ORDER BY last_heartbeat_at ASC
     LIMIT $2`,
    [staleMinutes, limit],
  );
  return r.rows.map((row) => mapRow(row));
}

export async function markWorkersReclaimed(
  workerIds: string[],
  targetStatus: 'degraded' | 'failed',
): Promise<number> {
  if (workerIds.length === 0) return 0;
  const r = await pool.query(
    `UPDATE platform_worker_heartbeats
     SET status = $2::platform_worker_status,
         lock_token = NULL,
         locked_at = NULL,
         metadata_json = metadata_json || jsonb_build_object('reclaimed_at', now()::text),
         updated_at = now()
     WHERE worker_id = ANY($1::text[])
     RETURNING worker_id`,
    [workerIds, targetStatus],
  );
  return r.rowCount ?? 0;
}

export async function clearStaleLocks(staleMinutes: number, limit: number): Promise<number> {
  if (!(await platformWorkerHeartbeatTableExists())) return 0;
  const r = await pool.query(
    `UPDATE platform_worker_heartbeats w
     SET lock_token = NULL,
         locked_at = NULL,
         metadata_json = w.metadata_json || jsonb_build_object('lock_cleared_at', now()::text),
         updated_at = now()
     FROM (
       SELECT worker_id
       FROM platform_worker_heartbeats
       WHERE lock_token IS NOT NULL
         AND locked_at IS NOT NULL
         AND locked_at < now() - ($1::int * interval '1 minute')
       ORDER BY locked_at ASC
       LIMIT $2
     ) stale
     WHERE w.worker_id = stale.worker_id
     RETURNING w.worker_id`,
    [staleMinutes, limit],
  );
  return r.rowCount ?? 0;
}
