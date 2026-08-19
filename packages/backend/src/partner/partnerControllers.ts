/**
 * M5 Partner — superadmin + partner controllers (S1).
 */

import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { createPartner, PartnerAdminError, patchPartner } from './partnerAdminService.js';
import { getPartnerDetail, listPartners } from './partnerRepository.js';
import type { PartnerAuthRequest } from './partnerAuthMiddleware.js';
import type { PatchPartnerProfileInput } from './partnerTypes.js';
import { pool } from '../utils/db.js';

const createPartnerSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  admin_email: z.string().email(),
  admin_name: z.string().optional(),
  admin_password: z.string().min(8).optional(),
  program_type: z.enum(['license_pool', 'revenue_share']).optional().default('license_pool'),
  floor_price_cents: z.number().int().min(0),
  unit_cost_cents: z.number().int().min(0),
  purchased_seats: z.number().int().min(1),
  public_name: z.string().min(1),
  product_name: z.string().min(1),
  plan_id: z.string().uuid().optional().nullable(),
  domain: z.string().optional().nullable(),
});

const patchPartnerSchema = z
  .object({
    floor_price_cents: z.number().int().min(0).optional(),
    unit_cost_cents: z.number().int().min(0).optional(),
    purchased_seats: z.number().int().min(0).optional(),
    add_seats: z.number().int().optional(),
    public_name: z.string().min(1).optional(),
    product_name: z.string().min(1).optional(),
    logo_url: z.string().nullable().optional(),
    theme_json: z.record(z.unknown()).optional(),
    payout_cadence_preference: z.enum(['monthly', 'biweekly', 'on_demand']).optional(),
    partner_status: z.enum(['active', 'suspended']).optional(),
    status: z.enum(['active', 'suspended', 'trial', 'payment_pending']).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Informe ao menos um campo' });

const patchProfileSchema = z
  .object({
    public_name: z.string().min(1).optional(),
    product_name: z.string().min(1).optional(),
    logo_url: z.string().nullable().optional(),
    theme_json: z.record(z.unknown()).optional(),
    payout_cadence_preference: z.enum(['monthly', 'biweekly', 'on_demand']).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Informe ao menos um campo' });

function handlePartnerError(err: unknown, res: Response): void {
  if (err instanceof PartnerAdminError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error('[partner]', err);
  res.status(500).json({ error: (err as Error)?.message || 'Internal server error' });
}

export async function superadminListPartners(req: AuthRequest, res: Response): Promise<void> {
  try {
    const items = await listPartners();
    res.json(items);
  } catch (err) {
    handlePartnerError(err, res);
  }
}

export async function superadminGetPartner(req: AuthRequest, res: Response): Promise<void> {
  try {
    const detail = await getPartnerDetail(req.params.id);
    if (!detail) {
      res.status(404).json({ error: 'Partner não encontrado', code: 'NOT_FOUND' });
      return;
    }
    res.json(detail);
  } catch (err) {
    handlePartnerError(err, res);
  }
}

export async function superadminCreatePartner(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parsed = createPartnerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const detail = await createPartner(parsed.data, req.user?.id ?? null);
    res.status(201).json(detail);
  } catch (err) {
    handlePartnerError(err, res);
  }
}

export async function superadminPatchPartner(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parsed = patchPartnerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const detail = await patchPartner(req.params.id, parsed.data, req.user?.id ?? null);
    res.json(detail);
  } catch (err) {
    handlePartnerError(err, res);
  }
}

const suspendSchema = z.object({
  reason: z.string().max(2000).optional().nullable(),
});

export async function superadminSuspendPartner(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parsed = suspendSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const { suspendPartnerAndMigrateCustomers } = await import('./partnerSuspensionService.js');
    const result = await suspendPartnerAndMigrateCustomers(req.params.id, {
      actorUserId: req.user?.id ?? null,
      reason: parsed.data.reason,
    });
    const detail = await getPartnerDetail(req.params.id);
    res.json({ ...result, partner: detail });
  } catch (err) {
    handlePartnerError(err, res);
  }
}

export async function superadminPartnerChannelStats(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const { getPartnerChannelStats } = await import('./partnerSuspensionService.js');
    res.json(await getPartnerChannelStats());
  } catch (err) {
    handlePartnerError(err, res);
  }
}

export async function superadminListPartnerSuspensionEvents(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const { listPartnerSuspensionEvents } = await import('./partnerSuspensionService.js');
    res.json(await listPartnerSuspensionEvents(req.params.id));
  } catch (err) {
    handlePartnerError(err, res);
  }
}

export async function partnerGetMe(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    res.json({
      partner_tenant_id: ctx.partnerTenantId,
      membership_id: ctx.membershipId,
      role: ctx.role,
      profile: {
        public_name: ctx.profile.public_name,
        product_name: ctx.profile.product_name,
        program_type: ctx.profile.program_type,
        program_config_json: ctx.profile.program_config_json,
        logo_url: ctx.profile.logo_url,
        theme_json: ctx.profile.theme_json,
        custom_domain: ctx.profile.custom_domain,
        domain_status: ctx.profile.domain_status,
        status: ctx.profile.status,
        payout_cadence_preference: ctx.profile.payout_cadence_preference,
      },
      pool: ctx.pool
        ? {
            purchased_seats: ctx.pool.purchased_seats,
            used_seats_cache: ctx.pool.used_seats_cache,
            unit_cost_cents: ctx.pool.unit_cost_cents,
          }
        : null,
    });
  } catch (err) {
    handlePartnerError(err, res);
  }
}

const setDomainSchema = z.object({
  domain: z.string().min(3),
});

export async function partnerSetDomain(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const parsed = setDomainSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const { setPartnerDomain } = await import('./partnerDomainService.js');
    const instructions = await setPartnerDomain(ctx.partnerTenantId, parsed.data.domain);
    res.json(instructions);
  } catch (err) {
    handlePartnerError(err, res);
  }
}

export async function partnerGetDomain(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const { getPartnerDomainInstructions } = await import('./partnerDomainService.js');
    const instructions = await getPartnerDomainInstructions(ctx.partnerTenantId);
    res.json(instructions ?? { custom_domain: null, domain_status: 'none' });
  } catch (err) {
    handlePartnerError(err, res);
  }
}

export async function partnerVerifyDomain(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const { verifyPartnerDomain } = await import('./partnerDomainService.js');
    const result = await verifyPartnerDomain(ctx.partnerTenantId);
    res.json(result);
  } catch (err) {
    handlePartnerError(err, res);
  }
}

export async function partnerClearDomain(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const { clearPartnerDomain } = await import('./partnerDomainService.js');
    await clearPartnerDomain(ctx.partnerTenantId);
    res.json({ ok: true, domain_status: 'none' });
  } catch (err) {
    handlePartnerError(err, res);
  }
}

export async function publicGetPartnerBrand(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { resolvePartnerBrandByHost, normalizeHostname } = await import('./partnerBrandResolver.js');
    const { findPartnerTenantBySlug, listActivePartnerSellPlans } = await import(
      './partnerSellPlanService.js'
    );
    const { getPartnerProfile } = await import('./partnerRepository.js');
    const { mapSellPlanToCatalog } = await import('./partnerChannelCustomerPlans.js');
    const { pool } = await import('../utils/db.js');

    const q = typeof req.query.domain === 'string' ? req.query.domain : null;
    const slugQ = typeof req.query.slug === 'string' ? req.query.slug : null;
    const hostHeader = req.get('x-forwarded-host') || req.get('host') || null;
    const host = normalizeHostname(q) || normalizeHostname(hostHeader);

    let partnerTenantId: string | null = null;
    let partnerSlug: string | null = slugQ?.trim() || null;
    if (host) {
      const brandByHost = await resolvePartnerBrandByHost(host);
      if (brandByHost) partnerTenantId = brandByHost.partner_tenant_id;
    }
    if (!partnerTenantId && slugQ) {
      const bySlug = await findPartnerTenantBySlug(slugQ);
      if (bySlug) {
        partnerTenantId = bySlug.id;
        partnerSlug = bySlug.slug;
      }
    }

    if (!partnerTenantId) {
      res.json({ brand: null, platform: true, plans: null });
      return;
    }

    if (!partnerSlug) {
      const slugRow = await pool.query<{ slug: string }>(
        `SELECT slug FROM tenants WHERE id = $1 LIMIT 1`,
        [partnerTenantId]
      );
      partnerSlug = slugRow.rows[0]?.slug ?? null;
    }

    const profile = await getPartnerProfile(partnerTenantId);
    if (!profile) {
      res.json({ brand: null, platform: true, plans: null });
      return;
    }

    if (profile.status === 'suspended') {
      res.json({ brand: null, platform: true, plans: null, suspended: true });
      return;
    }

    const { canPartnerSellWithGateway } = await import('./partnerLicenseService.js');
    const gateway = await canPartnerSellWithGateway(partnerTenantId);

    const sellPlans = await listActivePartnerSellPlans(partnerTenantId);
    const tagline =
      typeof profile.theme_json?.tagline === 'string' ? String(profile.theme_json.tagline) : null;
    res.json({
      brand: {
        partner_tenant_id: partnerTenantId,
        public_name: profile.public_name,
        product_name: profile.product_name,
        logo_url: profile.logo_url,
        theme_json: profile.theme_json,
        tagline,
        custom_domain: profile.custom_domain,
        domain_status: profile.domain_status,
        slug: partnerSlug,
      },
      platform: false,
      plans: sellPlans.map(mapSellPlanToCatalog),
      /** S7.3 — FE pode avisar se cobrança ainda não está pronta (trial/grátis ok). */
      gateway_ready: gateway.ok,
      gateway_reason: gateway.reason,
    });
  } catch (err) {
    console.error('[publicGetPartnerBrand]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function partnerGetProfile(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    res.json(ctx.profile);
  } catch (err) {
    handlePartnerError(err, res);
  }
}

export async function partnerPatchProfile(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const parsed = patchProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const body = parsed.data as PatchPartnerProfileInput;
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (body.public_name !== undefined) {
      sets.push(`public_name = $${i++}`);
      vals.push(body.public_name.trim());
    }
    if (body.product_name !== undefined) {
      sets.push(`product_name = $${i++}`);
      vals.push(body.product_name.trim());
    }
    if (body.logo_url !== undefined) {
      sets.push(`logo_url = $${i++}`);
      vals.push(body.logo_url);
    }
    if (body.theme_json !== undefined) {
      sets.push(`theme_json = $${i++}::jsonb`);
      vals.push(JSON.stringify(body.theme_json));
    }
    if (body.payout_cadence_preference !== undefined) {
      sets.push(`payout_cadence_preference = $${i++}`);
      vals.push(body.payout_cadence_preference);
    }
    vals.push(ctx.partnerTenantId);
    await pool.query(
      `UPDATE partner_profiles SET ${sets.join(', ')}, updated_at = now()
       WHERE partner_tenant_id = $${i}
       RETURNING *`,
      vals
    );
    const detail = await getPartnerDetail(ctx.partnerTenantId);
    res.json(detail?.program_config_json != null ? {
      partner_tenant_id: ctx.partnerTenantId,
      public_name: detail!.public_name,
      product_name: detail!.product_name,
      logo_url: detail!.logo_url,
      theme_json: detail!.theme_json,
      program_type: detail!.program_type,
      program_config_json: detail!.program_config_json,
      custom_domain: detail!.custom_domain,
      domain_status: detail!.domain_status,
      status: detail!.partner_status,
      payout_cadence_preference: detail!.payout_cadence_preference,
    } : { ok: true });
  } catch (err) {
    handlePartnerError(err, res);
  }
}
