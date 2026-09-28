/**
 * Heartbeat operacional dos processos billing:scheduler e billing:worker.
 * Não altera regras de recorrência — apenas regista última execução bem-sucedida.
 */
import { pool } from '../utils/db.js';

export type BillingOpsProcessKey = 'scheduler' | 'worker';

let cachedTableExists: boolean | undefined;

async function billingOpsHeartbeatTableExists(): Promise<boolean> {
  if (cachedTableExists !== undefined) return cachedTableExists;
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'billing_ops_heartbeat'`
  );
  cachedTableExists = parseInt(r.rows[0]?.c ?? '0', 10) >= 1;
  return cachedTableExists;
}

export async function recordBillingOpsHeartbeat(
  processKey: BillingOpsProcessKey,
  exitPayload?: Record<string, unknown>
): Promise<void> {
  if (!(await billingOpsHeartbeatTableExists())) return;
  await pool.query(
    `INSERT INTO billing_ops_heartbeat (process_key, last_run_at, last_exit_json, updated_at)
     VALUES ($1, now(), $2::jsonb, now())
     ON CONFLICT (process_key) DO UPDATE SET
       last_run_at = EXCLUDED.last_run_at,
       last_exit_json = EXCLUDED.last_exit_json,
       updated_at = now()`,
    [processKey, exitPayload ? JSON.stringify(exitPayload) : null]
  );
}

export interface BillingOpsHeartbeatRow {
  process_key: BillingOpsProcessKey;
  last_run_at: string;
  last_exit_json: Record<string, unknown> | null;
  updated_at: string;
  /** Idade em minutos desde last_run_at (servidor DB). */
  age_minutes: number;
  /** true se last_run_at > limite (scheduler 30 min, worker 10 min). */
  stale: boolean;
}

const STALE_MINUTES: Record<BillingOpsProcessKey, number> = {
  scheduler: 30,
  worker: 10,
};

export async function getBillingOpsHeartbeats(): Promise<{
  table_present: boolean;
  heartbeats: BillingOpsHeartbeatRow[];
  /** Proxies quando tabela ausente ou processo nunca registou heartbeat. */
  inference?: {
    worker_proxy_last_job_touch_at: string | null;
    scheduler_proxy_last_job_created_at: string | null;
    note_pt: string;
  };
}> {
  const tablePresent = await billingOpsHeartbeatTableExists();
  if (!tablePresent) {
    const inf = await inferBillingOpsActivityFromJobs();
    return {
      table_present: false,
      heartbeats: [],
      inference: inf,
    };
  }

  const r = await pool.query<{
    process_key: string;
    last_run_at: string;
    last_exit_json: Record<string, unknown> | null;
    updated_at: string;
    age_minutes: string;
  }>(
    `SELECT process_key,
            last_run_at::text,
            last_exit_json,
            updated_at::text,
            EXTRACT(EPOCH FROM (now() - last_run_at)) / 60.0 AS age_minutes
     FROM billing_ops_heartbeat
     ORDER BY process_key`
  );

  const heartbeats: BillingOpsHeartbeatRow[] = r.rows.map((row) => {
    const key = row.process_key as BillingOpsProcessKey;
    const age = Number.parseFloat(row.age_minutes);
    const limit = STALE_MINUTES[key] ?? 15;
    return {
      process_key: key,
      last_run_at: row.last_run_at,
      last_exit_json: row.last_exit_json,
      updated_at: row.updated_at,
      age_minutes: Math.round(age * 10) / 10,
      stale: !Number.isFinite(age) || age > limit,
    };
  });

  const hasWorker = heartbeats.some((h) => h.process_key === 'worker');
  const hasScheduler = heartbeats.some((h) => h.process_key === 'scheduler');
  let inference: Awaited<ReturnType<typeof inferBillingOpsActivityFromJobs>> | undefined;
  if (!hasWorker || !hasScheduler) {
    inference = await inferBillingOpsActivityFromJobs();
  }

  return { table_present: true, heartbeats, inference };
}

async function inferBillingOpsActivityFromJobs(): Promise<{
  worker_proxy_last_job_touch_at: string | null;
  scheduler_proxy_last_job_created_at: string | null;
  note_pt: string;
}> {
  const r = await pool.query<{
    worker_touch: string | null;
    scheduler_created: string | null;
  }>(
    `SELECT
       (SELECT max(updated_at)::text FROM billing_recurring_jobs
        WHERE updated_at >= now() - interval '7 days') AS worker_touch,
       (SELECT max(created_at)::text FROM billing_recurring_jobs
        WHERE created_at >= now() - interval '7 days') AS scheduler_created`
  );
  const row = r.rows[0];
  return {
    worker_proxy_last_job_touch_at: row?.worker_touch ?? null,
    scheduler_proxy_last_job_created_at: row?.scheduler_created ?? null,
    note_pt:
      'Proxies inferidos de billing_recurring_jobs (não substituem heartbeat). Worker parado com jobs pending antigos pode manter updated_at antigo.',
  };
}
