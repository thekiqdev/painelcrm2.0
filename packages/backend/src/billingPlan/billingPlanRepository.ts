/**
 * Billing Engine V2 — acesso a billing_plans (sem regra de negócio).
 */
import type { Pool, PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import { allocateBillingPlanNumber } from './billingPlanNumberGenerator.js';
import type {
  BillingPlanBillingStrategy,
  BillingPlanCreatedFrom,
  BillingPlanCreateInput,
  BillingPlanEngineVersion,
  BillingPlanRow,
  BillingPlanState,
  BillingPlanStatus,
  BillingPlanUpdateMetadataInput,
} from './types.js';
import { normalizeBillingDateFromDb } from '../billingRuntime/billingRuntimeAssertions.js';

function dbDateYmd(value: unknown): string {
  return normalizeBillingDateFromDb(value) ?? '';
}

type Db = Pick<Pool, 'query'> | PoolClient;

function mapRow(row: Record<string, unknown>): BillingPlanRow {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    subscription_id: String(row.subscription_id),
    plan_number: String(row.plan_number ?? 'BP-00000000'),
    status: String(row.status) as BillingPlanStatus,
    version: Number(row.version),
    plan_revision: Number(row.plan_revision ?? 1),
    plan_state: String(row.plan_state ?? 'draft') as BillingPlanState,
    created_from: String(row.created_from ?? 'subscription') as BillingPlanCreatedFrom,
    engine_version: String(row.engine_version ?? 'v2') as BillingPlanEngineVersion,
    billing_strategy: String(row.billing_strategy ?? 'billing_plan_items') as BillingPlanBillingStrategy,
    currency: String(row.currency),
    billing_interval: String(row.billing_interval),
    billing_frequency: Number(row.billing_frequency),
    billing_anchor: row.billing_anchor != null ? Number(row.billing_anchor) : null,
    starts_at: dbDateYmd(row.starts_at),
    ends_at: row.ends_at != null ? dbDateYmd(row.ends_at) : null,
    trial_until: row.trial_until != null ? dbDateYmd(row.trial_until) : null,
    next_generation_at:
      row.next_generation_at != null ? String(row.next_generation_at) : null,
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export class BillingPlanRepository {
  constructor(private readonly db: Db = pool) {}

  async create(input: BillingPlanCreateInput): Promise<BillingPlanRow> {
    const planNumber = input.plan_number ?? (await allocateBillingPlanNumber(this.db));
    const r = await this.db.query(
      `INSERT INTO billing_plans (
         tenant_id, subscription_id, plan_number, status, version,
         plan_revision, plan_state, created_from, engine_version, billing_strategy,
         currency, billing_interval, billing_frequency, billing_anchor,
         starts_at, ends_at, trial_until, next_generation_at, metadata
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4, $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13, $14,
         $15::date, $16::date, $17::date, $18::timestamptz, $19::jsonb
       )
       RETURNING *`,
      [
        input.tenant_id,
        input.subscription_id,
        planNumber,
        input.status,
        input.version,
        input.plan_revision ?? 1,
        input.plan_state ?? 'draft',
        input.created_from ?? 'subscription',
        input.engine_version ?? 'v2',
        input.billing_strategy ?? 'billing_plan_items',
        input.currency,
        input.billing_interval,
        input.billing_frequency,
        input.billing_anchor,
        input.starts_at,
        input.ends_at,
        input.trial_until,
        input.next_generation_at,
        JSON.stringify(input.metadata ?? {}),
      ]
    );
    return mapRow(r.rows[0] as Record<string, unknown>);
  }

  async findById(id: string, tenantId: string): Promise<BillingPlanRow | null> {
    const r = await this.db.query(
      `SELECT * FROM billing_plans WHERE id = $1::uuid AND tenant_id = $2::uuid LIMIT 1`,
      [id, tenantId]
    );
    const row = r.rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async findByPlanNumber(
    planNumber: string,
    tenantId: string
  ): Promise<BillingPlanRow | null> {
    const r = await this.db.query(
      `SELECT * FROM billing_plans
       WHERE plan_number = $1 AND tenant_id = $2::uuid
       LIMIT 1`,
      [planNumber, tenantId]
    );
    const row = r.rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async findActiveBySubscription(
    subscriptionId: string,
    tenantId: string
  ): Promise<BillingPlanRow | null> {
    const r = await this.db.query(
      `SELECT * FROM billing_plans
       WHERE subscription_id = $1::uuid AND tenant_id = $2::uuid AND status = 'active'
       LIMIT 1`,
      [subscriptionId, tenantId]
    );
    const row = r.rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async findVersions(
    subscriptionId: string,
    tenantId: string
  ): Promise<BillingPlanRow[]> {
    const r = await this.db.query(
      `SELECT * FROM billing_plans
       WHERE subscription_id = $1::uuid AND tenant_id = $2::uuid
       ORDER BY version DESC, plan_revision DESC`,
      [subscriptionId, tenantId]
    );
    return r.rows.map((row) => mapRow(row as Record<string, unknown>));
  }

  async findLatestVersion(
    subscriptionId: string,
    tenantId: string
  ): Promise<BillingPlanRow | null> {
    const r = await this.db.query(
      `SELECT * FROM billing_plans
       WHERE subscription_id = $1::uuid AND tenant_id = $2::uuid
       ORDER BY version DESC, plan_revision DESC
       LIMIT 1`,
      [subscriptionId, tenantId]
    );
    const row = r.rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async findLatestRevision(
    subscriptionId: string,
    tenantId: string,
    version: number
  ): Promise<BillingPlanRow | null> {
    const r = await this.db.query(
      `SELECT * FROM billing_plans
       WHERE subscription_id = $1::uuid AND tenant_id = $2::uuid AND version = $3
       ORDER BY plan_revision DESC
       LIMIT 1`,
      [subscriptionId, tenantId, version]
    );
    const row = r.rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async existsPlanNumber(planNumber: string): Promise<boolean> {
    const r = await this.db.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM billing_plans WHERE plan_number = $1`,
      [planNumber]
    );
    return parseInt(r.rows[0]?.c ?? '0', 10) > 0;
  }

  async archive(id: string, tenantId: string): Promise<BillingPlanRow | null> {
    const r = await this.db.query(
      `UPDATE billing_plans
       SET status = 'archived', updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid
       RETURNING *`,
      [id, tenantId]
    );
    const row = r.rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async activate(id: string, tenantId: string): Promise<BillingPlanRow | null> {
    const r = await this.db.query(
      `UPDATE billing_plans
       SET status = 'active', updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid
       RETURNING *`,
      [id, tenantId]
    );
    const row = r.rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async archiveActiveForSubscription(
    subscriptionId: string,
    tenantId: string
  ): Promise<number> {
    const r = await this.db.query(
      `UPDATE billing_plans
       SET status = 'archived', updated_at = now()
       WHERE subscription_id = $1::uuid AND tenant_id = $2::uuid AND status = 'active'`,
      [subscriptionId, tenantId]
    );
    return r.rowCount ?? 0;
  }

  async updateMetadata(input: BillingPlanUpdateMetadataInput): Promise<BillingPlanRow | null> {
    const r = await this.db.query(
      `UPDATE billing_plans
       SET metadata = $3::jsonb, updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid
       RETURNING *`,
      [input.id, input.tenant_id, JSON.stringify(input.metadata)]
    );
    const row = r.rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  }
}

export const billingPlanRepository = new BillingPlanRepository();
