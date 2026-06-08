/**
 * Sprint M2 — API Superadmin para Tenant Commercial Overrides.
 */
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import {
  createTenantCommercialOverride,
  disableTenantCommercialOverride,
  getTenantCommercialSummary,
  listTenantCommercialOverrides,
  patchTenantCommercialOverride,
  simulateTenantCommercialPrice,
  type CreateCommercialOverrideInput,
} from '../commercial/commercialOverridesManagementService.js';
import { TENANT_COMMERCIAL_OVERRIDE_TYPES } from '../commercial/tenantCommercialTypes.js';

function requireSuperAdmin(req: AuthRequest, res: Response): boolean {
  if (!req.user?.is_super_admin) {
    res.status(403).json({ error: 'Acesso restrito a super administradores' });
    return false;
  }
  return true;
}

const billingIntervalSchema = z.enum(['monthly', 'quarterly', 'semi_annual', 'yearly']);

const overrideBodySchema = z.object({
  override_type: z.enum(TENANT_COMMERCIAL_OVERRIDE_TYPES),
  value_cents: z.number().int().min(0).nullable().optional(),
  percent_off: z.number().min(0).max(100).nullable().optional(),
  valid_from: z.string().optional().nullable(),
  valid_until: z.string().optional().nullable(),
  reason: z.string().max(2000).optional().nullable(),
  plan_id: z.string().uuid().optional().nullable(),
  billing_interval: billingIntervalSchema.optional().nullable(),
});

const patchBodySchema = overrideBodySchema.partial();

export async function getTenantCommercial(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { tenantId } = req.params;
    const payload = await getTenantCommercialSummary(tenantId);
    res.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro ao carregar comercial';
    const status = message.includes('não encontrado') ? 404 : 400;
    res.status(status).json({ error: message });
  }
}

export async function listTenantCommercialOverridesHandler(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { tenantId } = req.params;
    const payload = await listTenantCommercialOverrides(tenantId);
    res.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro ao listar overrides';
    res.status(400).json({ error: message });
  }
}

export async function postTenantCommercialOverride(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { tenantId } = req.params;
    const body = overrideBodySchema.parse(req.body ?? {});
    const item = await createTenantCommercialOverride(tenantId, body, req.user?.id ?? null);
    res.status(201).json({ ok: true, override: item });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.errors[0]?.message ?? 'Dados inválidos' });
      return;
    }
    const message = e instanceof Error ? e.message : 'Erro ao criar override';
    res.status(400).json({ error: message });
  }
}

export async function patchTenantCommercialOverrideHandler(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { tenantId, id } = req.params;
    const body = patchBodySchema.parse(req.body ?? {});
    const item = await patchTenantCommercialOverride(tenantId, id, body, req.user?.id ?? null);
    res.json({ ok: true, override: item });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.errors[0]?.message ?? 'Dados inválidos' });
      return;
    }
    const message = e instanceof Error ? e.message : 'Erro ao atualizar override';
    const status = message.includes('não encontrado') ? 404 : 400;
    res.status(status).json({ error: message });
  }
}

export async function deleteTenantCommercialOverride(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { tenantId, id } = req.params;
    const item = await disableTenantCommercialOverride(tenantId, id, req.user?.id ?? null);
    res.json({ ok: true, override: item });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro ao desativar override';
    const status = message.includes('não encontrado') ? 404 : 400;
    res.status(status).json({ error: message });
  }
}

export async function postTenantCommercialSimulate(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { tenantId } = req.params;
    const body = patchBodySchema.parse(req.body ?? {});
    const simulation = await simulateTenantCommercialPrice(
      tenantId,
      body.override_type
        ? ({ ...body, override_type: body.override_type } as CreateCommercialOverrideInput)
        : undefined,
    );
    res.json({ ok: true, simulation });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.errors[0]?.message ?? 'Dados inválidos' });
      return;
    }
    const message = e instanceof Error ? e.message : 'Erro na simulação';
    res.status(400).json({ error: message });
  }
}
