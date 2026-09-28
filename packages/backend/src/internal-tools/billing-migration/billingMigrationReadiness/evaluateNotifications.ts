/**
 * Billing Engine V2 — Sprint 2.3E: avaliação Notifications por tenant (READ ONLY).
 */
import type { Pool } from 'pg';
import { pool } from '../../../utils/db.js';
import type { MigrationAreaScore, MigrationBlockingIssue } from './types.js';
import { MIGRATION_AREA_WEIGHTS } from './types.js';

export type NotificationEvaluationResult = {
  area: MigrationAreaScore;
  issues: MigrationBlockingIssue[];
  summary: Record<string, unknown>;
};

export async function evaluateNotifications(
  tenantId: string,
  db: Pick<Pool, 'query'> = pool
): Promise<NotificationEvaluationResult> {
  const issues: MigrationBlockingIssue[] = [];
  const r = await db
    .query<{
      pending: string;
      failed: string;
    }>(
      `SELECT
         count(*) FILTER (WHERE status IN ('pending', 'queued', 'retry'))::text AS pending,
         count(*) FILTER (WHERE status IN ('failed', 'dead'))::text AS failed
       FROM notification_outbound_deliveries
       WHERE tenant_id = $1::uuid
         AND created_at >= now() - interval '7 days'`,
      [tenantId]
    )
    .catch(() => ({ rows: [{ pending: '0', failed: '0' }] }));

  const row = r.rows[0];
  const pending = parseInt(row?.pending ?? '0', 10);
  const failed = parseInt(row?.failed ?? '0', 10);

  let score = 100;
  if (pending > 10) {
    issues.push({
      code: 'NOTIFICATIONS_PENDING_QUEUE',
      severity: 'WARNING',
      area: 'notifications',
      message: `${pending} notificações pendentes na fila`,
    });
    score = 70;
  }
  if (failed > 0) {
    issues.push({
      code: 'NOTIFICATIONS_FAILED',
      severity: 'ERROR',
      area: 'notifications',
      message: `${failed} entregas falharam nos últimos 7 dias`,
    });
    score = Math.min(score, 50);
  }

  return {
    area: {
      area: 'notifications',
      weight: MIGRATION_AREA_WEIGHTS.notifications,
      score,
      passed: score >= 100 && failed === 0,
      detail: { pending, failed },
    },
    issues,
    summary: { pending, failed },
  };
}
