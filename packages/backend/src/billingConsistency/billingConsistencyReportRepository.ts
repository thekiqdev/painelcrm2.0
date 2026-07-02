/**
 * Billing Engine V2 — Sprint 2.3B: persistência consistency reports (única escrita).
 */
import type { Pool, PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import type { BillingConsistencyResult } from './types.js';

type Db = Pick<Pool, 'query'> | PoolClient;

export type BillingConsistencyReportRow = {
  id: string;
  subscription_id: string;
  tenant_id: string;
  plan_id: string | null;
  confidence: number;
  score: number;
  approved: boolean;
  checks_json: unknown;
  warnings_json: unknown;
  errors_json: unknown;
  execution_ms: number;
  correlation_id: string | null;
  created_at: string;
};

function mapRow(row: Record<string, unknown>): BillingConsistencyReportRow {
  return {
    id: String(row.id),
    subscription_id: String(row.subscription_id),
    tenant_id: String(row.tenant_id),
    plan_id: row.plan_id != null ? String(row.plan_id) : null,
    confidence: Number(row.confidence),
    score: Number(row.score),
    approved: Boolean(row.approved),
    checks_json: row.checks_json,
    warnings_json: row.warnings_json,
    errors_json: row.errors_json,
    execution_ms: Number(row.execution_ms),
    correlation_id: row.correlation_id != null ? String(row.correlation_id) : null,
    created_at: String(row.created_at),
  };
}

export class BillingConsistencyReportRepository {
  constructor(private readonly db: Db = pool) {}

  async insert(result: BillingConsistencyResult): Promise<BillingConsistencyReportRow> {
    const r = await this.db.query(
      `INSERT INTO billing_consistency_reports (
         subscription_id, tenant_id, plan_id, confidence, score, approved,
         checks_json, warnings_json, errors_json, execution_ms, correlation_id
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4, $5, $6,
         $7::jsonb, $8::jsonb, $9::jsonb, $10, $11
       )
       RETURNING *`,
      [
        result.metadata.subscription_id,
        result.metadata.tenant_id,
        result.metadata.plan_id,
        result.confidence,
        result.score,
        result.approved,
        JSON.stringify(result.checks),
        JSON.stringify(result.warnings),
        JSON.stringify(result.errors),
        result.metadata.execution_ms,
        result.metadata.correlation_id ?? null,
      ]
    );
    return mapRow(r.rows[0] as Record<string, unknown>);
  }

  async findLatestBySubscription(subscriptionId: string): Promise<BillingConsistencyReportRow | null> {
    const r = await this.db.query(
      `SELECT * FROM billing_consistency_reports
       WHERE subscription_id = $1::uuid
       ORDER BY created_at DESC LIMIT 1`,
      [subscriptionId]
    );
    const row = r.rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async findHistoryBySubscription(
    subscriptionId: string,
    limit = 20
  ): Promise<BillingConsistencyReportRow[]> {
    const r = await this.db.query(
      `SELECT * FROM billing_consistency_reports
       WHERE subscription_id = $1::uuid
       ORDER BY created_at DESC LIMIT $2`,
      [subscriptionId, limit]
    );
    return r.rows.map((row) => mapRow(row as Record<string, unknown>));
  }

  async getDashboardStats(sinceDays = 30): Promise<{
    total_plans: number;
    healthy_plans: number;
    invalid_plans: number;
    average_confidence: number | null;
    average_score: number | null;
    critical_plans: number;
    warnings: number;
    top_problems: Array<{ code: string; count: number }>;
    last_validation: string | null;
  }> {
    const agg = await this.db.query<{
      total: string;
      healthy: string;
      invalid: string;
      avg_confidence: string | null;
      avg_score: string | null;
      critical: string;
      warnings: string;
      last_validation: string | null;
    }>(
      `SELECT
         count(DISTINCT plan_id) FILTER (WHERE plan_id IS NOT NULL)::text AS total,
         count(DISTINCT plan_id) FILTER (WHERE approved = true AND plan_id IS NOT NULL)::text AS healthy,
         count(DISTINCT plan_id) FILTER (WHERE approved = false AND plan_id IS NOT NULL)::text AS invalid,
         round(avg(confidence)::numeric, 2)::text AS avg_confidence,
         round(avg(score)::numeric, 2)::text AS avg_score,
         count(*) FILTER (WHERE approved = false AND score < 50)::text AS critical,
         count(*) FILTER (WHERE jsonb_array_length(warnings_json) > 0)::text AS warnings,
         max(created_at)::text AS last_validation
       FROM billing_consistency_reports
       WHERE created_at >= now() - ($1::text || ' days')::interval`,
      [String(sinceDays)]
    );

    const top = await this.db.query<{ code: string; count: string }>(
      `SELECT elem->>'code' AS code, count(*)::text AS count
       FROM billing_consistency_reports r,
            jsonb_array_elements(r.errors_json) AS elem
       WHERE r.created_at >= now() - ($1::text || ' days')::interval
       GROUP BY 1
       ORDER BY count(*) DESC
       LIMIT 10`,
      [String(sinceDays)]
    );

    const row = agg.rows[0];
    return {
      total_plans: parseInt(row?.total ?? '0', 10),
      healthy_plans: parseInt(row?.healthy ?? '0', 10),
      invalid_plans: parseInt(row?.invalid ?? '0', 10),
      average_confidence: row?.avg_confidence != null ? Number(row.avg_confidence) : null,
      average_score: row?.avg_score != null ? Number(row.avg_score) : null,
      critical_plans: parseInt(row?.critical ?? '0', 10),
      warnings: parseInt(row?.warnings ?? '0', 10),
      top_problems: top.rows.map((t) => ({ code: t.code, count: parseInt(t.count, 10) })),
      last_validation: row?.last_validation,
    };
  }

  async getHealthStats(sinceDays = 7): Promise<{
    healthy: boolean;
    average_confidence: number | null;
    average_score: number | null;
    plans_validated: number;
    invalid_plans: number;
    critical_plans: number;
    last_validation: string | null;
  }> {
    const dash = await this.getDashboardStats(sinceDays);
    return {
      healthy: dash.invalid_plans === 0 && dash.critical_plans === 0,
      average_confidence: dash.average_confidence,
      average_score: dash.average_score,
      plans_validated: dash.total_plans,
      invalid_plans: dash.invalid_plans,
      critical_plans: dash.critical_plans,
      last_validation: dash.last_validation,
    };
  }

  async purgeOlderThan(days: number): Promise<number> {
    const r = await this.db.query(
      `DELETE FROM billing_consistency_reports
       WHERE created_at < now() - ($1::text || ' days')::interval`,
      [String(days)]
    );
    return r.rowCount ?? 0;
  }
}

export const billingConsistencyReportRepository = new BillingConsistencyReportRepository();
