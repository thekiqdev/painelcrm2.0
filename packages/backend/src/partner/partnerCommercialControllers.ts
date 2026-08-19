/**
 * M5 S3 — controllers licenses + sell-plans.
 */

import type { Response } from 'express';
import { z } from 'zod';
import type { PartnerAuthRequest } from './partnerAuthMiddleware.js';
import { PartnerAdminError } from './partnerAdminService.js';
import { getPartnerLicenseSummary } from './partnerLicenseService.js';
import {
  archivePartnerSellPlan,
  createPartnerSellPlan,
  getPartnerSellPlan,
  listPartnerSellPlans,
  patchPartnerSellPlan,
  projectSellPlanEarnings,
} from './partnerSellPlanService.js';

function handleErr(err: unknown, res: Response): void {
  if (err instanceof PartnerAdminError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error('[partnerS3]', err);
  res.status(500).json({ error: (err as Error)?.message || 'Internal server error' });
}

export async function partnerGetLicenses(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const id = req.partnerContext?.partnerTenantId;
    if (!id) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const summary = await getPartnerLicenseSummary(id);
    res.json(summary);
  } catch (err) {
    handleErr(err, res);
  }
}

const sellPlanBody = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  price_cents: z.number().int().min(0),
  billing_interval: z.enum(['monthly', 'yearly', 'quarterly', 'semiannual']).optional(),
  features_json: z.record(z.unknown()).optional(),
  source_platform_plan_id: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  trial_days: z.coerce.number().int().min(0).max(365).optional(),
});

const sellPlanPatch = sellPlanBody.partial().refine((b) => Object.keys(b).length > 0, {
  message: 'Informe ao menos um campo',
});

const projectionQuery = z.object({
  price_cents: z.coerce.number().int().min(0),
  billing_interval: z.enum(['monthly', 'yearly', 'quarterly', 'semiannual']).optional(),
  estimated_customers: z.coerce.number().int().min(0).optional(),
  estimated_users_per_customer: z.coerce.number().int().min(1).optional(),
});

export async function partnerListSellPlans(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const id = req.partnerContext?.partnerTenantId;
    if (!id) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    res.json(await listPartnerSellPlans(id));
  } catch (err) {
    handleErr(err, res);
  }
}

export async function partnerGetSellPlan(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const id = req.partnerContext?.partnerTenantId;
    if (!id) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const plan = await getPartnerSellPlan(id, req.params.id);
    if (!plan) {
      res.status(404).json({ error: 'Plano não encontrado', code: 'NOT_FOUND' });
      return;
    }
    res.json(plan);
  } catch (err) {
    handleErr(err, res);
  }
}

export async function partnerCreateSellPlan(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const id = req.partnerContext?.partnerTenantId;
    if (!id) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const parsed = sellPlanBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const plan = await createPartnerSellPlan(id, parsed.data);
    res.status(201).json(plan);
  } catch (err) {
    handleErr(err, res);
  }
}

export async function partnerPatchSellPlan(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const id = req.partnerContext?.partnerTenantId;
    if (!id) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const parsed = sellPlanPatch.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const plan = await patchPartnerSellPlan(id, req.params.id, parsed.data);
    res.json(plan);
  } catch (err) {
    handleErr(err, res);
  }
}

export async function partnerArchiveSellPlan(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const id = req.partnerContext?.partnerTenantId;
    if (!id) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const plan = await archivePartnerSellPlan(id, req.params.id);
    res.json(plan);
  } catch (err) {
    handleErr(err, res);
  }
}

export async function partnerSellPlanProjection(
  req: PartnerAuthRequest,
  res: Response
): Promise<void> {
  try {
    const id = req.partnerContext?.partnerTenantId;
    if (!id) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const parsed = projectionQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Query inválida', details: parsed.error.flatten() });
      return;
    }
    const projection = await projectSellPlanEarnings(id, parsed.data);
    res.json(projection);
  } catch (err) {
    handleErr(err, res);
  }
}
