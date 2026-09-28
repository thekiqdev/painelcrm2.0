/**
 * Billing Engine V2 — Sprint 2.3E: avaliação Projection por tenant (READ ONLY).
 */
import type { Pool } from 'pg';
import { pool } from '../../../utils/db.js';
import type { MigrationAreaScore, MigrationBlockingIssue } from './types.js';
import { MIGRATION_AREA_WEIGHTS } from './types.js';

export type ProjectionEvaluationResult = {
  area: MigrationAreaScore;
  issues: MigrationBlockingIssue[];
  summary: Record<string, unknown>;
};

export async function evaluateProjection(
  tenantId: string,
  db: Pick<Pool, 'query'> = pool
): Promise<ProjectionEvaluationResult> {
  const issues: MigrationBlockingIssue[] = [];
  const r = await db.query<{
    total: string;
    success: string;
    avg_score: string | null;
    avg_duration: string | null;
    hash_present: string;
  }>(
    `SELECT
       count(*)::text AS total,
       count(*) FILTER (WHERE projection_success = true)::text AS success,
       round(avg(projection_score)::numeric, 2)::text AS avg_score,
       round(avg(projection_duration_ms)::numeric, 2)::text AS avg_duration,
       count(*) FILTER (WHERE projection_hash IS NOT NULL)::text AS hash_present
     FROM billing_shadow_reports
     WHERE tenant_id = $1::uuid AND projection_engine_version IS NOT NULL`,
    [tenantId]
  );

  const row = r.rows[0];
  const total = parseInt(row?.total ?? '0', 10);
  const success = parseInt(row?.success ?? '0', 10);
  const avgScore = row?.avg_score != null ? Number(row.avg_score) : null;
  const avgDuration = row?.avg_duration != null ? Number(row.avg_duration) : null;
  const hashPresent = parseInt(row?.hash_present ?? '0', 10);

  let score = 0;
  if (total === 0) {
    issues.push({
      code: 'PROJECTION_NO_DATA',
      severity: 'WARNING',
      area: 'projection',
      message: 'Nenhuma projeção registrada para o tenant',
    });
  } else {
    score = avgScore != null ? Math.round(avgScore) : success === total ? 100 : 0;
    if (success < total) {
      issues.push({
        code: 'PROJECTION_FAILURES',
        severity: 'ERROR',
        area: 'projection',
        message: `${total - success} projeções falharam`,
        detail: { success, total },
      });
    }
    if (hashPresent < total) {
      issues.push({
        code: 'PROJECTION_HASH_MISSING',
        severity: 'WARNING',
        area: 'projection',
        message: 'Projeções sem hash determinístico',
      });
    }
  }

  return {
    area: {
      area: 'projection',
      weight: MIGRATION_AREA_WEIGHTS.projection,
      score,
      passed: score >= 100 && success === total && total > 0,
      detail: { total, success, avg_score: avgScore, avg_duration_ms: avgDuration },
    },
    issues,
    summary: { total, success, avg_score: avgScore, avg_duration_ms: avgDuration, hash_present: hashPresent },
  };
}
