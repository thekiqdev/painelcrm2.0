/**
 * Billing Engine V2 — Sprint 2.3E: avaliação Billing Items por tenant (READ ONLY).
 */
import type { Pool } from 'pg';
import { pool } from '../../../utils/db.js';
import type { MigrationAreaScore, MigrationBlockingIssue } from './types.js';
import { MIGRATION_AREA_WEIGHTS } from './types.js';

export type ItemEvaluationResult = {
  area: MigrationAreaScore;
  issues: MigrationBlockingIssue[];
  summary: Record<string, unknown>;
};

export async function evaluateItems(
  tenantId: string,
  db: Pick<Pool, 'query'> = pool
): Promise<ItemEvaluationResult> {
  const issues: MigrationBlockingIssue[] = [];
  const r = await db.query<{
    total: string;
    active: string;
    without_hash: string;
    duplicates: string;
  }>(
    `SELECT
       count(*)::text AS total,
       count(*) FILTER (WHERE status = 'active')::text AS active,
       count(*) FILTER (WHERE definition_hash IS NULL OR definition_hash = '')::text AS without_hash,
       (
         SELECT count(*)::text FROM (
           SELECT billing_plan_id, sequence, count(*) AS c
           FROM billing_plan_items
           WHERE tenant_id = $1::uuid AND status = 'active'
           GROUP BY billing_plan_id, sequence
           HAVING count(*) > 1
         ) dup
       ) AS duplicates
     FROM billing_plan_items
     WHERE tenant_id = $1::uuid`,
    [tenantId]
  );

  const row = r.rows[0];
  const total = parseInt(row?.total ?? '0', 10);
  const active = parseInt(row?.active ?? '0', 10);
  const withoutHash = parseInt(row?.without_hash ?? '0', 10);
  const duplicates = parseInt(row?.duplicates ?? '0', 10);

  let score = 100;
  if (total === 0) {
    issues.push({
      code: 'ITEMS_NONE',
      severity: 'INFO',
      area: 'billing_items',
      message: 'Nenhum billing item persistido',
    });
    score = 80;
  } else {
    if (withoutHash > 0) {
      issues.push({
        code: 'ITEMS_MISSING_HASH',
        severity: 'WARNING',
        area: 'billing_items',
        message: `${withoutHash} itens sem definition_hash`,
      });
      score = Math.min(score, 70);
    }
    if (duplicates > 0) {
      issues.push({
        code: 'ITEMS_DUPLICATE_SEQUENCE',
        severity: 'ERROR',
        area: 'billing_items',
        message: `${duplicates} sequências duplicadas ativas`,
      });
      score = Math.min(score, 40);
    }
    if (active === 0) {
      issues.push({
        code: 'ITEMS_NO_ACTIVE',
        severity: 'WARNING',
        area: 'billing_items',
        message: 'Nenhum item ativo',
      });
      score = Math.min(score, 50);
    }
  }

  return {
    area: {
      area: 'billing_items',
      weight: MIGRATION_AREA_WEIGHTS.billing_items,
      score,
      passed: score >= 100 && duplicates === 0,
      detail: { total, active, without_hash: withoutHash, duplicates },
    },
    issues,
    summary: { total, active, without_hash: withoutHash, duplicates },
  };
}
