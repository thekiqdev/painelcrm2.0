/**
 * M5-W Sprint 1 — CRUD partner_wholesale_plans (Super Admin).
 */

import { pool } from '../utils/db.js';
import { PartnerAdminError } from './partnerErrors.js';
import { logSuperAdminAction } from '../services/auditLogService.js';

export type WholesalePlanStatus = 'draft' | 'active' | 'archived';
export type WholesaleBillingInterval = 'monthly' | 'quarterly' | 'semi_annual' | 'yearly';

export type PartnerWholesalePlan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: WholesalePlanStatus;
  seats_included: number;
  price_cents: number;
  billing_interval: WholesaleBillingInterval;
  envelope_plan_id: string | null;
  unit_overage_cents: number | null;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  envelope_plan_name?: string | null;
};

export type UpsertWholesalePlanInput = {
  name: string;
  slug: string;
  description?: string | null;
  status?: WholesalePlanStatus;
  seats_included: number;
  price_cents: number;
  billing_interval?: WholesaleBillingInterval;
  envelope_plan_id?: string | null;
  unit_overage_cents?: number | null;
  sort_order?: number;
  metadata?: Record<string, unknown>;
};

function normalizeSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '');
}

function mapRow(r: Record<string, unknown>): PartnerWholesalePlan {
  return {
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
    description: (r.description as string | null) ?? null,
    status: r.status as WholesalePlanStatus,
    seats_included: Number(r.seats_included),
    price_cents: Number(r.price_cents),
    billing_interval: r.billing_interval as WholesaleBillingInterval,
    envelope_plan_id: (r.envelope_plan_id as string | null) ?? null,
    unit_overage_cents:
      r.unit_overage_cents == null ? null : Number(r.unit_overage_cents),
    sort_order: Number(r.sort_order ?? 0),
    metadata:
      r.metadata && typeof r.metadata === 'object'
        ? (r.metadata as Record<string, unknown>)
        : {},
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    envelope_plan_name: (r.envelope_plan_name as string | null | undefined) ?? null,
  };
}

export async function listWholesalePlans(opts?: {
  includeArchived?: boolean;
}): Promise<PartnerWholesalePlan[]> {
  const includeArchived = opts?.includeArchived === true;
  const r = await pool.query(
    `SELECT w.*, p.name AS envelope_plan_name
     FROM partner_wholesale_plans w
     LEFT JOIN plans p ON p.id = w.envelope_plan_id
     WHERE ($1::boolean OR w.status <> 'archived')
     ORDER BY w.sort_order ASC, w.name ASC`,
    [includeArchived]
  );
  return r.rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function getWholesalePlan(id: string): Promise<PartnerWholesalePlan | null> {
  const r = await pool.query(
    `SELECT w.*, p.name AS envelope_plan_name
     FROM partner_wholesale_plans w
     LEFT JOIN plans p ON p.id = w.envelope_plan_id
     WHERE w.id = $1`,
    [id]
  );
  if (!r.rows[0]) return null;
  return mapRow(r.rows[0] as Record<string, unknown>);
}

async function assertEnvelopePlan(envelopePlanId: string | null | undefined): Promise<void> {
  if (!envelopePlanId) return;
  const r = await pool.query(`SELECT id FROM plans WHERE id = $1`, [envelopePlanId]);
  if (r.rows.length === 0) {
    throw new PartnerAdminError('Plano envelope não encontrado', 'ENVELOPE_PLAN_NOT_FOUND');
  }
}

export async function createWholesalePlan(
  input: UpsertWholesalePlanInput,
  actorUserId: string | null
): Promise<PartnerWholesalePlan> {
  const name = input.name.trim();
  const slug = normalizeSlug(input.slug);
  if (!name) throw new PartnerAdminError('Nome é obrigatório', 'NAME_REQUIRED');
  if (!slug) throw new PartnerAdminError('Slug inválido', 'SLUG_INVALID');

  const seats = Math.floor(input.seats_included);
  const price = Math.floor(input.price_cents);
  if (!Number.isFinite(seats) || seats < 0) {
    throw new PartnerAdminError('seats_included inválido', 'SEATS_INVALID');
  }
  if (!Number.isFinite(price) || price < 0) {
    throw new PartnerAdminError('price_cents inválido', 'PRICE_INVALID');
  }

  const status = input.status ?? 'draft';
  const interval = input.billing_interval ?? 'monthly';
  const overage =
    input.unit_overage_cents == null || input.unit_overage_cents === undefined
      ? null
      : Math.floor(input.unit_overage_cents);
  if (overage != null && (overage < 0 || !Number.isFinite(overage))) {
    throw new PartnerAdminError('unit_overage_cents inválido', 'OVERAGE_INVALID');
  }

  await assertEnvelopePlan(input.envelope_plan_id);

  try {
    const r = await pool.query(
      `INSERT INTO partner_wholesale_plans (
         name, slug, description, status, seats_included, price_cents,
         billing_interval, envelope_plan_id, unit_overage_cents, sort_order, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
       RETURNING *`,
      [
        name,
        slug,
        input.description?.trim() || null,
        status,
        seats,
        price,
        interval,
        input.envelope_plan_id || null,
        overage,
        Math.floor(input.sort_order ?? 0),
        JSON.stringify(input.metadata ?? {}),
      ]
    );
    const created = mapRow(r.rows[0] as Record<string, unknown>);
    if (actorUserId) {
      await logSuperAdminAction(actorUserId, 'partner_wholesale_plan.created', 'partner_wholesale_plan', created.id, {
        slug,
        seats_included: seats,
        price_cents: price,
      });
    }
    return (await getWholesalePlan(created.id))!;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === '23505') {
      throw new PartnerAdminError('Slug já em uso', 'SLUG_TAKEN', 409);
    }
    throw err;
  }
}

export async function updateWholesalePlan(
  id: string,
  input: Partial<UpsertWholesalePlanInput> & { status?: WholesalePlanStatus },
  actorUserId: string | null
): Promise<PartnerWholesalePlan> {
  const existing = await getWholesalePlan(id);
  if (!existing) throw new PartnerAdminError('Plano atacado não encontrado', 'NOT_FOUND', 404);

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  const slug =
    input.slug !== undefined ? normalizeSlug(input.slug) : existing.slug;
  if (!name) throw new PartnerAdminError('Nome é obrigatório', 'NAME_REQUIRED');
  if (!slug) throw new PartnerAdminError('Slug inválido', 'SLUG_INVALID');

  const seats =
    input.seats_included !== undefined
      ? Math.floor(input.seats_included)
      : existing.seats_included;
  const price =
    input.price_cents !== undefined ? Math.floor(input.price_cents) : existing.price_cents;
  if (!Number.isFinite(seats) || seats < 0) {
    throw new PartnerAdminError('seats_included inválido', 'SEATS_INVALID');
  }
  if (!Number.isFinite(price) || price < 0) {
    throw new PartnerAdminError('price_cents inválido', 'PRICE_INVALID');
  }

  const envelopeId =
    input.envelope_plan_id !== undefined
      ? input.envelope_plan_id
      : existing.envelope_plan_id;
  await assertEnvelopePlan(envelopeId);

  let overage = existing.unit_overage_cents;
  if (input.unit_overage_cents !== undefined) {
    overage =
      input.unit_overage_cents == null ? null : Math.floor(input.unit_overage_cents);
    if (overage != null && (overage < 0 || !Number.isFinite(overage))) {
      throw new PartnerAdminError('unit_overage_cents inválido', 'OVERAGE_INVALID');
    }
  }

  try {
    await pool.query(
      `UPDATE partner_wholesale_plans SET
         name = $2,
         slug = $3,
         description = $4,
         status = $5,
         seats_included = $6,
         price_cents = $7,
         billing_interval = $8,
         envelope_plan_id = $9,
         unit_overage_cents = $10,
         sort_order = $11,
         metadata = COALESCE($12::jsonb, metadata),
         updated_at = now()
       WHERE id = $1`,
      [
        id,
        name,
        slug,
        input.description !== undefined
          ? input.description?.trim() || null
          : existing.description,
        input.status ?? existing.status,
        seats,
        price,
        input.billing_interval ?? existing.billing_interval,
        envelopeId || null,
        overage,
        input.sort_order !== undefined
          ? Math.floor(input.sort_order)
          : existing.sort_order,
        input.metadata !== undefined ? JSON.stringify(input.metadata) : null,
      ]
    );
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === '23505') {
      throw new PartnerAdminError('Slug já em uso', 'SLUG_TAKEN', 409);
    }
    throw err;
  }

  if (actorUserId) {
    await logSuperAdminAction(actorUserId, 'partner_wholesale_plan.updated', 'partner_wholesale_plan', id, {
      ...input,
    });
  }
  return (await getWholesalePlan(id))!;
}

/** Soft-delete: arquiva o plano (não remove histórico). */
export async function archiveWholesalePlan(
  id: string,
  actorUserId: string | null
): Promise<PartnerWholesalePlan> {
  return updateWholesalePlan(id, { status: 'archived' }, actorUserId);
}
