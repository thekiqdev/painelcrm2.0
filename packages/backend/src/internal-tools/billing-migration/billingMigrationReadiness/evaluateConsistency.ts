/**
 * Billing Engine V2 — Sprint 2.3E: avaliação Consistency por tenant (READ ONLY).
 */
import type { Pool } from 'pg';
import { pool } from '../../../utils/db.js';
import type { MigrationAreaScore, MigrationBlockingIssue } from './types.js';
import { MIGRATION_AREA_WEIGHTS } from './types.js';

export type ConsistencyEvaluationResult = {
  area: MigrationAreaScore;
  issues: MigrationBlockingIssue[];
  summary: Record<string, unknown>;
};

export async function evaluateConsistency(
  tenantId: string,
  db: Pick<Pool, 'query'> = pool
): Promise<ConsistencyEvaluationResult> {
  const issues: MigrationBlockingIssue[] = [];
  const r = await db.query<{
    total: string;
    approved: string;
    avg_confidence: string | null;
    avg_score: string | null;
    critical: string;
    with_errors: string;
  }>(
    `SELECT
       count(*)::text AS total,
       count(*) FILTER (WHERE approved = true)::text AS approved,
       round(avg(confidence)::numeric, 2)::text AS avg_confidence,
       round(avg(score)::numeric, 2)::text AS avg_score,
       count(*) FILTER (WHERE score < 50)::text AS critical,
       count(*) FILTER (WHERE jsonb_array_length(errors_json) > 0)::text AS with_errors
     FROM (
       SELECT DISTINCT ON (subscription_id)
         subscription_id, approved, confidence, score, errors_json
       FROM billing_consistency_reports
       WHERE tenant_id = $1::uuid
       ORDER BY subscription_id, created_at DESC
     ) latest`,
    [tenantId]
  );

  const row = r.rows[0];
  const total = parseInt(row?.total ?? '0', 10);
  const approved = parseInt(row?.approved ?? '0', 10);
  const avgConfidence = row?.avg_confidence != null ? Number(row.avg_confidence) : null;
  const avgScore = row?.avg_score != null ? Number(row.avg_score) : null;
  const critical = parseInt(row?.critical ?? '0', 10);
  const withErrors = parseInt(row?.with_errors ?? '0', 10);

  let score = 0;
  if (total === 0) {
    issues.push({
      code: 'CONSISTENCY_NO_DATA',
      severity: 'WARNING',
      area: 'consistency',
      message: 'Nenhum relatório de consistência para o tenant',
    });
  } else {
    score = avgScore != null ? Math.round(avgScore) : 0;
    if (critical > 0) {
      issues.push({
        code: 'CONSISTENCY_CRITICAL',
        severity: 'CRITICAL',
        area: 'consistency',
        message: `${critical} planos com score crítico`,
      });
    }
    if (withErrors > 0) {
      issues.push({
        code: 'CONSISTENCY_ERRORS',
        severity: 'ERROR',
        area: 'consistency',
        message: `${withErrors} validações com erros`,
      });
    }
    if (approved < total) {
      issues.push({
        code: 'CONSISTENCY_NOT_APPROVED',
        severity: 'WARNING',
        area: 'consistency',
        message: `${total - approved} validações não aprovadas`,
      });
    }
  }

  return {
    area: {
      area: 'consistency',
      weight: MIGRATION_AREA_WEIGHTS.consistency,
      score,
      passed: score >= 100 && critical === 0 && withErrors === 0,
      detail: { total, approved, avg_confidence: avgConfidence, avg_score: avgScore },
    },
    issues,
    summary: { total, approved, avg_confidence: avgConfidence, avg_score: avgScore, critical, with_errors: withErrors },
  };
}
