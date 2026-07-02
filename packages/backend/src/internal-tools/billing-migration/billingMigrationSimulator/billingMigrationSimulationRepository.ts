/**
 * Billing Engine V2 — Sprint 2.3F: persistência simulation reports.
 */
import type { Pool, PoolClient } from 'pg';
import { pool } from '../../../utils/db.js';
import type { BillingMigrationSimulationReport } from './types.js';

type Db = Pick<Pool, 'query'> | PoolClient;

export type BillingMigrationSimulationReportRow = {
  id: string;
  tenant_id: string;
  subscription_id: string | null;
  cycle_key: string | null;
  correlation_id: string | null;
  overall_score: number;
  recommendation: string;
  risk: string;
  rollback_safe: boolean;
  projection_hash: string | null;
  simulation_json: unknown;
  impact_json: unknown;
  duration_ms: number;
  generated_at: string;
};

function mapRow(row: Record<string, unknown>): BillingMigrationSimulationReportRow {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    subscription_id: row.subscription_id != null ? String(row.subscription_id) : null,
    cycle_key: row.cycle_key != null ? String(row.cycle_key) : null,
    correlation_id: row.correlation_id != null ? String(row.correlation_id) : null,
    overall_score: Number(row.overall_score),
    recommendation: String(row.recommendation),
    risk: String(row.risk),
    rollback_safe: Boolean(row.rollback_safe),
    projection_hash: row.projection_hash != null ? String(row.projection_hash) : null,
    simulation_json: row.simulation_json,
    impact_json: row.impact_json,
    duration_ms: Number(row.duration_ms),
    generated_at: String(row.generated_at),
  };
}

export class BillingMigrationSimulationRepository {
  constructor(private readonly db: Db = pool) {}

  async insert(report: BillingMigrationSimulationReport): Promise<BillingMigrationSimulationReportRow> {
    const firstSub = report.subscriptions[0];
    const projectionHash =
      firstSub?.projection.projectedInvoice.diagnostics.hash ?? null;
    const r = await this.db.query(
      `INSERT INTO billing_migration_simulation_reports (
         tenant_id, subscription_id, cycle_key, correlation_id,
         overall_score, recommendation, risk, rollback_safe, projection_hash,
         simulation_json, impact_json, duration_ms
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4,
         $5, $6, $7, $8, $9,
         $10::jsonb, $11::jsonb, $12
       )
       RETURNING *`,
      [
        report.tenant_id,
        firstSub?.subscription_id ?? null,
        firstSub?.cycle_key ?? null,
        report.correlation_id,
        report.overall_score,
        report.recommended,
        report.impact.risk,
        report.rollback_safe,
        projectionHash,
        JSON.stringify(report),
        JSON.stringify(report.impact),
        report.diagnostics.duration_ms,
      ]
    );
    return mapRow(r.rows[0] as Record<string, unknown>);
  }

  async findLatestByTenant(tenantId: string): Promise<BillingMigrationSimulationReportRow | null> {
    const r = await this.db.query(
      `SELECT * FROM billing_migration_simulation_reports
       WHERE tenant_id = $1::uuid
       ORDER BY generated_at DESC LIMIT 1`,
      [tenantId]
    );
    const row = r.rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async getDashboardStats(): Promise<{
    total_simulations: number;
    average_score: number | null;
    average_duration_ms: number | null;
    high_risk: number;
    critical: number;
    ready_to_migrate: number;
    blocked: number;
    last_simulation: string | null;
  }> {
    const r = await this.db.query<{
      total: string;
      avg_score: string | null;
      avg_duration: string | null;
      high_risk: string;
      critical: string;
      ready: string;
      blocked: string;
      last_simulation: string | null;
    }>(
      `SELECT
         count(*)::text AS total,
         round(avg(overall_score)::numeric, 2)::text AS avg_score,
         round(avg(duration_ms)::numeric, 2)::text AS avg_duration,
         count(*) FILTER (WHERE risk = 'HIGH')::text AS high_risk,
         count(*) FILTER (WHERE risk = 'CRITICAL')::text AS critical,
         count(*) FILTER (WHERE recommendation = 'READY_TO_MIGRATE')::text AS ready,
         count(*) FILTER (WHERE recommendation IN ('BLOCKED', 'DO_NOT_MIGRATE'))::text AS blocked,
         max(generated_at)::text AS last_simulation
       FROM (
         SELECT DISTINCT ON (tenant_id) *
         FROM billing_migration_simulation_reports
         ORDER BY tenant_id, generated_at DESC
       ) latest`
    );
    const row = r.rows[0];
    return {
      total_simulations: parseInt(row?.total ?? '0', 10),
      average_score: row?.avg_score != null ? Number(row.avg_score) : null,
      average_duration_ms: row?.avg_duration != null ? Number(row.avg_duration) : null,
      high_risk: parseInt(row?.high_risk ?? '0', 10),
      critical: parseInt(row?.critical ?? '0', 10),
      ready_to_migrate: parseInt(row?.ready ?? '0', 10),
      blocked: parseInt(row?.blocked ?? '0', 10),
      last_simulation: row?.last_simulation,
    };
  }

  async getRecentSimulations(limit = 10): Promise<
    Array<{
      tenant_id: string;
      score: number;
      recommendation: string;
      risk: string;
      generated_at: string;
    }>
  > {
    const r = await this.db.query(
      `SELECT tenant_id::text, overall_score, recommendation, risk, generated_at::text
       FROM billing_migration_simulation_reports
       ORDER BY generated_at DESC
       LIMIT $1`,
      [limit]
    );
    return r.rows.map((row) => ({
      tenant_id: String(row.tenant_id),
      score: Number(row.overall_score),
      recommendation: String(row.recommendation),
      risk: String(row.risk),
      generated_at: String(row.generated_at),
    }));
  }

  async purgeOlderThan(days: number): Promise<number> {
    const r = await this.db.query(
      `DELETE FROM billing_migration_simulation_reports
       WHERE generated_at < now() - ($1::text || ' days')::interval`,
      [String(days)]
    );
    return r.rowCount ?? 0;
  }
}

export const billingMigrationSimulationRepository = new BillingMigrationSimulationRepository();
