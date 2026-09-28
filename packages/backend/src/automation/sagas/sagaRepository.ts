import { pool } from '../../utils/db.js';
import type { SagaCompensationRegistration, SagaInstanceRow } from './sagaTypes.js';
import { logSaga } from '../workflowRuntime/workflowLogger.js';

let tableExistsCache: boolean | undefined;

export async function sagaInstancesTableExists(): Promise<boolean> {
  if (tableExistsCache !== undefined) return tableExistsCache;
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'saga_instances'`,
  );
  tableExistsCache = parseInt(r.rows[0]?.c ?? '0', 10) >= 1;
  return tableExistsCache;
}

function mapRow(row: Record<string, unknown>): SagaInstanceRow {
  return {
    id: String(row.id),
    saga_key: String(row.saga_key),
    correlation_id: String(row.correlation_id),
    tenant_id: row.tenant_id != null ? String(row.tenant_id) : null,
    status: String(row.status),
    state_json: (row.state_json ?? {}) as Record<string, unknown>,
    compensation_json: (row.compensation_json ?? []) as SagaCompensationRegistration[],
    rollback_metadata_json: (row.rollback_metadata_json ?? {}) as Record<string, unknown>,
    shadow_mode: Boolean(row.shadow_mode),
  };
}

export async function createSagaInstance(input: {
  sagaKey: string;
  correlationId: string;
  tenantId?: string | null;
  initialState?: Record<string, unknown>;
  shadowMode?: boolean;
}): Promise<SagaInstanceRow | null> {
  if (!(await sagaInstancesTableExists())) return null;

  const r = await pool.query(
    `INSERT INTO saga_instances (saga_key, correlation_id, tenant_id, status, state_json, shadow_mode, updated_at)
     VALUES ($1, $2, $3, 'pending', $4::jsonb, $5, now())
     RETURNING *`,
    [
      input.sagaKey,
      input.correlationId,
      input.tenantId ?? null,
      JSON.stringify(input.initialState ?? {}),
      input.shadowMode ?? true,
    ],
  );
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

export async function registerSagaCompensation(
  sagaId: string,
  compensation: SagaCompensationRegistration,
): Promise<void> {
  if (!(await sagaInstancesTableExists())) return;
  await pool.query(
    `UPDATE saga_instances
     SET compensation_json = compensation_json || $2::jsonb,
         rollback_metadata_json = rollback_metadata_json || jsonb_build_object('last_registered', now()::text),
         updated_at = now()
     WHERE id = $1`,
    [sagaId, JSON.stringify([compensation])],
  );
  logSaga('compensation_registered', {
    saga_id: sagaId,
    step_key: compensation.stepKey,
    compensation_key: compensation.compensationKey,
    note: 'P0 foundation — no real compensation execution',
  });
}

export async function updateSagaState(
  sagaId: string,
  patch: { status?: string; state?: Record<string, unknown> },
): Promise<void> {
  if (!(await sagaInstancesTableExists())) return;
  await pool.query(
    `UPDATE saga_instances
     SET status = COALESCE($2::saga_instance_status, status),
         state_json = CASE WHEN $3 IS NOT NULL THEN state_json || $3::jsonb ELSE state_json END,
         updated_at = now()
     WHERE id = $1`,
    [sagaId, patch.status ?? null, patch.state ? JSON.stringify(patch.state) : null],
  );
}
