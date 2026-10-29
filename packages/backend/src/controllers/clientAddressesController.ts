/**
 * S10 — HTTP handlers para endereços do cliente.
 */
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantId } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import {
  ClientAddressDomainError,
  createClientAddress,
  deleteClientAddress,
  listClientAddresses,
  updateClientAddress,
} from '../services/clientAddressesService.js';
import { pool } from '../utils/db.js';

const MODULE = 'clients' as const;

const addressBodySchema = z.object({
  label: z.string().max(120).optional().nullable(),
  postal_code: z.string().max(16).optional().nullable(),
  street: z.string().max(300).optional().nullable(),
  number: z.string().max(40).optional().nullable(),
  complement: z.string().max(120).optional().nullable(),
  neighborhood: z.string().max(120).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state: z.string().max(2).optional().nullable(),
  is_default: z.boolean().optional(),
});

async function loadClientOwner(
  tenantId: string,
  clientId: string,
): Promise<{ id: string; user_id: string } | null> {
  const r = await pool.query<{ id: string; user_id: string }>(
    `SELECT c.id, c.user_id
     FROM public.clients c
     INNER JOIN public.users u ON u.id = c.user_id AND u.tenant_id = $1
     WHERE c.id = $2
     LIMIT 1`,
    [tenantId, clientId],
  );
  return r.rows[0] ?? null;
}

function respondError(res: Response, error: unknown): boolean {
  if (error instanceof ModulePermissionError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return true;
  }
  if (error instanceof ClientAddressDomainError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return true;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: 'Dados inválidos', details: error.flatten() });
    return true;
  }
  return false;
}

export async function getClientAddressesHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const clientId = String(req.params.id || '');

    const owner = await loadClientOwner(tenantId, clientId);
    if (!owner) {
      res.status(404).json({ error: 'Cliente não encontrado.' });
      return;
    }
    await assertModulePermission(
      userId,
      MODULE,
      'view',
      { ownerId: owner.user_id, assigneeId: null },
      req,
    );

    const data = await listClientAddresses(tenantId, clientId);
    res.json({ data });
  } catch (error) {
    if (respondError(res, error)) return;
    console.error('[client-addresses] list failed', error);
    res.status(500).json({ error: 'Erro ao listar endereços' });
  }
}

export async function postClientAddressHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const clientId = String(req.params.id || '');

    const owner = await loadClientOwner(tenantId, clientId);
    if (!owner) {
      res.status(404).json({ error: 'Cliente não encontrado.' });
      return;
    }
    await assertModulePermission(
      userId,
      MODULE,
      'edit',
      { ownerId: owner.user_id, assigneeId: null },
      req,
    );

    const body = addressBodySchema.parse(req.body ?? {});
    const row = await createClientAddress({
      tenantId,
      clientId,
      userId,
      input: body,
    });
    res.status(201).json(row);
  } catch (error) {
    if (respondError(res, error)) return;
    console.error('[client-addresses] create failed', error);
    res.status(500).json({ error: 'Erro ao criar endereço' });
  }
}

export async function patchClientAddressHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const clientId = String(req.params.id || '');
    const addressId = String(req.params.addressId || '');

    const owner = await loadClientOwner(tenantId, clientId);
    if (!owner) {
      res.status(404).json({ error: 'Cliente não encontrado.' });
      return;
    }
    await assertModulePermission(
      userId,
      MODULE,
      'edit',
      { ownerId: owner.user_id, assigneeId: null },
      req,
    );

    const body = addressBodySchema.parse(req.body ?? {});
    const row = await updateClientAddress({
      tenantId,
      clientId,
      addressId,
      input: body,
    });
    res.json(row);
  } catch (error) {
    if (respondError(res, error)) return;
    console.error('[client-addresses] update failed', error);
    res.status(500).json({ error: 'Erro ao atualizar endereço' });
  }
}

export async function deleteClientAddressHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const clientId = String(req.params.id || '');
    const addressId = String(req.params.addressId || '');

    const owner = await loadClientOwner(tenantId, clientId);
    if (!owner) {
      res.status(404).json({ error: 'Cliente não encontrado.' });
      return;
    }
    await assertModulePermission(
      userId,
      MODULE,
      'edit',
      { ownerId: owner.user_id, assigneeId: null },
      req,
    );

    await deleteClientAddress({ tenantId, clientId, addressId });
    res.status(204).send();
  } catch (error) {
    if (respondError(res, error)) return;
    console.error('[client-addresses] delete failed', error);
    res.status(500).json({ error: 'Erro ao excluir endereço' });
  }
}
