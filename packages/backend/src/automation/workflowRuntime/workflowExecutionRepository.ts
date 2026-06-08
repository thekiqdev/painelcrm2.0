import { pool } from '../../utils/db.js';
import type { WorkflowExecutionRow, WorkflowExecutionStatus } from './workflowTypes.js';

let tableExistsCache: boolean | undefined;

export async function workflowExecutionsTableExists(): Promise<boolean> {
  if (tableExistsCache !== undefined) return tableExistsCache;
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'workflow_executions'`,
  );
  tableExistsCache = parseInt(r.rows[0]?.c ?? '0', 10) >= 1;
  return tableExistsCache;
}

function mapRow(row: Record<string, unknown>): WorkflowExecutionRow {
  return {
    id: String(row.id),
    workflow_key: String(row.workflow_key),
    execution_id: String(row.execution_id),
    correlation_id: String(row.correlation_id),
    tenant_id: row.tenant_id != null ? String(row.tenant_id) : null,
    status: row.status as WorkflowExecutionStatus,
    started_at: String(row.started_at),
    completed_at: row.completed_at != null ? String(row.completed_at) : null,
    failed_at: row.failed_at != null ? String(row.failed_at) : null,
    payload_json: (row.payload_json ?? {}) as Record<string, unknown>,
    metadata_json: (row.metadata_json ?? {}) as Record<string, unknown>,
    dry_run: Boolean(row.dry_run),
    shadow_mode: Boolean(row.shadow_mode),
  };
}

export async function insertWorkflowExecution(input: {
  workflowKey: string;
  executionId: string;
  correlationId: string;
  tenantId?: string | null;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  dryRun: boolean;
  shadowMode: boolean;
}): Promise<{ inserted: boolean; row: WorkflowExecutionRow | null }> {
  if (!(await workflowExecutionsTableExists())) return { inserted: false, row: null };

  const r = await pool.query(
    `INSERT INTO workflow_executions (
       workflow_key, execution_id, correlation_id, tenant_id,
       status, payload_json, metadata_json, dry_run, shadow_mode, updated_at
     ) VALUES ($1, $2, $3, $4, 'pending', $5::jsonb, $6::jsonb, $7, $8, now())
     ON CONFLICT (execution_id) DO NOTHING
     RETURNING *`,
    [
      input.workflowKey,
      input.executionId,
      input.correlationId,
      input.tenantId ?? null,
      JSON.stringify(input.payload ?? {}),
      JSON.stringify(input.metadata ?? {}),
      input.dryRun,
      input.shadowMode,
    ],
  );

  if (r.rows.length === 0) {
    const existing = await pool.query(`SELECT * FROM workflow_executions WHERE execution_id = $1`, [
      input.executionId,
    ]);
    return { inserted: false, row: existing.rows[0] ? mapRow(existing.rows[0]) : null };
  }
  return { inserted: true, row: mapRow(r.rows[0]) };
}

export async function updateWorkflowExecutionStatus(
  executionId: string,
  status: WorkflowExecutionStatus,
  patch?: { metadata?: Record<string, unknown>; error?: string },
): Promise<void> {
  if (!(await workflowExecutionsTableExists())) return;

  const completed = status === 'completed' || status === 'cancelled';
  const failed = status === 'failed';

  await pool.query(
    `UPDATE workflow_executions
     SET status = $2::workflow_execution_status,
         completed_at = CASE WHEN $3 THEN now() ELSE completed_at END,
         failed_at = CASE WHEN $4 THEN now() ELSE failed_at END,
         metadata_json = metadata_json || COALESCE($5::jsonb, '{}'::jsonb),
         updated_at = now()
     WHERE execution_id = $1`,
    [
      executionId,
      status,
      completed,
      failed,
      patch?.metadata ? JSON.stringify({ ...patch.metadata, last_error: patch.error ?? null }) : null,
    ],
  );
}

export async function findWorkflowExecutionByExecutionId(
  executionId: string,
): Promise<WorkflowExecutionRow | null> {
  if (!(await workflowExecutionsTableExists())) return null;
  const r = await pool.query(`SELECT * FROM workflow_executions WHERE execution_id = $1`, [executionId]);
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}
