/**
 * Billing Engine V2 — Sprint 2.3E: avaliação Billing Plans por tenant (READ ONLY).
 */
import type { Pool } from 'pg';
import { pool } from '../../../utils/db.js';
import type { MigrationAreaScore, MigrationBlockingIssue } from './types.js';
import { MIGRATION_AREA_WEIGHTS } from './types.js';

export type PlanEvaluationResult = {
  area: MigrationAreaScore;
  issues: MigrationBlockingIssue[];
  summary: Record<string, unknown>;
};

export async function evaluatePlans(
  tenantId: string,
  db: Pick<Pool, 'query'> = pool
): Promise<PlanEvaluationResult> {
  const issues: MigrationBlockingIssue[] = [];
  const r = await db.query<{
    total: string;
    active: string;
    invalid: string;
    draft: string;
  }>(
    `SELECT
       count(*)::text AS total,
       count(*) FILTER (WHERE status = 'active')::text AS active,
       count(*) FILTER (WHERE status NOT IN ('active', 'draft', 'archived'))::text AS invalid,
       count(*) FILTER (WHERE status = 'draft')::text AS draft
     FROM billing_plans
     WHERE tenant_id = $1::uuid`,
    [tenantId]
  );

  const row = r.rows[0];
  const total = parseInt(row?.total ?? '0', 10);
  const active = parseInt(row?.active ?? '0', 10);
  const invalid = parseInt(row?.invalid ?? '0', 10);

  let score = 100;
  if (total === 0) {
    issues.push({
      code: 'PLANS_NONE',
      severity: 'INFO',
      area: 'billing_plans',
      message: 'Nenhum billing plan persistido (pode usar virtual)',
    });
    score = 80;
  } else {
    if (invalid > 0) {
      issues.push({
        code: 'PLANS_INVALID_STATE',
        severity: 'ERROR',
        area: 'billing_plans',
        message: `${invalid} planos em estado inválido`,
      });
      score = Math.max(0, 100 - invalid * 25);
    }
    if (active === 0 && total > 0) {
      issues.push({
        code: 'PLANS_NO_ACTIVE',
        severity: 'WARNING',
        area: 'billing_plans',
        message: 'Nenhum plano ativo',
      });
      score = Math.min(score, 50);
    }
  }

  return {
    area: {
      area: 'billing_plans',
      weight: MIGRATION_AREA_WEIGHTS.billing_plans,
      score,
      passed: score >= 100 && invalid === 0,
      detail: { total, active, invalid },
    },
    issues,
    summary: { total, active, invalid },
  };
}
