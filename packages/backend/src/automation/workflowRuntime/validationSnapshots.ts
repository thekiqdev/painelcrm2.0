import { pool } from '../../utils/db.js';
import { hashPayloadForAudit } from '../../outbox/idempotency.js';
import { logWorkflowExecution } from './workflowLogger.js';

let tableExistsCache: boolean | undefined;

async function snapshotsTableExists(): Promise<boolean> {
  if (tableExistsCache !== undefined) return tableExistsCache;
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'workflow_validation_snapshots'`,
  );
  tableExistsCache = parseInt(r.rows[0]?.c ?? '0', 10) >= 1;
  return tableExistsCache;
}

export async function recordWorkflowValidationSnapshot(input: {
  workflowExecutionId: string;
  snapshotType: 'execution_start' | 'execution_complete' | 'replay_check' | 'idempotency_check';
  correlationId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<{ recorded: boolean; duplicate: boolean }> {
  if (!(await snapshotsTableExists())) return { recorded: false, duplicate: false };

  const payloadHash = hashPayloadForAudit(input.payload);
  const r = await pool.query(
    `INSERT INTO workflow_validation_snapshots (
       workflow_execution_id, snapshot_type, correlation_id, idempotency_key, payload_hash, metadata_json
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [
      input.workflowExecutionId,
      input.snapshotType,
      input.correlationId,
      input.idempotencyKey,
      payloadHash,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  const duplicate = r.rowCount === 0;
  logWorkflowExecution('validation_snapshot', {
    workflow_execution_id: input.workflowExecutionId,
    snapshot_type: input.snapshotType,
    correlation_id: input.correlationId,
    duplicate,
    payload_hash: payloadHash,
  });

  return { recorded: !duplicate, duplicate };
}
