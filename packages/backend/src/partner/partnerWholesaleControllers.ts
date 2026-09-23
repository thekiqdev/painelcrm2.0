/**
 * M5-W Sprint 1 — Super Admin controllers for wholesale plans.
 */

import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { PartnerAdminError } from './partnerErrors.js';
import {
  archiveWholesalePlan,
  createWholesalePlan,
  getWholesalePlan,
  listWholesalePlans,
  updateWholesalePlan,
} from './partnerWholesalePlanService.js';
import { listPartnerLicenseLedger } from './partnerLicenseLedgerService.js';
import { getPartnerDetail } from './partnerRepository.js';

const upsertSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  seats_included: z.number().int().min(0),
  price_cents: z.number().int().min(0),
  billing_interval: z.enum(['monthly', 'quarterly', 'semi_annual', 'yearly']).optional(),
  envelope_plan_id: z.string().uuid().nullable().optional(),
  unit_overage_cents: z.number().int().min(0).nullable().optional(),
  sort_order: z.number().int().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const patchSchema = upsertSchema.partial().refine((b) => Object.keys(b).length > 0, {
  message: 'Informe ao menos um campo',
});

function handleErr(err: unknown, res: Response): void {
  if (err instanceof PartnerAdminError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error('[partner-wholesale]', err);
  res.status(500).json({ error: (err as Error)?.message || 'Internal server error' });
}

export async function superadminListWholesalePlans(req: AuthRequest, res: Response): Promise<void> {
  try {
    const includeArchived = String(req.query.include_archived || '') === '1';
    const items = await listWholesalePlans({ includeArchived });
    res.json(items);
  } catch (err) {
    handleErr(err, res);
  }
}

export async function superadminGetWholesalePlan(req: AuthRequest, res: Response): Promise<void> {
  try {
    const item = await getWholesalePlan(req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Plano atacado não encontrado', code: 'NOT_FOUND' });
      return;
    }
    res.json(item);
  } catch (err) {
    handleErr(err, res);
  }
}

export async function superadminCreateWholesalePlan(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const created = await createWholesalePlan(parsed.data, req.user?.id ?? null);
    res.status(201).json(created);
  } catch (err) {
    handleErr(err, res);
  }
}

export async function superadminUpdateWholesalePlan(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const updated = await updateWholesalePlan(req.params.id, parsed.data, req.user?.id ?? null);
    res.json(updated);
  } catch (err) {
    handleErr(err, res);
  }
}

export async function superadminArchiveWholesalePlan(req: AuthRequest, res: Response): Promise<void> {
  try {
    const archived = await archiveWholesalePlan(req.params.id, req.user?.id ?? null);
    res.json(archived);
  } catch (err) {
    handleErr(err, res);
  }
}

/** GET /api/superadmin/partners/:id/license-ledger */
export async function superadminListPartnerLicenseLedger(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const detail = await getPartnerDetail(req.params.id);
    if (!detail) {
      res.status(404).json({ error: 'Partner não encontrado', code: 'NOT_FOUND' });
      return;
    }
    const limit = Number(req.query.limit || 50);
    const items = await listPartnerLicenseLedger(req.params.id, limit);
    res.json(items);
  } catch (err) {
    handleErr(err, res);
  }
}

/** GET /api/superadmin/partners/wholesale-report */
export async function superadminWholesaleReport(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const { listPartnerWholesaleReport } = await import('./partnerWholesaleReportService.js');
    const status =
      typeof req.query.status === 'string' && req.query.status.trim()
        ? req.query.status.trim()
        : null;
    const limit = Number(req.query.limit || 200);
    const items = await listPartnerWholesaleReport({ status, limit });
    res.json(items);
  } catch (err) {
    handleErr(err, res);
  }
}

const assignSchema = z.object({
  wholesale_plan_id: z.string().uuid(),
  mode: z.enum(['grant', 'charge']),
  payment_method: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']).optional(),
  note: z.string().max(500).optional(),
});

/** POST /api/superadmin/partners/:id/wholesale/assign */
export async function superadminAssignWholesalePlan(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const { wholesale_plan_id, mode, payment_method, note } = parsed.data;
    const partnerId = req.params.id;
    const actor = req.user?.id ?? null;

    if (mode === 'grant') {
      const { assignWholesalePlanGrant } = await import('./partnerWholesaleActivationService.js');
      const result = await assignWholesalePlanGrant({
        partnerTenantId: partnerId,
        wholesalePlanId: wholesale_plan_id,
        actorUserId: actor,
        note: note ?? null,
      });
      const detail = await getPartnerDetail(partnerId);
      res.json({
        mode: 'grant',
        seats_credited: result.seatsCredited,
        purchased_seats: result.purchased_seats,
        plan: result.plan,
        partner: detail,
      });
      return;
    }

    const { createPartnerWholesaleCheckout } = await import('./partnerWholesaleCheckoutService.js');
    const checkout = await createPartnerWholesaleCheckout({
      partnerTenantId: partnerId,
      wholesalePlanId: wholesale_plan_id,
      paymentMethod: payment_method ?? 'PIX',
      source: 'superadmin',
      actorUserId: actor,
    });
    res.status(201).json({
      mode: 'charge',
      billing: checkout.billing,
      plan: checkout.plan,
      paymentUrls: checkout.paymentUrls ?? null,
      settled: checkout.settled === true,
    });
  } catch (err) {
    handleErr(err, res);
  }
}

const blockSettingsSchema = z.object({
  block_after_days: z.number().int().min(0).max(90),
});

/** GET /api/superadmin/partner-wholesale-plans/settings/block */
export async function superadminGetWholesaleBlockSettings(
  _req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const { getPartnerWholesaleBlockSettings } = await import(
      './partnerWholesaleBlockSettingsService.js'
    );
    const settings = await getPartnerWholesaleBlockSettings();
    res.json(settings);
  } catch (err) {
    handleErr(err, res);
  }
}

/** PUT /api/superadmin/partner-wholesale-plans/settings/block */
export async function superadminUpdateWholesaleBlockSettings(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const parsed = blockSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const { updatePartnerWholesaleBlockSettings } = await import(
      './partnerWholesaleBlockSettingsService.js'
    );
    const settings = await updatePartnerWholesaleBlockSettings(
      parsed.data,
      req.user?.id ?? null
    );
    res.json(settings);
  } catch (err) {
    handleErr(err, res);
  }
}

/** POST /api/superadmin/partner-wholesale-plans/settings/block/sync */
export async function superadminSyncWholesalePastDue(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const limit = Number(req.body?.limit ?? req.query.limit ?? 100);
    const { syncPartnerWholesalePastDueStatuses } = await import(
      './partnerWholesaleStatusService.js'
    );
    const result = await syncPartnerWholesalePastDueStatuses({
      limit: Number.isFinite(limit) ? limit : 100,
    });
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
}

