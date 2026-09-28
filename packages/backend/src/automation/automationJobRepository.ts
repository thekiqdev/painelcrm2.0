import { pool } from '../utils/db.js';
import type { AutomationJobStatus } from './workflowRuntime/workflowTypes.js';
import { logAutomationJob } from './workflowRuntime/workflowLogger.js';

let tableExistsCache: boolean | undefined;

export async function automationJobsTableExists(): Promise<boolean> {
  if (tableExistsCache !== undefined) return tableExistsCache;
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'automation_jobs'`,
  );
  tableExistsCache = parseInt(r.rows[0]?.c ?? '0', 10) >= 1;
  return tableExistsCache;
}

export async function scheduleAutomationJob(input: {
  jobKey: string;
  workflowExecutionId?: string | null;
  sagaInstanceId?: string | null;
  tenantId?: string | null;
  correlationId: string;
  scheduledFor?: Date;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  shadowMode?: boolean;
}): Promise<{ id: string | null }> {
  if (!(await automationJobsTableExists())) return { id: null };

  const r = await pool.query<{ id: string }>(
    `INSERT INTO automation_jobs (
       job_key, workflow_execution_id, saga_instance_id, tenant_id, correlation_id,
       status, scheduled_for, payload_json, metadata_json, shadow_mode, updated_at
     ) VALUES ($1, $2, $3, $4, $5, 'scheduled', $6, $7::jsonb, $8::jsonb, $9, now())
     RETURNING id`,
    [
      input.jobKey,
      input.workflowExecutionId ?? null,
      input.sagaInstanceId ?? null,
      input.tenantId ?? null,
      input.correlationId,
      input.scheduledFor ?? new Date(),
      JSON.stringify(input.payload ?? {}),
      JSON.stringify({ ...(input.metadata ?? {}), passive: true }),
      input.shadowMode ?? true,
    ],
  );

  const id = r.rows[0]?.id ?? null;
  logAutomationJob('scheduled', {
    job_id: id,
    job_key: input.jobKey,
    correlation_id: input.correlationId,
    shadow: input.shadowMode ?? true,
  });
  return { id };
}

export async function markAutomationJobStatus(
  jobId: string,
  status: AutomationJobStatus,
  patch?: { lastError?: string; attemptCount?: number },
): Promise<void> {
  if (!(await automationJobsTableExists())) return;
  await pool.query(
    `UPDATE automation_jobs
     SET status = $2::automation_job_status,
         started_at = CASE WHEN $2 = 'running' AND started_at IS NULL THEN now() ELSE started_at END,
         completed_at = CASE WHEN $2 IN ('completed', 'cancelled') THEN now() ELSE completed_at END,
         attempt_count = COALESCE($3, attempt_count),
         last_error = $4,
         updated_at = now()
     WHERE id = $1`,
    [jobId, status, patch?.attemptCount ?? null, patch?.lastError ?? null],
  );
  logAutomationJob('status_update', { job_id: jobId, status });
}
