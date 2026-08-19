/**
 * M5 Partner — superadmin create/patch (S1).
 */

import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import { createTenantAdminUser } from '../services/tenantAdminService.js';
import { logSuperAdminAction } from '../services/auditLogService.js';
import {
  getPartnerDetail,
  resolveDefaultPlanId,
  slugExists,
} from './partnerRepository.js';
import type {
  CreatePartnerInput,
  PartnerDetail,
  PatchPartnerInput,
} from './partnerTypes.js';

export class PartnerAdminError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 400
  ) {
    super(message);
    this.name = 'PartnerAdminError';
  }
}

function normalizeSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function createPartner(
  input: CreatePartnerInput,
  actorUserId: string | null
): Promise<PartnerDetail> {
  const name = input.name.trim();
  const slug = normalizeSlug(input.slug);
  if (!name) throw new PartnerAdminError('Nome é obrigatório', 'NAME_REQUIRED');
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw new PartnerAdminError('Slug inválido', 'SLUG_INVALID');
  }
  if (await slugExists(slug)) {
    throw new PartnerAdminError('Slug já em uso', 'SLUG_TAKEN', 409);
  }

  const programType = input.program_type ?? 'license_pool';
  if (programType !== 'license_pool' && programType !== 'revenue_share') {
    throw new PartnerAdminError('program_type inválido', 'PROGRAM_INVALID');
  }
  if (programType !== 'license_pool') {
    throw new PartnerAdminError(
      'MVP S1 aceita apenas program_type=license_pool',
      'PROGRAM_MVP_ONLY'
    );
  }

  const purchasedSeats = Math.floor(input.purchased_seats);
  if (!Number.isFinite(purchasedSeats) || purchasedSeats < 1) {
    throw new PartnerAdminError('purchased_seats deve ser >= 1', 'SEATS_INVALID');
  }
  const floorPrice = Math.floor(input.floor_price_cents);
  const unitCost = Math.floor(input.unit_cost_cents);
  if (!Number.isFinite(floorPrice) || floorPrice < 0) {
    throw new PartnerAdminError('floor_price_cents inválido', 'FLOOR_INVALID');
  }
  if (!Number.isFinite(unitCost) || unitCost < 0) {
    throw new PartnerAdminError('unit_cost_cents inválido', 'UNIT_COST_INVALID');
  }

  const publicName = (input.public_name || name).trim();
  const productName = (input.product_name || publicName).trim();
  const adminEmail = input.admin_email.trim();
  if (!adminEmail) throw new PartnerAdminError('admin_email é obrigatório', 'ADMIN_EMAIL_REQUIRED');

  let planId = input.plan_id?.trim() || null;
  if (!planId) {
    planId = await resolveDefaultPlanId();
  }
  if (!planId) {
    throw new PartnerAdminError('Nenhum plano disponível para vincular ao Partner', 'PLAN_REQUIRED', 500);
  }

  const planCheck = await pool.query(`SELECT id FROM plans WHERE id = $1`, [planId]);
  if (planCheck.rows.length === 0) {
    throw new PartnerAdminError('Plano não encontrado', 'PLAN_NOT_FOUND');
  }

  const client = await pool.connect();
  let partnerId: string;
  try {
    await client.query('BEGIN');

    const tenantIns = await client.query<{ id: string }>(
      `INSERT INTO tenants (
         name, slug, domain, plan_id, status, created_via, account_type, partner_id,
         onboarding_completed
       ) VALUES ($1, $2, $3, $4, 'active', 'superadmin', 'partner', NULL, true)
       RETURNING id`,
      [name, slug, input.domain?.trim() || null, planId]
    );
    partnerId = tenantIns.rows[0].id;

    await client.query(
      `INSERT INTO tenant_plan (tenant_id, plan_id, starts_at) VALUES ($1, $2, now())`,
      [partnerId, planId]
    );

    const programConfig = {
      floor_price_cents: floorPrice,
      unit_cost_cents: unitCost,
      min_seats: purchasedSeats,
    };

    await client.query(
      `INSERT INTO partner_profiles (
         partner_tenant_id, program_type, program_config_json,
         public_name, product_name, status
       ) VALUES ($1, $2, $3::jsonb, $4, $5, 'active')`,
      [partnerId, programType, JSON.stringify(programConfig), publicName, productName]
    );

    await client.query(
      `INSERT INTO partner_license_pool (
         partner_tenant_id, purchased_seats, unit_cost_cents, used_seats_cache
       ) VALUES ($1, $2, $3, 0)`,
      [partnerId, purchasedSeats, unitCost]
    );

    const { userId } = await createTenantAdminUser(
      {
        tenantId: partnerId,
        tenantName: name,
        email: adminEmail,
        responsibleName: input.admin_name?.trim() || undefined,
        password: input.admin_password,
      },
      { db: client }
    );

    await client.query(
      `INSERT INTO partner_memberships (partner_tenant_id, user_id, role, status)
       VALUES ($1, $2, 'partner_admin', 'active')`,
      [partnerId, userId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    const code = (err as { code?: string })?.code;
    if (code === 'EMAIL_GLOBAL_DUPLICATE' || (err as Error)?.message === 'EMAIL_ALREADY_REGISTERED_OTHER_TENANT') {
      throw new PartnerAdminError(
        'E-mail do admin já registrado em outra conta',
        'ADMIN_EMAIL_TAKEN',
        409
      );
    }
    if (code === '23505') {
      throw new PartnerAdminError('Conflito de unicidade (slug ou e-mail)', 'CONFLICT', 409);
    }
    throw err;
  } finally {
    client.release();
  }

  if (actorUserId) {
    await logSuperAdminAction(actorUserId, 'partner.created', 'tenant', partnerId, {
      name,
      slug,
      program_type: programType,
      purchased_seats: purchasedSeats,
    });
  }

  const detail = await getPartnerDetail(partnerId);
  if (!detail) throw new PartnerAdminError('Partner criado mas não encontrado', 'NOT_FOUND', 500);
  return detail;
}

export async function patchPartner(
  partnerTenantId: string,
  input: PatchPartnerInput,
  actorUserId: string | null
): Promise<PartnerDetail> {
  const existing = await getPartnerDetail(partnerTenantId);
  if (!existing) {
    throw new PartnerAdminError('Partner não encontrado', 'NOT_FOUND', 404);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (input.status !== undefined) {
      await client.query(`UPDATE tenants SET status = $1, updated_at = now() WHERE id = $2`, [
        input.status,
        partnerTenantId,
      ]);
    }

    const profilePatch: string[] = [];
    const profileVals: unknown[] = [];
    let p = 1;

    if (input.partner_status !== undefined) {
      if (input.partner_status === 'suspended') {
        throw new PartnerAdminError(
          'Use POST /api/superadmin/partners/:id/suspend para suspender e migrar clientes (D15)',
          'USE_SUSPEND_ENDPOINT',
          400
        );
      }
      profilePatch.push(`status = $${p++}`);
      profileVals.push(input.partner_status);
    }
    if (input.public_name !== undefined) {
      profilePatch.push(`public_name = $${p++}`);
      profileVals.push(input.public_name.trim());
    }
    if (input.product_name !== undefined) {
      profilePatch.push(`product_name = $${p++}`);
      profileVals.push(input.product_name.trim());
    }
    if (input.logo_url !== undefined) {
      profilePatch.push(`logo_url = $${p++}`);
      profileVals.push(input.logo_url);
    }
    if (input.theme_json !== undefined) {
      profilePatch.push(`theme_json = $${p++}::jsonb`);
      profileVals.push(JSON.stringify(input.theme_json));
    }
    if (input.payout_cadence_preference !== undefined) {
      profilePatch.push(`payout_cadence_preference = $${p++}`);
      profileVals.push(input.payout_cadence_preference);
    }

    const cfg = { ...(existing.program_config_json || {}) };
    let cfgChanged = false;
    if (input.floor_price_cents !== undefined) {
      const floor = Math.floor(input.floor_price_cents);
      if (!Number.isFinite(floor) || floor < 0) {
        throw new PartnerAdminError('floor_price_cents inválido', 'FLOOR_INVALID');
      }
      cfg.floor_price_cents = floor;
      cfgChanged = true;
    }
    if (input.unit_cost_cents !== undefined) {
      const unit = Math.floor(input.unit_cost_cents);
      if (!Number.isFinite(unit) || unit < 0) {
        throw new PartnerAdminError('unit_cost_cents inválido', 'UNIT_COST_INVALID');
      }
      cfg.unit_cost_cents = unit;
      cfgChanged = true;
      await client.query(
        `UPDATE partner_license_pool SET unit_cost_cents = $1, updated_at = now()
         WHERE partner_tenant_id = $2`,
        [unit, partnerTenantId]
      );
    }
    if (cfgChanged) {
      profilePatch.push(`program_config_json = $${p++}::jsonb`);
      profileVals.push(JSON.stringify(cfg));
    }

    if (profilePatch.length > 0) {
      profileVals.push(partnerTenantId);
      await client.query(
        `UPDATE partner_profiles SET ${profilePatch.join(', ')}, updated_at = now()
         WHERE partner_tenant_id = $${p}`,
        profileVals
      );
    }

    if (input.purchased_seats !== undefined || input.add_seats !== undefined) {
      let nextSeats = existing.purchased_seats;
      if (input.purchased_seats !== undefined) {
        nextSeats = Math.floor(input.purchased_seats);
      } else if (input.add_seats !== undefined) {
        nextSeats = existing.purchased_seats + Math.floor(input.add_seats);
      }
      if (!Number.isFinite(nextSeats) || nextSeats < 0) {
        throw new PartnerAdminError('purchased_seats inválido', 'SEATS_INVALID');
      }
      if (nextSeats < existing.used_seats_cache) {
        throw new PartnerAdminError(
          'purchased_seats não pode ser menor que used_seats',
          'SEATS_BELOW_USED'
        );
      }
      await client.query(
        `UPDATE partner_license_pool SET purchased_seats = $1, updated_at = now()
         WHERE partner_tenant_id = $2`,
        [nextSeats, partnerTenantId]
      );
      if (cfgChanged || input.purchased_seats !== undefined || input.add_seats !== undefined) {
        const nextCfg = { ...cfg, min_seats: Math.max(Number(cfg.min_seats) || 0, nextSeats) };
        await client.query(
          `UPDATE partner_profiles SET program_config_json = $1::jsonb, updated_at = now()
           WHERE partner_tenant_id = $2`,
          [JSON.stringify(nextCfg), partnerTenantId]
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  if (actorUserId) {
    await logSuperAdminAction(actorUserId, 'partner.updated', 'tenant', partnerTenantId, {
      ...input,
    });
  }

  const detail = await getPartnerDetail(partnerTenantId);
  if (!detail) throw new PartnerAdminError('Partner não encontrado', 'NOT_FOUND', 404);
  return detail;
}

/** Helper de teste / validação de constraint customer_tenant. */
export async function assertCustomerTenantRequiresPartner(
  client: PoolClient,
  params: { name: string; slug: string; planId: string }
): Promise<'ok_with_partner' | 'rejected_without_partner'> {
  try {
    await client.query(
      `INSERT INTO tenants (name, slug, plan_id, status, created_via, account_type, partner_id)
       VALUES ($1, $2, $3, 'active', 'superadmin', 'customer_tenant', NULL)`,
      [params.name, params.slug, params.planId]
    );
    return 'ok_with_partner';
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === '23514') return 'rejected_without_partner';
    throw err;
  }
}
