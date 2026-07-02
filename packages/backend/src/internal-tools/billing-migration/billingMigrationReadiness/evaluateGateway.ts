/**
 * Billing Engine V2 — Sprint 2.3E: avaliação Gateway por tenant (READ ONLY).
 */
import type { Pool } from 'pg';
import { pool } from '../../../utils/db.js';
import type { MigrationAreaScore, MigrationBlockingIssue } from './types.js';
import { MIGRATION_AREA_WEIGHTS } from './types.js';

export type GatewayEvaluationResult = {
  area: MigrationAreaScore;
  issues: MigrationBlockingIssue[];
  summary: Record<string, unknown>;
};

export async function evaluateGateway(
  tenantId: string,
  db: Pick<Pool, 'query'> = pool
): Promise<GatewayEvaluationResult> {
  const issues: MigrationBlockingIssue[] = [];
  const r = await db.query<{
    inconsistent: string;
    total_active: string;
  }>(
    `SELECT
       count(*) FILTER (
         WHERE s.gateway IS NOT NULL AND s.gateway != ''
           AND ci.gateway IS NOT NULL AND ci.gateway != ''
           AND s.gateway != ci.gateway
       )::text AS inconsistent,
       count(DISTINCT s.id)::text AS total_active
     FROM subscriptions s
     LEFT JOIN LATERAL (
       SELECT gateway FROM customer_invoices
       WHERE subscription_id = s.id AND tenant_id = s.tenant_id
       ORDER BY created_at DESC LIMIT 1
     ) ci ON true
     WHERE s.tenant_id = $1::uuid AND s.type = 'customer' AND s.status = 'active'`,
    [tenantId]
  );

  const row = r.rows[0];
  const inconsistent = parseInt(row?.inconsistent ?? '0', 10);
  const totalActive = parseInt(row?.total_active ?? '0', 10);

  let score = 100;
  if (inconsistent > 0) {
    issues.push({
      code: 'GATEWAY_INCONSISTENT',
      severity: 'ERROR',
      area: 'gateway',
      message: `${inconsistent} assinaturas com gateway inconsistente`,
    });
    score = Math.max(0, 100 - inconsistent * 20);
  }

  return {
    area: {
      area: 'gateway',
      weight: MIGRATION_AREA_WEIGHTS.gateway,
      score,
      passed: score >= 100 && inconsistent === 0,
      detail: { inconsistent, total_active: totalActive },
    },
    issues,
    summary: { inconsistent, total_active: totalActive },
  };
}
