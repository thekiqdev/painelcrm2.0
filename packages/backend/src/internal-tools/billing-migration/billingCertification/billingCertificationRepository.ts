/**
 * Billing Engine V2 — Sprint 2.4A: persistência certification reports.
 */
import type { Pool, PoolClient } from 'pg';
import { pool } from '../../../utils/db.js';
import type { BillingCertificationReport } from './types.js';

type Db = Pick<Pool, 'query'> | PoolClient;

export type BillingCertificationReportRow = {
  id: string;
  tenant_id: string;
  subscription_id: string;
  correlation_id: string | null;
  certification_score: number;
  certified: boolean;
  recommendation: string;
  projection_summary_json: unknown;
  consistency_summary_json: unknown;
  shadow_summary_json: unknown;
  readiness_summary_json: unknown;
  simulator_summary_json: unknown;
  cutover_summary_json: unknown;
  failures_json: unknown;
  warnings_json: unknown;
  report_json: unknown;
  execution_time_ms: number;
  certified_at: string | null;
  generated_at: string;
};

function mapRow(row: Record<string, unknown>): BillingCertificationReportRow {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    subscription_id: String(row.subscription_id),
    correlation_id: row.correlation_id != null ? String(row.correlation_id) : null,
    certification_score: Number(row.certification_score),
    certified: Boolean(row.certified),
    recommendation: String(row.recommendation),
    projection_summary_json: row.projection_summary_json,
    consistency_summary_json: row.consistency_summary_json,
    shadow_summary_json: row.shadow_summary_json,
    readiness_summary_json: row.readiness_summary_json,
    simulator_summary_json: row.simulator_summary_json,
    cutover_summary_json: row.cutover_summary_json,
    failures_json: row.failures_json,
    warnings_json: row.warnings_json,
    report_json: row.report_json,
    execution_time_ms: Number(row.execution_time_ms),
    certified_at: row.certified_at != null ? String(row.certified_at) : null,
    generated_at: String(row.generated_at),
  };
}

export class BillingCertificationRepository {
  constructor(private readonly db: Db = pool) {}

  async insert(report: BillingCertificationReport): Promise<BillingCertificationReportRow> {
    const r = await this.db.query(
      `INSERT INTO billing_certification_reports (
         tenant_id, subscription_id, correlation_id, certification_score, certified,
         recommendation, projection_summary_json, consistency_summary_json,
         shadow_summary_json, readiness_summary_json, simulator_summary_json,
         cutover_summary_json, failures_json, warnings_json, report_json,
         execution_time_ms, certified_at
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4, $5,
         $6, $7::jsonb, $8::jsonb,
         $9::jsonb, $10::jsonb, $11::jsonb,
         $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb,
         $16, $17
       )
       RETURNING *`,
      [
        report.tenant_id,
        report.subscription_id,
        report.correlation_id,
        report.certification_score,
        report.certified,
        report.recommendation,
        JSON.stringify(report.projection_summary),
        JSON.stringify(report.consistency_summary),
        JSON.stringify(report.shadow_summary),
        JSON.stringify(report.readiness_summary),
        JSON.stringify(report.simulator_summary),
        JSON.stringify(report.cutover_summary),
        JSON.stringify(report.failures),
        JSON.stringify(report.warnings),
        JSON.stringify(report),
        report.execution_time_ms,
        report.certified_at,
      ]
    );
    return mapRow(r.rows[0] as Record<string, unknown>);
  }

  async findLatestBySubscription(subscriptionId: string): Promise<BillingCertificationReportRow | null> {
    const r = await this.db.query(
      `SELECT * FROM billing_certification_reports
       WHERE subscription_id = $1::uuid
       ORDER BY generated_at DESC LIMIT 1`,
      [subscriptionId]
    );
    const row = r.rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async getDashboardStats(): Promise<{
    total_subscriptions: number;
    certified: number;
    failed: number;
    average_score: number | null;
    projection_100: number;
    shadow_100: number;
    consistency_100: number;
    simulator_ok: number;
    cutover_ok: number;
    last_evaluation: string | null;
  }> {
    const r = await this.db.query<{
      total: string;
      certified: string;
      failed: string;
      avg_score: string | null;
      projection_100: string;
      shadow_100: string;
      consistency_100: string;
      simulator_ok: string;
      cutover_ok: string;
      last_eval: string | null;
    }>(
      `SELECT
         count(*)::text AS total,
         count(*) FILTER (WHERE certified = true)::text AS certified,
         count(*) FILTER (WHERE certified = false)::text AS failed,
         round(avg(certification_score)::numeric, 2)::text AS avg_score,
         count(*) FILTER (WHERE (projection_summary_json->>'passed')::boolean = true)::text AS projection_100,
         count(*) FILTER (WHERE (shadow_summary_json->>'passed')::boolean = true)::text AS shadow_100,
         count(*) FILTER (WHERE (consistency_summary_json->>'passed')::boolean = true)::text AS consistency_100,
         count(*) FILTER (WHERE (simulator_summary_json->>'passed')::boolean = true)::text AS simulator_ok,
         count(*) FILTER (WHERE (cutover_summary_json->>'passed')::boolean = true)::text AS cutover_ok,
         max(generated_at)::text AS last_eval
       FROM (
         SELECT DISTINCT ON (subscription_id) *
         FROM billing_certification_reports
         ORDER BY subscription_id, generated_at DESC
       ) latest`
    );
    const row = r.rows[0];
    return {
      total_subscriptions: parseInt(row?.total ?? '0', 10),
      certified: parseInt(row?.certified ?? '0', 10),
      failed: parseInt(row?.failed ?? '0', 10),
      average_score: row?.avg_score != null ? Number(row.avg_score) : null,
      projection_100: parseInt(row?.projection_100 ?? '0', 10),
      shadow_100: parseInt(row?.shadow_100 ?? '0', 10),
      consistency_100: parseInt(row?.consistency_100 ?? '0', 10),
      simulator_ok: parseInt(row?.simulator_ok ?? '0', 10),
      cutover_ok: parseInt(row?.cutover_ok ?? '0', 10),
      last_evaluation: row?.last_eval,
    };
  }

  async getRecent(limit = 10): Promise<
    Array<{
      subscription_id: string;
      tenant_id: string;
      certified: boolean;
      certification_score: number;
      recommendation: string;
      generated_at: string;
    }>
  > {
    const r = await this.db.query(
      `SELECT subscription_id::text, tenant_id::text, certified,
              certification_score, recommendation, generated_at::text
       FROM billing_certification_reports
       ORDER BY generated_at DESC
       LIMIT $1`,
      [limit]
    );
    return r.rows.map((row) => ({
      subscription_id: String(row.subscription_id),
      tenant_id: String(row.tenant_id),
      certified: Boolean(row.certified),
      certification_score: Number(row.certification_score),
      recommendation: String(row.recommendation),
      generated_at: String(row.generated_at),
    }));
  }

  async purgeOlderThan(days: number): Promise<number> {
    const r = await this.db.query(
      `DELETE FROM billing_certification_reports
       WHERE generated_at < now() - ($1::text || ' days')::interval`,
      [String(days)]
    );
    return r.rowCount ?? 0;
  }
}

export const billingCertificationRepository = new BillingCertificationRepository();
