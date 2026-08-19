/**
 * M5 S4 — controllers carteira + seller link.
 */

import type { Response } from 'express';
import { z } from 'zod';
import { PartnerAdminError } from './partnerAdminService.js';
import type { PartnerAuthRequest } from './partnerAuthMiddleware.js';
import {
  createPartnerCustomer,
  deletePartnerCustomer,
  listPartnerCustomers,
  updatePartnerCustomer,
} from './partnerCustomerService.js';
import {
  createPartnerSeller,
  getPartnerHouseSaleLink,
  getSellerSaleLink,
  listPartnerSellers,
} from './partnerSellerService.js';

function handleErr(err: unknown, res: Response): void {
  if (err instanceof PartnerAdminError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof Error && err.message === 'SELLER_MEMBERSHIP_MISSING') {
    res.status(404).json({ error: 'Membership seller não encontrada', code: 'SELLER_NOT_FOUND' });
    return;
  }
  console.error('[partnerCustomers]', err);
  res.status(500).json({ error: (err as Error)?.message || 'Internal server error' });
}

export async function partnerListCustomers(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const items = await listPartnerCustomers(ctx.partnerTenantId);
    res.json(items);
  } catch (err) {
    handleErr(err, res);
  }
}

const createCustomerSchema = z.object({
  company_name: z.string().min(2),
  admin_email: z.string().email(),
  admin_name: z.string().min(1).optional(),
  admin_password: z.string().min(8),
  seats: z.coerce.number().int().min(1).max(10000),
  sell_plan_id: z.string().uuid(),
  seller_user_id: z.string().uuid().nullable().optional(),
  cpf_cnpj: z.string().optional().nullable(),
});

export async function partnerCreateCustomer(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const parsed = createCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const row = await createPartnerCustomer(ctx.partnerTenantId, {
      company_name: parsed.data.company_name,
      admin_email: parsed.data.admin_email,
      admin_name: parsed.data.admin_name,
      admin_password: parsed.data.admin_password,
      seats: parsed.data.seats,
      sell_plan_id: parsed.data.sell_plan_id,
      seller_user_id: parsed.data.seller_user_id,
      cpf_cnpj: parsed.data.cpf_cnpj,
    });
    res.status(201).json(row);
  } catch (err) {
    handleErr(err, res);
  }
}

const patchCustomerSchema = z
  .object({
    company_name: z.string().min(2).optional(),
    admin_name: z.string().optional(),
    admin_email: z.string().email().optional(),
    admin_password: z.string().min(8).optional(),
    seats: z.coerce.number().int().min(1).max(10000).optional(),
    sell_plan_id: z.string().uuid().optional(),
    seller_user_id: z.string().uuid().nullable().optional(),
    cpf_cnpj: z.string().optional().nullable(),
  })
  .refine(
    (v) =>
      v.company_name !== undefined ||
      v.admin_name !== undefined ||
      v.admin_email !== undefined ||
      v.admin_password !== undefined ||
      v.seats !== undefined ||
      v.sell_plan_id !== undefined ||
      v.seller_user_id !== undefined ||
      v.cpf_cnpj !== undefined,
    { message: 'Informe ao menos um campo para atualizar' }
  );

export async function partnerPatchCustomer(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const parsed = patchCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const row = await updatePartnerCustomer(ctx.partnerTenantId, req.params.id, parsed.data);
    res.json(row);
  } catch (err) {
    handleErr(err, res);
  }
}

export async function partnerDeleteCustomer(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    await deletePartnerCustomer(ctx.partnerTenantId, req.params.id);
    res.status(204).send();
  } catch (err) {
    handleErr(err, res);
  }
}

export async function partnerListSellers(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const items = await listPartnerSellers(ctx.partnerTenantId);
    res.json(items);
  } catch (err) {
    handleErr(err, res);
  }
}

const createSellerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
});

export async function partnerCreateSeller(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const parsed = createSellerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const origin = req.get('origin') || req.get('x-forwarded-host') || req.get('host') || null;
    const row = await createPartnerSeller(ctx.partnerTenantId, parsed.data, {
      originHint: origin,
    });
    res.status(201).json(row);
  } catch (err) {
    handleErr(err, res);
  }
}

export async function partnerGetHouseSaleLink(
  req: PartnerAuthRequest,
  res: Response
): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const origin = req.get('origin') || req.get('x-forwarded-host') || req.get('host') || null;
    const link = await getPartnerHouseSaleLink(ctx.partnerTenantId, {
      originHint: origin,
    });
    res.json(link);
  } catch (err) {
    handleErr(err, res);
  }
}

export async function partnerSellerGetLink(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx || !req.userId) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const origin = req.get('origin') || req.get('x-forwarded-host') || req.get('host') || null;
    const link = await getSellerSaleLink(ctx.partnerTenantId, req.userId, {
      originHint: origin,
    });
    res.json(link);
  } catch (err) {
    handleErr(err, res);
  }
}
