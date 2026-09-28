/**
 * Billing Engine V2 — persistência billing_plan_items (sem regra de negócio).
 */
import type { Pool, PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import type {
  BillingPlanItemCreateInput,
  BillingPlanItemRow,
  BillingPlanItemStatus,
  BillingPlanItemUpdateInput,
} from './types.js';
import { normalizeBillingDateFromDb } from '../billingRuntime/billingRuntimeAssertions.js';

function dbDateYmd(value: unknown): string {
  return normalizeBillingDateFromDb(value) ?? '';
}

type Db = Pick<Pool, 'query'> | PoolClient;

function mapRow(row: Record<string, unknown>): BillingPlanItemRow {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    billing_plan_id: String(row.billing_plan_id),
    sequence: Number(row.sequence),
    status: String(row.status) as BillingPlanItemRow['status'],
    item_type: String(row.item_type) as BillingPlanItemRow['item_type'],
    origin: String(row.origin) as BillingPlanItemRow['origin'],
    name: String(row.name),
    description: row.description != null ? String(row.description) : null,
    quantity: Number(row.quantity),
    unit_price: Number(row.unit_price),
    discount_type:
      row.discount_type != null
        ? (String(row.discount_type) as BillingPlanItemRow['discount_type'])
        : null,
    discount_value: Number(row.discount_value ?? 0),
    tax_rate: row.tax_rate != null ? Number(row.tax_rate) : null,
    tax_value: Number(row.tax_value ?? 0),
    total_amount: Number(row.total_amount),
    currency: String(row.currency),
    is_recurring: Boolean(row.is_recurring),
    billing_interval: row.billing_interval != null ? String(row.billing_interval) : null,
    billing_frequency: Number(row.billing_frequency ?? 1),
    billing_anchor: row.billing_anchor != null ? Number(row.billing_anchor) : null,
    proration_mode:
      row.proration_mode != null
        ? (String(row.proration_mode) as BillingPlanItemRow['proration_mode'])
        : null,
    starts_at: row.starts_at != null ? dbDateYmd(row.starts_at) : null,
    ends_at: row.ends_at != null ? dbDateYmd(row.ends_at) : null,
    trial_until: row.trial_until != null ? dbDateYmd(row.trial_until) : null,
    definition_hash: String(row.definition_hash ?? ''),
    item_revision: Number(row.item_revision ?? 1),
    effective_from: dbDateYmd(row.effective_from),
    effective_until: row.effective_until != null ? dbDateYmd(row.effective_until) : null,
    created_from_revision:
      row.created_from_revision != null ? Number(row.created_from_revision) : null,
    superseded_by_revision:
      row.superseded_by_revision != null ? Number(row.superseded_by_revision) : null,
    snapshot_strategy: String(
      row.snapshot_strategy ?? 'invoice_snapshot'
    ) as BillingPlanItemRow['snapshot_strategy'],
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

const INSERT_COLS = `tenant_id, billing_plan_id, sequence, status, item_type, origin,
  name, description, quantity, unit_price, discount_type, discount_value,
  tax_rate, tax_value, total_amount, currency, is_recurring, billing_interval,
  billing_frequency, billing_anchor, proration_mode, starts_at, ends_at, trial_until,
  definition_hash, item_revision, effective_from, effective_until,
  created_from_revision, superseded_by_revision, snapshot_strategy, metadata`;

function bindCreate(input: BillingPlanItemCreateInput): unknown[] {
  return [
    input.tenant_id,
    input.billing_plan_id,
    input.sequence,
    input.status ?? 'draft',
    input.item_type ?? 'service',
    input.origin ?? 'subscription',
    input.name,
    input.description ?? null,
    input.quantity ?? 1,
    input.unit_price,
    input.discount_type ?? 'none',
    input.discount_value ?? 0,
    input.tax_rate ?? null,
    input.tax_value ?? 0,
    input.total_amount,
    input.currency,
    input.is_recurring ?? true,
    input.billing_interval ?? null,
    input.billing_frequency ?? 1,
    input.billing_anchor ?? null,
    input.proration_mode ?? 'none',
    input.starts_at ?? null,
    input.ends_at ?? null,
    input.trial_until ?? null,
    input.definition_hash ?? '',
    input.item_revision ?? 1,
    input.effective_from ?? input.starts_at ?? new Date().toISOString().slice(0, 10),
    input.effective_until ?? null,
    input.created_from_revision ?? null,
    input.superseded_by_revision ?? null,
    input.snapshot_strategy ?? 'invoice_snapshot',
    JSON.stringify(input.metadata ?? {}),
  ];
}

export class BillingPlanItemRepository {
  constructor(private readonly db: Db = pool) {}

  async create(input: BillingPlanItemCreateInput): Promise<BillingPlanItemRow> {
    const r = await this.db.query(
      `INSERT INTO billing_plan_items (${INSERT_COLS})
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22::date, $23::date, $24::date, $25, $26, $27::date, $28::date, $29, $30, $31, $32::jsonb)
       RETURNING *`,
      bindCreate(input)
    );
    return mapRow(r.rows[0] as Record<string, unknown>);
  }

  async createMany(inputs: BillingPlanItemCreateInput[]): Promise<BillingPlanItemRow[]> {
    const rows: BillingPlanItemRow[] = [];
    for (const input of inputs) {
      rows.push(await this.create(input));
    }
    return rows;
  }

  async update(input: BillingPlanItemUpdateInput): Promise<BillingPlanItemRow | null> {
    const sets: string[] = [];
    const binds: unknown[] = [input.id, input.tenant_id];
    let i = 3;
    const add = (col: string, val: unknown) => {
      sets.push(`${col} = $${i}`);
      binds.push(val);
      i += 1;
    };
    if (input.name !== undefined) add('name', input.name);
    if (input.description !== undefined) add('description', input.description);
    if (input.quantity !== undefined) add('quantity', input.quantity);
    if (input.unit_price !== undefined) add('unit_price', input.unit_price);
    if (input.discount_type !== undefined) add('discount_type', input.discount_type);
    if (input.discount_value !== undefined) add('discount_value', input.discount_value);
    if (input.tax_rate !== undefined) add('tax_rate', input.tax_rate);
    if (input.tax_value !== undefined) add('tax_value', input.tax_value);
    if (input.total_amount !== undefined) add('total_amount', input.total_amount);
    if (input.billing_interval !== undefined) add('billing_interval', input.billing_interval);
    if (input.billing_frequency !== undefined) add('billing_frequency', input.billing_frequency);
    if (input.billing_anchor !== undefined) add('billing_anchor', input.billing_anchor);
    if (input.proration_mode !== undefined) add('proration_mode', input.proration_mode);
    if (input.starts_at !== undefined) add('starts_at', input.starts_at);
    if (input.ends_at !== undefined) add('ends_at', input.ends_at);
    if (input.trial_until !== undefined) add('trial_until', input.trial_until);
    if (input.definition_hash !== undefined) add('definition_hash', input.definition_hash);
    if (input.item_revision !== undefined) add('item_revision', input.item_revision);
    if (input.effective_from !== undefined) add('effective_from', input.effective_from);
    if (input.effective_until !== undefined) add('effective_until', input.effective_until);
    if (input.created_from_revision !== undefined)
      add('created_from_revision', input.created_from_revision);
    if (input.superseded_by_revision !== undefined)
      add('superseded_by_revision', input.superseded_by_revision);
    if (input.snapshot_strategy !== undefined) add('snapshot_strategy', input.snapshot_strategy);
    if (input.metadata !== undefined) add('metadata', JSON.stringify(input.metadata));
    if (sets.length === 0) return this.findById(input.id, input.tenant_id);
    sets.push('updated_at = now()');
    const r = await this.db.query(
      `UPDATE billing_plan_items SET ${sets.join(', ')}
       WHERE id = $1::uuid AND tenant_id = $2::uuid
       RETURNING *`,
      binds
    );
    const row = r.rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const r = await this.db.query(
      `DELETE FROM billing_plan_items WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [id, tenantId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async archive(id: string, tenantId: string): Promise<BillingPlanItemRow | null> {
    const r = await this.db.query(
      `UPDATE billing_plan_items SET status = 'archived', updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid
       RETURNING *`,
      [id, tenantId]
    );
    const row = r.rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async setStatus(
    id: string,
    tenantId: string,
    status: BillingPlanItemStatus
  ): Promise<BillingPlanItemRow | null> {
    const r = await this.db.query(
      `UPDATE billing_plan_items SET status = $3, updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid
       RETURNING *`,
      [id, tenantId, status]
    );
    const row = r.rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async findById(id: string, tenantId: string): Promise<BillingPlanItemRow | null> {
    const r = await this.db.query(
      `SELECT * FROM billing_plan_items WHERE id = $1::uuid AND tenant_id = $2::uuid LIMIT 1`,
      [id, tenantId]
    );
    const row = r.rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async findByBillingPlan(
    billingPlanId: string,
    tenantId: string
  ): Promise<BillingPlanItemRow[]> {
    const r = await this.db.query(
      `SELECT * FROM billing_plan_items
       WHERE billing_plan_id = $1::uuid AND tenant_id = $2::uuid
       ORDER BY sequence ASC, item_revision ASC`,
      [billingPlanId, tenantId]
    );
    return r.rows.map((row) => mapRow(row as Record<string, unknown>));
  }

  async findActive(billingPlanId: string, tenantId: string): Promise<BillingPlanItemRow[]> {
    const r = await this.db.query(
      `SELECT * FROM billing_plan_items
       WHERE billing_plan_id = $1::uuid AND tenant_id = $2::uuid AND status = 'active'
       ORDER BY sequence ASC, item_revision ASC`,
      [billingPlanId, tenantId]
    );
    return r.rows.map((row) => mapRow(row as Record<string, unknown>));
  }

  async findRecurring(billingPlanId: string, tenantId: string): Promise<BillingPlanItemRow[]> {
    const r = await this.db.query(
      `SELECT * FROM billing_plan_items
       WHERE billing_plan_id = $1::uuid AND tenant_id = $2::uuid AND is_recurring = true
       ORDER BY sequence ASC, item_revision ASC`,
      [billingPlanId, tenantId]
    );
    return r.rows.map((row) => mapRow(row as Record<string, unknown>));
  }

  async findRevision(
    billingPlanId: string,
    sequence: number,
    itemRevision: number,
    tenantId: string
  ): Promise<BillingPlanItemRow | null> {
    const r = await this.db.query(
      `SELECT * FROM billing_plan_items
       WHERE billing_plan_id = $1::uuid AND sequence = $2 AND item_revision = $3
         AND tenant_id = $4::uuid
       LIMIT 1`,
      [billingPlanId, sequence, itemRevision, tenantId]
    );
    const row = r.rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async findEffective(
    billingPlanId: string,
    tenantId: string,
    asOf: string = new Date().toISOString().slice(0, 10)
  ): Promise<BillingPlanItemRow[]> {
    const r = await this.db.query(
      `SELECT * FROM billing_plan_items
       WHERE billing_plan_id = $1::uuid AND tenant_id = $2::uuid
         AND effective_from <= $3::date
         AND (effective_until IS NULL OR effective_until > $3::date)
       ORDER BY sequence ASC, item_revision ASC`,
      [billingPlanId, tenantId, asOf]
    );
    return r.rows.map((row) => mapRow(row as Record<string, unknown>));
  }

  async findCurrent(
    billingPlanId: string,
    sequence: number,
    tenantId: string
  ): Promise<BillingPlanItemRow | null> {
    const r = await this.db.query(
      `SELECT * FROM billing_plan_items
       WHERE billing_plan_id = $1::uuid AND sequence = $2 AND tenant_id = $3::uuid
       ORDER BY item_revision DESC
       LIMIT 1`,
      [billingPlanId, sequence, tenantId]
    );
    const row = r.rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async findHistory(
    billingPlanId: string,
    sequence: number,
    tenantId: string
  ): Promise<BillingPlanItemRow[]> {
    const r = await this.db.query(
      `SELECT * FROM billing_plan_items
       WHERE billing_plan_id = $1::uuid AND sequence = $2 AND tenant_id = $3::uuid
       ORDER BY item_revision ASC`,
      [billingPlanId, sequence, tenantId]
    );
    return r.rows.map((row) => mapRow(row as Record<string, unknown>));
  }

  async findByDefinitionHash(
    billingPlanId: string,
    definitionHash: string,
    tenantId: string
  ): Promise<BillingPlanItemRow[]> {
    const r = await this.db.query(
      `SELECT * FROM billing_plan_items
       WHERE billing_plan_id = $1::uuid AND definition_hash = $2 AND tenant_id = $3::uuid
       ORDER BY sequence ASC, item_revision ASC`,
      [billingPlanId, definitionHash, tenantId]
    );
    return r.rows.map((row) => mapRow(row as Record<string, unknown>));
  }

  async duplicateRevision(
    sourceItemId: string,
    tenantId: string,
    overrides: Partial<BillingPlanItemCreateInput> = {}
  ): Promise<BillingPlanItemRow> {
    const source = await this.findById(sourceItemId, tenantId);
    if (!source) throw new Error('billing_plan_item_not_found');
    const current = await this.findCurrent(source.billing_plan_id, source.sequence, tenantId);
    const nextRevision = (current?.item_revision ?? source.item_revision) + 1;
    return this.create({
      tenant_id: tenantId,
      billing_plan_id: source.billing_plan_id,
      sequence: source.sequence,
      status: 'draft',
      item_type: source.item_type,
      origin: source.origin,
      name: source.name,
      description: source.description,
      quantity: source.quantity,
      unit_price: source.unit_price,
      discount_type: source.discount_type,
      discount_value: source.discount_value,
      tax_rate: source.tax_rate,
      tax_value: source.tax_value,
      total_amount: source.total_amount,
      currency: source.currency,
      is_recurring: source.is_recurring,
      billing_interval: source.billing_interval,
      billing_frequency: source.billing_frequency,
      billing_anchor: source.billing_anchor,
      proration_mode: source.proration_mode,
      starts_at: source.starts_at,
      ends_at: source.ends_at,
      trial_until: source.trial_until,
      definition_hash: source.definition_hash,
      item_revision: nextRevision,
      effective_from: source.effective_from,
      effective_until: source.effective_until,
      created_from_revision: source.item_revision,
      superseded_by_revision: null,
      snapshot_strategy: source.snapshot_strategy,
      metadata: {
        ...source.metadata,
        duplicated_from_item_id: source.id,
        duplicated_from_revision: source.item_revision,
      },
      ...overrides,
    });
  }

  async duplicateItems(
    sourcePlanId: string,
    targetPlanId: string,
    tenantId: string
  ): Promise<BillingPlanItemRow[]> {
    const source = await this.findByBillingPlan(sourcePlanId, tenantId);
    const latestBySequence = new Map<number, BillingPlanItemRow>();
    for (const item of source) {
      const prev = latestBySequence.get(item.sequence);
      if (!prev || item.item_revision > prev.item_revision) {
        latestBySequence.set(item.sequence, item);
      }
    }
    const inputs: BillingPlanItemCreateInput[] = [...latestBySequence.values()].map((item) => ({
      tenant_id: tenantId,
      billing_plan_id: targetPlanId,
      sequence: item.sequence,
      status: 'draft',
      item_type: item.item_type,
      origin: item.origin,
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount_type: item.discount_type,
      discount_value: item.discount_value,
      tax_rate: item.tax_rate,
      tax_value: item.tax_value,
      total_amount: item.total_amount,
      currency: item.currency,
      is_recurring: item.is_recurring,
      billing_interval: item.billing_interval,
      billing_frequency: item.billing_frequency,
      billing_anchor: item.billing_anchor,
      proration_mode: item.proration_mode,
      starts_at: item.starts_at,
      ends_at: item.ends_at,
      trial_until: item.trial_until,
      definition_hash: item.definition_hash,
      item_revision: 1,
      effective_from: item.effective_from,
      effective_until: item.effective_until,
      created_from_revision: null,
      superseded_by_revision: null,
      snapshot_strategy: item.snapshot_strategy,
      metadata: {
        ...item.metadata,
        duplicated_from_item_id: item.id,
        duplicated_from_plan_id: sourcePlanId,
      },
    }));
    return this.createMany(inputs);
  }

  async exists(id: string, tenantId: string): Promise<boolean> {
    const r = await this.db.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM billing_plan_items
       WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [id, tenantId]
    );
    return parseInt(r.rows[0]?.c ?? '0', 10) > 0;
  }
}

export const billingPlanItemRepository = new BillingPlanItemRepository();
