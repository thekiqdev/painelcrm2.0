/**
 * Billing Engine V2 — persistência de relatórios Shadow (única escrita permitida).
 */
import type { Pool, PoolClient } from 'pg';
import { pool } from '../../../utils/db.js';
import type { BillingShadowReport } from './types.js';

type Db = Pick<Pool, 'query'> | PoolClient;

export type BillingShadowReportRow = {
  id: string;
  tenant_id: string;
  subscription_id: string;
  cycle_key: string;
  correlation_id: string | null;
  comparison_score: number;
  approved: boolean;
  summary: string;
  differences_json: unknown;
  legacy_json: unknown;
  shadow_json: unknown;
  engine_versions: unknown;
  execution_failed: boolean;
  error_code: string | null;
  consistency_failed: boolean;
  consistency_confidence: number | null;
  consistency_reason: string | null;
  duration_ms: number;
  projection_duration_ms: number | null;
  projection_score: number | null;
  projection_version: string | null;
  projection_engine_version: string | null;
  projection_hash: string | null;
  projection_success: boolean | null;
  created_at: string;
};

function mapRow(row: Record<string, unknown>): BillingShadowReportRow {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    subscription_id: String(row.subscription_id),
    cycle_key: String(row.cycle_key),
    correlation_id: row.correlation_id != null ? String(row.correlation_id) : null,
    comparison_score: Number(row.comparison_score),
    approved: Boolean(row.approved),
    summary: String(row.summary),
    differences_json: row.differences_json,
    legacy_json: row.legacy_json,
    shadow_json: row.shadow_json,
    engine_versions: row.engine_versions,
    execution_failed: Boolean(row.execution_failed),
    error_code: row.error_code != null ? String(row.error_code) : null,
    consistency_failed: Boolean(row.consistency_failed),
    consistency_confidence:
      row.consistency_confidence != null ? Number(row.consistency_confidence) : null,
    consistency_reason:
      row.consistency_reason != null ? String(row.consistency_reason) : null,
    duration_ms: Number(row.duration_ms),
    projection_duration_ms:
      row.projection_duration_ms != null ? Number(row.projection_duration_ms) : null,
    projection_score: row.projection_score != null ? Number(row.projection_score) : null,
    projection_version:
      row.projection_version != null ? String(row.projection_version) : null,
    projection_engine_version:
      row.projection_engine_version != null ? String(row.projection_engine_version) : null,
    projection_hash: row.projection_hash != null ? String(row.projection_hash) : null,
    projection_success:
      row.projection_success != null ? Boolean(row.projection_success) : null,
    created_at: String(row.created_at),
  };
}

export class BillingShadowReportRepository {
  constructor(private readonly db: Db = pool) {}

  async insert(report: BillingShadowReport): Promise<BillingShadowReportRow> {
    const r = await this.db.query(
      `INSERT INTO billing_shadow_reports (
         tenant_id, subscription_id, cycle_key, correlation_id,
         comparison_score, approved, summary, differences_json,
         legacy_json, shadow_json, engine_versions,
         execution_failed, error_code, duration_ms,
         consistency_failed, consistency_confidence, consistency_reason,
         projection_duration_ms, projection_score, projection_version,
         projection_engine_version, projection_hash, projection_success
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4,
         $5, $6, $7, $8::jsonb,
         $9::jsonb, $10::jsonb, $11::jsonb,
         $12, $13, $14,
         $15, $16, $17,
         $18, $19, $20, $21, $22, $23
       )
       RETURNING *`,
      [
        report.tenant_id,
        report.subscription_id,
        report.cycle,
        report.correlation_id,
        report.score,
        report.approved,
        report.summary,
        JSON.stringify(report.differences),
        JSON.stringify(report.comparison.legacy),
        JSON.stringify(report.comparison.shadow),
        JSON.stringify(report.engine_versions),
        Boolean(report.execution_failed),
        report.error_code ?? null,
        report.duration_ms,
        Boolean(report.consistency_failed),
        report.consistency_confidence ?? null,
        report.consistency_reason ?? null,
        report.projection_duration_ms ?? null,
        report.projection_score ?? null,
        report.projection_version ?? null,
        report.projection_engine_version ?? null,
        report.projection_hash ?? null,
        report.projection_success ?? null,
      ]
    );
    return mapRow(r.rows[0] as Record<string, unknown>);
  }

  async findLatestBySubscription(subscriptionId: string): Promise<BillingShadowReportRow | null> {
    const r = await this.db.query(
      `SELECT * FROM billing_shadow_reports
       WHERE subscription_id = $1::uuid
       ORDER BY created_at DESC
       LIMIT 1`,
      [subscriptionId]
    );
    const row = r.rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async findHistoryBySubscription(
    subscriptionId: string,
    limit = 20
  ): Promise<BillingShadowReportRow[]> {
    const r = await this.db.query(
      `SELECT * FROM billing_shadow_reports
       WHERE subscription_id = $1::uuid
       ORDER BY created_at DESC
       LIMIT $2`,
      [subscriptionId, limit]
    );
    return r.rows.map((row) => mapRow(row as Record<string, unknown>));
  }

  async getAggregateStats(sinceDays = 7): Promise<{
    total: number;
    approved: number;
    failed: number;
    critical: number;
    average_score: number | null;
    last_execution: string | null;
  }> {
    const r = await this.db.query<{
      total: string;
      approved: string;
      failed: string;
      critical: string;
      average_score: string | null;
      last_execution: string | null;
    }>(
      `SELECT
         count(*)::text AS total,
         count(*) FILTER (WHERE approved = true)::text AS approved,
         count(*) FILTER (WHERE execution_failed = true)::text AS failed,
         count(*) FILTER (WHERE approved = false AND comparison_score < 50)::text AS critical,
         round(avg(comparison_score)::numeric, 2)::text AS average_score,
         max(created_at)::text AS last_execution
       FROM billing_shadow_reports
       WHERE created_at >= now() - ($1::text || ' days')::interval`,
      [String(sinceDays)]
    );
    const row = r.rows[0];
    return {
      total: parseInt(row?.total ?? '0', 10),
      approved: parseInt(row?.approved ?? '0', 10),
      failed: parseInt(row?.failed ?? '0', 10),
      critical: parseInt(row?.critical ?? '0', 10),
      average_score: row?.average_score != null ? Number(row.average_score) : null,
      last_execution: row?.last_execution,
    };
  }

  async purgeOlderThan(days: number): Promise<number> {
    const r = await this.db.query(
      `DELETE FROM billing_shadow_reports
       WHERE created_at < now() - ($1::text || ' days')::interval`,
      [String(days)]
    );
    return r.rowCount ?? 0;
  }
}

export const billingShadowReportRepository = new BillingShadowReportRepository();
