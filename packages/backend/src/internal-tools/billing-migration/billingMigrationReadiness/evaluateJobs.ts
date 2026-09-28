/**
 * Billing Engine V2 — Sprint 2.3E: avaliação Jobs por tenant (READ ONLY).
 */
import type { Pool } from 'pg';
import { pool } from '../../../utils/db.js';
import type { MigrationAreaScore, MigrationBlockingIssue } from './types.js';
import { MIGRATION_AREA_WEIGHTS } from './types.js';

export type JobEvaluationResult = {
  area: MigrationAreaScore;
  issues: MigrationBlockingIssue[];
  summary: Record<string, unknown>;
};

export async function evaluateJobs(
  tenantId: string,
  db: Pick<Pool, 'query'> = pool
): Promise<JobEvaluationResult> {
  const issues: MigrationBlockingIssue[] = [];
  const r = await db.query<{
    pending: string;
    failed: string;
    processing: string;
    stuck: string;
    orphan: string;
  }>(
    `SELECT
       count(*) FILTER (WHERE j.status = 'pending')::text AS pending,
       count(*) FILTER (WHERE j.status = 'failed')::text AS failed,
       count(*) FILTER (WHERE j.status = 'processing')::text AS processing,
       count(*) FILTER (
         WHERE j.status = 'pending' AND j.retry_at IS NOT NULL AND j.retry_at < now() - interval '24 hours'
       )::text AS stuck,
       count(*) FILTER (WHERE s.id IS NULL)::text AS orphan
     FROM billing_recurring_jobs j
     LEFT JOIN subscriptions s ON s.id = j.subscription_id
     WHERE j.tenant_id = $1::uuid`,
    [tenantId]
  );

  const row = r.rows[0];
  const pending = parseInt(row?.pending ?? '0', 10);
  const failed = parseInt(row?.failed ?? '0', 10);
  const stuck = parseInt(row?.stuck ?? '0', 10);
  const orphan = parseInt(row?.orphan ?? '0', 10);

  let score = 100;
  if (stuck > 0) {
    issues.push({
      code: 'JOBS_STUCK_RETRY',
      severity: 'ERROR',
      area: 'jobs',
      message: `${stuck} jobs com retry preso`,
    });
    score = 30;
  }
  if (failed > 0) {
    issues.push({
      code: 'JOBS_FAILED',
      severity: 'WARNING',
      area: 'jobs',
      message: `${failed} jobs falhados`,
    });
    score = Math.min(score, 60);
  }
  if (orphan > 0) {
    issues.push({
      code: 'JOBS_ORPHAN',
      severity: 'CRITICAL',
      area: 'jobs',
      message: `${orphan} jobs órfãos`,
    });
    score = 0;
  }

  return {
    area: {
      area: 'jobs',
      weight: MIGRATION_AREA_WEIGHTS.jobs,
      score,
      passed: score >= 100 && stuck === 0 && orphan === 0,
      detail: { pending, failed, stuck, orphan },
    },
    issues,
    summary: { pending, failed, stuck, orphan },
  };
}
