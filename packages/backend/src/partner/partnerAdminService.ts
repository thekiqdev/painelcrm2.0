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
import { PartnerAdminError } from './partnerErrors.js';
import { applyPartnerLicenseDelta } from './partnerLicenseLedgerService.js';
import { isValidCpfOrCnpj, onlyDigits } from '../utils/cpfCnpj.js';

export { PartnerAdminError } from './partnerErrors.js';

function normalizePartnerDocument(raw?: string | null): string | null {
  const digits = onlyDigits(raw ?? '');
  if (!digits) return null;
  if (!isValidCpfOrCnpj(digits)) {
    throw new PartnerAdminError(
      'CPF/CNPJ inválido. Informe um documento válido ou deixe em branco.',
      'CPF_CNPJ_INVALID',
      400
    );
  }
  return digits;
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

  const purchasedSeats = Math.floor(
    input.purchased_seats !== undefined && input.purchased_seats !== null
      ? input.purchased_seats
      : 0
  );
  if (!Number.isFinite(purchasedSeats) || purchasedSeats < 0) {
    throw new PartnerAdminError('purchased_seats deve ser >= 0', 'SEATS_INVALID');
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

  const wholesalePlanId = input.wholesale_plan_id?.trim() || null;
  let wholesaleEnvelopePlanId: string | null = null;
  if (wholesalePlanId) {
    const { getWholesalePlan } = await import('./partnerWholesalePlanService.js');
    const wholesale = await getWholesalePlan(wholesalePlanId);
    if (!wholesale) {
      throw new PartnerAdminError('Plano atacado não encontrado', 'WHOLESALE_NOT_FOUND', 404);
    }
    if (wholesale.status === 'archived') {
      throw new PartnerAdminError('Plano atacado arquivado', 'WHOLESALE_ARCHIVED', 400);
    }
    wholesaleEnvelopePlanId = wholesale.envelope_plan_id;
  }

  let planId = wholesaleEnvelopePlanId || input.plan_id?.trim() || null;
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

  const cpfCnpj = normalizePartnerDocument(input.cpf_cnpj);

  const client = await pool.connect();
  let partnerId: string;
  try {
    await client.query('BEGIN');

    const tenantIns = await client.query<{ id: string }>(
      `INSERT INTO tenants (
         name, slug, domain, plan_id, status, created_via, account_type, partner_id,
         onboarding_completed, cpf_cnpj
       ) VALUES ($1, $2, $3, $4, 'active', 'superadmin', 'partner', NULL, true, $5)
       RETURNING id`,
      [name, slug, input.domain?.trim() || null, planId, cpfCnpj]
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
         public_name, product_name, status, wholesale_status
       ) VALUES ($1, $2, $3::jsonb, $4, $5, 'active', 'none')`,
      [partnerId, programType, JSON.stringify(programConfig), publicName, productName]
    );

    await client.query(
      `INSERT INTO partner_license_pool (
         partner_tenant_id, purchased_seats, unit_cost_cents, used_seats_cache
       ) VALUES ($1, 0, $2, 0)`,
      [partnerId, unitCost]
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

    if (purchasedSeats > 0 && !wholesalePlanId) {
      await applyPartnerLicenseDelta({
        partnerTenantId: partnerId,
        deltaSeats: purchasedSeats,
        reason: 'grant',
        actorUserId,
        note: 'Grant inicial na criação do Partner (M5-W)',
        client,
      });
    }

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
      purchased_seats: wholesalePlanId ? 0 : purchasedSeats,
      wholesale_plan_id: wholesalePlanId,
      grant_source: wholesalePlanId
        ? 'wholesale_grant'
        : purchasedSeats > 0
          ? 'create_grant'
          : 'none',
    });
  }

  if (wholesalePlanId) {
    const { assignWholesalePlanGrant } = await import('./partnerWholesaleActivationService.js');
    await assignWholesalePlanGrant({
      partnerTenantId: partnerId,
      wholesalePlanId,
      actorUserId,
      note: 'Grant na criação do Partner',
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

    const tenantPatch: string[] = [];
    const tenantVals: unknown[] = [];
    let t = 1;

    if (input.status !== undefined) {
      tenantPatch.push(`status = $${t++}`);
      tenantVals.push(input.status);
    }
    if (input.name !== undefined) {
      const nextName = input.name.trim();
      if (!nextName) throw new PartnerAdminError('Nome é obrigatório', 'NAME_REQUIRED');
      tenantPatch.push(`name = $${t++}`);
      tenantVals.push(nextName);
    }
    if (input.cpf_cnpj !== undefined) {
      const doc = normalizePartnerDocument(input.cpf_cnpj);
      tenantPatch.push(`cpf_cnpj = $${t++}`);
      tenantVals.push(doc);
    }
    if (tenantPatch.length > 0) {
      tenantVals.push(partnerTenantId);
      await client.query(
        `UPDATE tenants SET ${tenantPatch.join(', ')}, updated_at = now() WHERE id = $${t}`,
        tenantVals
      );
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
    if (input.wholesale_block_after_days !== undefined) {
      if (input.wholesale_block_after_days === null) {
        profilePatch.push(`wholesale_block_after_days = $${p++}`);
        profileVals.push(null);
      } else {
        const n = Math.floor(Number(input.wholesale_block_after_days));
        if (!Number.isFinite(n) || n < 0 || n > 90) {
          throw new PartnerAdminError(
            'wholesale_block_after_days deve ser inteiro entre 0 e 90 (ou null)',
            'BLOCK_AFTER_DAYS_INVALID',
            400
          );
        }
        profilePatch.push(`wholesale_block_after_days = $${p++}`);
        profileVals.push(n);
      }
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
      let delta = 0;
      if (input.purchased_seats !== undefined) {
        const nextSeats = Math.floor(input.purchased_seats);
        if (!Number.isFinite(nextSeats) || nextSeats < 0) {
          throw new PartnerAdminError('purchased_seats inválido', 'SEATS_INVALID');
        }
        delta = nextSeats - existing.purchased_seats;
      } else if (input.add_seats !== undefined) {
        delta = Math.floor(input.add_seats);
      }
      if (!Number.isFinite(delta)) {
        throw new PartnerAdminError('purchased_seats inválido', 'SEATS_INVALID');
      }
      if (delta !== 0) {
        const fromAddSeats = input.add_seats !== undefined;
        await applyPartnerLicenseDelta({
          partnerTenantId,
          deltaSeats: delta,
          reason: fromAddSeats
            ? delta > 0
              ? 'grant'
              : 'admin_adjust'
            : 'admin_adjust',
          actorUserId,
          note:
            input.add_seats !== undefined
              ? `Super Admin add_seats=${input.add_seats}`
              : `Super Admin set purchased_seats=${input.purchased_seats}`,
          client,
        });
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
