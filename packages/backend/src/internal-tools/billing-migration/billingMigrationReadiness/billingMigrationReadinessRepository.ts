/**
 * Billing Engine V2 — Sprint 2.3E: persistência readiness reports (única escrita).
 */
import type { Pool, PoolClient } from 'pg';
import { pool } from '../../../utils/db.js';
import type { BillingMigrationReadinessReport } from './types.js';

type Db = Pick<Pool, 'query'> | PoolClient;

export type BillingMigrationReadinessReportRow = {
  id: string;
  tenant_id: string;
  overall_score: number;
  approved: boolean;
  approval_level: string;
  recommendation: string;
  blocking_issues_json: unknown;
  statistics_json: unknown;
  shadow_summary_json: unknown;
  projection_summary_json: unknown;
  consistency_summary_json: unknown;
  engine_health_json: unknown;
  report_json: unknown;
  generated_at: string;
};

function mapRow(row: Record<string, unknown>): BillingMigrationReadinessReportRow {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    overall_score: Number(row.overall_score),
    approved: Boolean(row.approved),
    approval_level: String(row.approval_level),
    recommendation: String(row.recommendation),
    blocking_issues_json: row.blocking_issues_json,
    statistics_json: row.statistics_json,
    shadow_summary_json: row.shadow_summary_json,
    projection_summary_json: row.projection_summary_json,
    consistency_summary_json: row.consistency_summary_json,
    engine_health_json: row.engine_health_json,
    report_json: row.report_json,
    generated_at: String(row.generated_at),
  };
}

export class BillingMigrationReadinessRepository {
  constructor(private readonly db: Db = pool) {}

  async insert(report: BillingMigrationReadinessReport): Promise<BillingMigrationReadinessReportRow> {
    const r = await this.db.query(
      `INSERT INTO billing_migration_readiness_reports (
         tenant_id, overall_score, approved, approval_level, recommendation,
         blocking_issues_json, statistics_json, shadow_summary_json,
         projection_summary_json, consistency_summary_json, engine_health_json, report_json
       ) VALUES (
         $1::uuid, $2, $3, $4, $5,
         $6::jsonb, $7::jsonb, $8::jsonb,
         $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb
       )
       RETURNING *`,
      [
        report.tenantId,
        report.overallScore,
        report.approved,
        report.approvalLevel,
        report.migrationRecommendation,
        JSON.stringify(report.blockingIssues),
        JSON.stringify(report.statistics),
        JSON.stringify(report.shadowSummary),
        JSON.stringify(report.projectionSummary),
        JSON.stringify(report.consistencySummary),
        JSON.stringify(report.engineHealthSummary),
        JSON.stringify(report),
      ]
    );
    return mapRow(r.rows[0] as Record<string, unknown>);
  }

  async findLatestByTenant(tenantId: string): Promise<BillingMigrationReadinessReportRow | null> {
    const r = await this.db.query(
      `SELECT * FROM billing_migration_readiness_reports
       WHERE tenant_id = $1::uuid
       ORDER BY generated_at DESC LIMIT 1`,
      [tenantId]
    );
    const row = r.rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async getDashboardStats(): Promise<{
    total_tenants: number;
    ready: number;
    not_ready: number;
    average_score: number | null;
    critical_issues: number;
    last_evaluation: string | null;
  }> {
    const r = await this.db.query<{
      total_tenants: string;
      ready: string;
      not_ready: string;
      average_score: string | null;
      critical_issues: string;
      last_evaluation: string | null;
    }>(
      `SELECT
         count(DISTINCT tenant_id)::text AS total_tenants,
         count(DISTINCT tenant_id) FILTER (WHERE approved = true)::text AS ready,
         count(DISTINCT tenant_id) FILTER (WHERE approved = false)::text AS not_ready,
         round(avg(overall_score)::numeric, 2)::text AS average_score,
         count(*) FILTER (
           WHERE jsonb_array_length(blocking_issues_json) > 0
             AND blocking_issues_json::text LIKE '%CRITICAL%'
         )::text AS critical_issues,
         max(generated_at)::text AS last_evaluation
       FROM (
         SELECT DISTINCT ON (tenant_id) *
         FROM billing_migration_readiness_reports
         ORDER BY tenant_id, generated_at DESC
       ) latest`
    );
    const row = r.rows[0];
    return {
      total_tenants: parseInt(row?.total_tenants ?? '0', 10),
      ready: parseInt(row?.ready ?? '0', 10),
      not_ready: parseInt(row?.not_ready ?? '0', 10),
      average_score: row?.average_score != null ? Number(row.average_score) : null,
      critical_issues: parseInt(row?.critical_issues ?? '0', 10),
      last_evaluation: row?.last_evaluation,
    };
  }

  async getMigrationCandidates(limit = 10): Promise<
    Array<{ tenant_id: string; tenant_name: string | null; score: number }>
  > {
    const r = await this.db.query<{
      tenant_id: string;
      tenant_name: string | null;
      overall_score: number;
    }>(
      `SELECT l.tenant_id::text, t.company_name AS tenant_name, l.overall_score
       FROM (
         SELECT DISTINCT ON (tenant_id) tenant_id, overall_score, approved, recommendation
         FROM billing_migration_readiness_reports
         ORDER BY tenant_id, generated_at DESC
       ) l
       JOIN tenants t ON t.id = l.tenant_id
       WHERE l.approved = true AND l.recommendation = 'READY_TO_MIGRATE'
       ORDER BY l.overall_score DESC
       LIMIT $1`,
      [limit]
    );
    return r.rows.map((row) => ({
      tenant_id: row.tenant_id,
      tenant_name: row.tenant_name,
      score: Number(row.overall_score),
    }));
  }

  async getTopProblems(limit = 5): Promise<Array<{ code: string; count: number }>> {
    const r = await this.db.query<{ code: string; count: string }>(
      `SELECT elem->>'code' AS code, count(*)::text AS count
       FROM billing_migration_readiness_reports r,
            jsonb_array_elements(r.blocking_issues_json) AS elem
       WHERE r.generated_at >= now() - interval '30 days'
       GROUP BY elem->>'code'
       ORDER BY count(*) DESC
       LIMIT $1`,
      [limit]
    );
    return r.rows.map((row) => ({ code: row.code, count: parseInt(row.count, 10) }));
  }

  async purgeOlderThan(days: number): Promise<number> {
    const r = await this.db.query(
      `DELETE FROM billing_migration_readiness_reports
       WHERE generated_at < now() - ($1::text || ' days')::interval`,
      [String(days)]
    );
    return r.rowCount ?? 0;
  }
}

export const billingMigrationReadinessRepository = new BillingMigrationReadinessRepository();
