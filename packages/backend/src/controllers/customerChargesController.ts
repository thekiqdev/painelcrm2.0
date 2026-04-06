/**
 * Cobranças (customer_charges): CRUD e listagem. Fase 10.
 */
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import {
  listCharges,
  getChargeById,
  createCharge,
  updateCharge,
  getInvoicesForCharge,
} from '../services/customerChargesService.js';
import { clientBelongsToTenant } from '../services/customerBillingService.js';

const createBodySchema = z.object({
  client_id: z.string().uuid().optional().nullable(),
  description: z.string().optional().nullable(),
});

const updateBodySchema = z.object({
  description: z.string().optional().nullable(),
});

/** GET /api/customer-charges — lista cobranças do tenant. */
export async function listCustomerCharges(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Tenant não identificado' });
      return;
    }
    const client_id = typeof req.query.client_id === 'string' ? req.query.client_id : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const offset = req.query.offset != null ? Number(req.query.offset) : undefined;
    const list = await listCharges(tenantId, { client_id, status, q, limit, offset });
    res.json(list);
  } catch (err) {
    console.error('[customerChargesController] listCustomerCharges error:', err);
    res.status(500).json({ error: 'Erro ao listar cobranças' });
  }
}

/** GET /api/customer-charges/:id — detalhe da cobrança e faturas vinculadas. */
export async function getCustomerChargeById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Tenant não identificado' });
      return;
    }
    const { id } = req.params;
    const charge = await getChargeById(tenantId, id);
    if (!charge) {
      res.status(404).json({ error: 'Cobrança não encontrada' });
      return;
    }
    const invoices = await getInvoicesForCharge(tenantId, id);
    res.json({ ...charge, invoices });
  } catch (err) {
    console.error('[customerChargesController] getCustomerChargeById error:', err);
    res.status(500).json({ error: 'Erro ao buscar cobrança' });
  }
}

/** POST /api/customer-charges — cria cobrança. */
export async function createCustomerCharge(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Tenant não identificado' });
      return;
    }
    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }
    if (parsed.data.client_id != null && parsed.data.client_id !== '') {
      const belongs = await clientBelongsToTenant(tenantId, parsed.data.client_id);
      if (!belongs) {
        res.status(403).json({ error: 'Cliente não pertence ao tenant' });
        return;
      }
    }
    const charge = await createCharge(tenantId, {
      client_id: parsed.data.client_id ?? null,
      description: parsed.data.description ?? null,
    });
    res.status(201).json(charge);
  } catch (err) {
    console.error('[customerChargesController] createCustomerCharge error:', err);
    res.status(500).json({ error: 'Erro ao criar cobrança' });
  }
}

/** PATCH /api/customer-charges/:id — atualiza descrição. */
export async function updateCustomerCharge(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Tenant não identificado' });
      return;
    }
    const { id } = req.params;
    const parsed = updateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }
    const charge = await updateCharge(tenantId, id, {
      description: parsed.data.description ?? undefined,
    });
    if (!charge) {
      res.status(404).json({ error: 'Cobrança não encontrada' });
      return;
    }
    res.json(charge);
  } catch (err) {
    console.error('[customerChargesController] updateCustomerCharge error:', err);
    res.status(500).json({ error: 'Erro ao atualizar cobrança' });
  }
}
