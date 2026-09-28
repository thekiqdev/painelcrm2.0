/**
 * Billing Engine V2 — Sprint 2.3G: persistência cutover reports.
 */
import type { Pool, PoolClient } from 'pg';
import { pool } from '../../../utils/db.js';
import type { BillingCutoverReport } from './types.js';

type Db = Pick<Pool, 'query'> | PoolClient;

export type BillingCutoverReportRow = {
  id: string;
  tenant_id: string;
  correlation_id: string | null;
  approved: boolean;
  approval_level: string;
  recommendation: string;
  overall_score: number;
  blocking_issues_json: unknown;
  warnings_json: unknown;
  readiness_snapshot_json: unknown;
  simulator_snapshot_json: unknown;
  projection_snapshot_json: unknown;
  consistency_snapshot_json: unknown;
  shadow_snapshot_json: unknown;
  report_json: unknown;
  duration_ms: number;
  generated_at: string;
};

function mapRow(row: Record<string, unknown>): BillingCutoverReportRow {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    correlation_id: row.correlation_id != null ? String(row.correlation_id) : null,
    approved: Boolean(row.approved),
    approval_level: String(row.approval_level),
    recommendation: String(row.recommendation),
    overall_score: Number(row.overall_score),
    blocking_issues_json: row.blocking_issues_json,
    warnings_json: row.warnings_json,
    readiness_snapshot_json: row.readiness_snapshot_json,
    simulator_snapshot_json: row.simulator_snapshot_json,
    projection_snapshot_json: row.projection_snapshot_json,
    consistency_snapshot_json: row.consistency_snapshot_json,
    shadow_snapshot_json: row.shadow_snapshot_json,
    report_json: row.report_json,
    duration_ms: Number(row.duration_ms),
    generated_at: String(row.generated_at),
  };
}

export class BillingCutoverRepository {
  constructor(private readonly db: Db = pool) {}

  async insert(report: BillingCutoverReport): Promise<BillingCutoverReportRow> {
    const r = await this.db.query(
      `INSERT INTO billing_cutover_reports (
         tenant_id, correlation_id, approved, approval_level, recommendation,
         overall_score, blocking_issues_json, warnings_json,
         readiness_snapshot_json, simulator_snapshot_json,
         projection_snapshot_json, consistency_snapshot_json, shadow_snapshot_json,
         report_json, duration_ms
       ) VALUES (
         $1::uuid, $2, $3, $4, $5,
         $6, $7::jsonb, $8::jsonb,
         $9::jsonb, $10::jsonb,
         $11::jsonb, $12::jsonb, $13::jsonb,
         $14::jsonb, $15
       )
       RETURNING *`,
      [
        report.tenant_id,
        report.correlation_id,
        report.decision.approved,
        report.decision.approvalLevel,
        report.decision.featureFlagRecommendation,
        report.decision.overallScore,
        JSON.stringify(report.decision.blockingIssues),
        JSON.stringify(report.decision.warnings),
        JSON.stringify(report.readiness_snapshot),
        JSON.stringify(report.simulator_snapshot),
        JSON.stringify(report.projection_snapshot),
        JSON.stringify(report.consistency_snapshot),
        JSON.stringify(report.shadow_snapshot),
        JSON.stringify(report),
        report.diagnostics.duration_ms,
      ]
    );
    return mapRow(r.rows[0] as Record<string, unknown>);
  }

  async findLatestByTenant(tenantId: string): Promise<BillingCutoverReportRow | null> {
    const r = await this.db.query(
      `SELECT * FROM billing_cutover_reports
       WHERE tenant_id = $1::uuid
       ORDER BY generated_at DESC LIMIT 1`,
      [tenantId]
    );
    const row = r.rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async getDashboardStats(): Promise<{
    ready: number;
    blocked: number;
    warnings: number;
    average_score: number | null;
    pending: number;
    candidates: number;
    rollback_safe: number;
    shadow_healthy: number;
    last_evaluation: string | null;
  }> {
    const r = await this.db.query<{
      ready: string;
      blocked: string;
      warnings: string;
      avg_score: string | null;
      pending: string;
      candidates: string;
      rollback_safe: string;
      shadow_healthy: string;
      last_eval: string | null;
    }>(
      `SELECT
         count(*) FILTER (WHERE approved = true)::text AS ready,
         count(*) FILTER (WHERE approval_level = 'BLOCKED')::text AS blocked,
         count(*) FILTER (WHERE approval_level = 'READY_WITH_WARNINGS')::text AS warnings,
         round(avg(overall_score)::numeric, 2)::text AS avg_score,
         count(*) FILTER (WHERE approval_level = 'CUTOVER_PENDING')::text AS pending,
         count(*) FILTER (WHERE approval_level IN ('APPROVED', 'CUTOVER_PENDING'))::text AS candidates,
         count(*) FILTER (
           WHERE report_json->'decision'->'rollbackPlan'->>'rollback_safe' = 'true'
         )::text AS rollback_safe,
         count(*) FILTER (
           WHERE (shadow_snapshot_json->>'readiness_shadow_score')::int = 100
         )::text AS shadow_healthy,
         max(generated_at)::text AS last_eval
       FROM (
         SELECT DISTINCT ON (tenant_id) *
         FROM billing_cutover_reports
         ORDER BY tenant_id, generated_at DESC
       ) latest`
    );
    const row = r.rows[0];
    return {
      ready: parseInt(row?.ready ?? '0', 10),
      blocked: parseInt(row?.blocked ?? '0', 10),
      warnings: parseInt(row?.warnings ?? '0', 10),
      average_score: row?.avg_score != null ? Number(row.avg_score) : null,
      pending: parseInt(row?.pending ?? '0', 10),
      candidates: parseInt(row?.candidates ?? '0', 10),
      rollback_safe: parseInt(row?.rollback_safe ?? '0', 10),
      shadow_healthy: parseInt(row?.shadow_healthy ?? '0', 10),
      last_evaluation: row?.last_eval,
    };
  }

  async getRecent(limit = 10): Promise<
    Array<{
      tenant_id: string;
      approval_level: string;
      recommendation: string;
      approved: boolean;
      overall_score: number;
      generated_at: string;
    }>
  > {
    const r = await this.db.query(
      `SELECT tenant_id::text, approval_level, recommendation, approved,
              overall_score, generated_at::text
       FROM billing_cutover_reports
       ORDER BY generated_at DESC
       LIMIT $1`,
      [limit]
    );
    return r.rows.map((row) => ({
      tenant_id: String(row.tenant_id),
      approval_level: String(row.approval_level),
      recommendation: String(row.recommendation),
      approved: Boolean(row.approved),
      overall_score: Number(row.overall_score),
      generated_at: String(row.generated_at),
    }));
  }

  async purgeOlderThan(days: number): Promise<number> {
    const r = await this.db.query(
      `DELETE FROM billing_cutover_reports
       WHERE generated_at < now() - ($1::text || ' days')::interval`,
      [String(days)]
    );
    return r.rowCount ?? 0;
  }
}

export const billingCutoverRepository = new BillingCutoverRepository();
