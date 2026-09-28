/**
 * Billing Engine V2 — Sprint 2.3E: avaliação Shadow por tenant (READ ONLY).
 */
import type { Pool } from 'pg';
import { pool } from '../../../utils/db.js';
import type { MigrationAreaScore, MigrationBlockingIssue } from './types.js';
import { MIGRATION_AREA_WEIGHTS } from './types.js';

export type ShadowEvaluationResult = {
  area: MigrationAreaScore;
  issues: MigrationBlockingIssue[];
  summary: Record<string, unknown>;
};

const DEFAULT_CYCLES = 5;

export async function evaluateShadow(
  tenantId: string,
  db: Pick<Pool, 'query'> = pool,
  cycles = DEFAULT_CYCLES
): Promise<ShadowEvaluationResult> {
  const issues: MigrationBlockingIssue[] = [];
  const r = await db.query<{
    total: string;
    approved: string;
    avg_score: string | null;
    min_score: string | null;
    failed: string;
    hash_mismatch: string;
    consistency_failed: string;
  }>(
    `SELECT
       count(*)::text AS total,
       count(*) FILTER (WHERE approved = true)::text AS approved,
       round(avg(comparison_score)::numeric, 2)::text AS avg_score,
       min(comparison_score)::text AS min_score,
       count(*) FILTER (WHERE execution_failed = true)::text AS failed,
       count(*) FILTER (WHERE projection_success = false)::text AS hash_mismatch,
       count(*) FILTER (WHERE consistency_failed = true)::text AS consistency_failed
     FROM (
       SELECT DISTINCT ON (subscription_id, cycle_key)
         subscription_id, cycle_key, approved, comparison_score,
         execution_failed, projection_success, consistency_failed
       FROM billing_shadow_reports
       WHERE tenant_id = $1::uuid
       ORDER BY subscription_id, cycle_key, created_at DESC
     ) latest
     LIMIT $2`,
    [tenantId, cycles * 50]
  );

  const row = r.rows[0];
  const total = parseInt(row?.total ?? '0', 10);
  const approved = parseInt(row?.approved ?? '0', 10);
  const avgScore = row?.avg_score != null ? Number(row.avg_score) : null;
  const minScore = row?.min_score != null ? Number(row.min_score) : null;
  const failed = parseInt(row?.failed ?? '0', 10);
  const consistencyFailed = parseInt(row?.consistency_failed ?? '0', 10);

  let score = 0;
  if (total === 0) {
    issues.push({
      code: 'SHADOW_NO_DATA',
      severity: 'WARNING',
      area: 'shadow',
      message: 'Nenhum relatório shadow para o tenant',
    });
    score = 0;
  } else {
    score = avgScore != null ? Math.round(avgScore) : 0;
    if (minScore != null && minScore < 100) {
      issues.push({
        code: 'SHADOW_MIN_SCORE_LOW',
        severity: minScore < 50 ? 'ERROR' : 'WARNING',
        area: 'shadow',
        message: `Score mínimo shadow ${minScore}`,
        detail: { min_score: minScore },
      });
    }
    if (approved < total) {
      issues.push({
        code: 'SHADOW_NOT_ALL_APPROVED',
        severity: 'WARNING',
        area: 'shadow',
        message: `${total - approved} shadow reports não aprovados`,
        detail: { approved, total },
      });
    }
    if (failed > 0) {
      issues.push({
        code: 'SHADOW_EXECUTION_FAILED',
        severity: 'ERROR',
        area: 'shadow',
        message: `${failed} execuções shadow falharam`,
      });
    }
    if (consistencyFailed > 0) {
      issues.push({
        code: 'SHADOW_CONSISTENCY_FAILED',
        severity: 'WARNING',
        area: 'shadow',
        message: `${consistencyFailed} ciclos com consistency_failed`,
      });
    }
  }

  return {
    area: {
      area: 'shadow',
      weight: MIGRATION_AREA_WEIGHTS.shadow,
      score,
      passed: score >= 100 && failed === 0,
      detail: { total, approved, avg_score: avgScore, min_score: minScore },
    },
    issues,
    summary: { total, approved, avg_score: avgScore, min_score: minScore, failed },
  };
}
