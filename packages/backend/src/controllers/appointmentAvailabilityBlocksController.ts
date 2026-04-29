import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantId } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { getEffectiveModulePermissions } from '../services/modulePermissionsService.js';
import { hasSettingsEdit } from '../services/agendaAccessControl.js';
import { assertUserBelongsToTenant } from '../services/appointmentAvailabilityService.js';
import {
  listAvailabilityBlocks,
  getAvailabilityBlockById,
  createAvailabilityBlock,
  patchAvailabilityBlock,
  cancelAvailabilityBlock,
  normalizeBlockScopeRow,
  type AvailabilityBlockRow,
} from '../services/appointmentAvailabilityBlocksService.js';

const MODULE = 'agenda' as const;

const BLOCK_TYPES = z.enum(['manual', 'holiday', 'vacation', 'external_meeting', 'maintenance', 'other']);
const BLOCK_SCOPES = z.enum(['tenant', 'user']);

function rowToJson(row: AvailabilityBlockRow) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    user_id: row.user_id,
    title: row.title,
    description: row.description,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    all_day: row.all_day,
    block_scope: row.block_scope,
    block_type: row.block_type,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    cancelled_at: row.cancelled_at,
  };
}

async function assertAgendaView(req: AuthRequest): Promise<void> {
  const perms = await getEffectiveModulePermissions(req.userId!);
  const p = perms[MODULE];
  if (p?.can_view === false) {
    throw new ModulePermissionError(403, 'Sem permissão para a Agenda');
  }
}

async function canManageTenantScopedBlocks(actorUserId: string, req: AuthRequest): Promise<boolean> {
  return hasSettingsEdit(actorUserId, req);
}

/** Bloqueio de outro utilizador: settings.edit ou admin/gestor (via hasSettingsEdit). */
async function canActOnUserBlock(actorUserId: string, targetUserId: string, req: AuthRequest): Promise<boolean> {
  if (actorUserId === targetUserId) return true;
  return hasSettingsEdit(actorUserId, req);
}

async function assertCanModifyBlock(
  req: AuthRequest,
  row: AvailabilityBlockRow,
  tenantId: string,
): Promise<void> {
  if (row.tenant_id !== tenantId) {
    throw new ModulePermissionError(404, 'Bloqueio não encontrado');
  }
  if (row.cancelled_at) {
    throw new ModulePermissionError(400, 'Bloqueio já cancelado');
  }
  if (row.block_scope === 'tenant') {
    const ok = await canManageTenantScopedBlocks(req.userId!, req);
    if (!ok) throw new ModulePermissionError(403, 'Sem permissão para bloqueios da empresa.');
    return;
  }
  if (!row.user_id) throw new ModulePermissionError(400, 'Bloqueio inválido');
  if (row.user_id === req.userId) {
    await assertModulePermission(req.userId!, MODULE, 'edit', undefined, req as AuthRequest);
    return;
  }
  const allow = await canActOnUserBlock(req.userId!, row.user_id, req);
  if (!allow) throw new ModulePermissionError(403, 'Sem permissão para este bloqueio de utilizador.');
}

const listQuerySchema = z.object({
  date_from: z.string().min(1).optional(),
  date_to: z.string().min(1).optional(),
  user_id: z.string().uuid().optional(),
  block_scope: BLOCK_SCOPES.optional(),
  block_type: BLOCK_TYPES.optional(),
});

const createBodySchema = z
  .object({
    title: z.string().min(1).max(500),
    description: z.string().max(4000).nullable().optional(),
    starts_at: z.string().min(1),
    ends_at: z.string().min(1),
    all_day: z.boolean().optional(),
    block_scope: BLOCK_SCOPES,
    user_id: z.string().uuid().nullable().optional(),
    block_type: BLOCK_TYPES,
  })
  .refine((b) => new Date(b.ends_at).getTime() > new Date(b.starts_at).getTime(), {
    message: 'ends_at deve ser depois de starts_at',
  });

const patchBodySchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(4000).nullable().optional(),
    starts_at: z.string().min(1).optional(),
    ends_at: z.string().min(1).optional(),
    all_day: z.boolean().optional(),
    block_scope: BLOCK_SCOPES.optional(),
    user_id: z.string().uuid().nullable().optional(),
    block_type: BLOCK_TYPES.optional(),
  })
  .refine(
    (b) =>
      !b.starts_at ||
      !b.ends_at ||
      new Date(b.ends_at).getTime() > new Date(b.starts_at).getTime(),
    { message: 'ends_at deve ser depois de starts_at' },
  );

/** GET /api/appointments/availability-blocks */
export async function listAvailabilityBlocksHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const parsed = listQuerySchema.safeParse({
    date_from: req.query.date_from,
    date_to: req.query.date_to,
    user_id: req.query.user_id,
    block_scope: req.query.block_scope,
    block_type: req.query.block_type,
  });
  if (!parsed.success) {
    res.status(400).json({ error: 'Filtros inválidos', details: parsed.error.flatten() });
    return;
  }
  const now = new Date();
  const from =
    parsed.data.date_from?.trim() ||
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
  const to =
    parsed.data.date_to?.trim() || new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90).toISOString();
  try {
    await assertAgendaView(req);
    let rows = await listAvailabilityBlocks(tenantId, {
      dateFromIso: from,
      dateToIso: to,
      userId: parsed.data.user_id,
      blockScope: parsed.data.block_scope,
      blockType: parsed.data.block_type,
    });
    const fullSettings = await hasSettingsEdit(req.userId!, req);
    if (!fullSettings) {
      rows = rows.filter((r) => r.block_scope === 'user' && r.user_id === req.userId);
    }
    res.json({ blocks: rows.map(rowToJson) });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] availability-blocks list', e);
    res.status(500).json({ error: 'Erro ao listar bloqueios' });
  }
}

/** POST /api/appointments/availability-blocks */
export async function createAvailabilityBlockHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const parsed = createBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  const b = parsed.data;
  try {
    await assertAgendaView(req);

    if (b.block_scope === 'tenant') {
      const ok = await canManageTenantScopedBlocks(req.userId, req);
      if (!ok) {
        res.status(403).json({ error: 'Sem permissão para criar bloqueio da empresa.' });
        return;
      }
    } else {
      const uid = b.user_id ?? req.userId;
      if (uid === req.userId) {
        try {
          await assertModulePermission(req.userId!, MODULE, 'create', undefined, req as AuthRequest);
        } catch (e) {
          if (e instanceof ModulePermissionError) {
            res.status(403).json({ error: 'Sem permissão para criar bloqueios na sua agenda.' });
            return;
          }
          throw e;
        }
      } else {
        const allow = await canActOnUserBlock(req.userId, uid, req);
        if (!allow) {
          res.status(403).json({ error: 'Sem permissão para criar bloqueio para este utilizador.' });
          return;
        }
      }
      const inT = await assertUserBelongsToTenant(uid, tenantId);
      if (!inT) {
        res.status(404).json({ error: 'Utilizador não encontrado nesta conta.' });
        return;
      }
    }

    const row = await createAvailabilityBlock(tenantId, {
      title: b.title,
      description: b.description,
      starts_at: b.starts_at,
      ends_at: b.ends_at,
      all_day: b.all_day,
      block_scope: b.block_scope,
      user_id: b.block_scope === 'user' ? (b.user_id ?? req.userId) : null,
      block_type: b.block_type,
      created_by: req.userId,
    });
    res.status(201).json({ block: rowToJson(row) });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] availability-blocks create', e);
    res.status(500).json({ error: 'Erro ao criar bloqueio' });
  }
}

/** PATCH /api/appointments/availability-blocks/:id */
export async function patchAvailabilityBlockHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  const parsed = patchBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    await assertAgendaView(req);
    const existing = await getAvailabilityBlockById(tenantId, id);
    if (!existing) {
      res.status(404).json({ error: 'Bloqueio não encontrado' });
      return;
    }
    await assertCanModifyBlock(req, existing, tenantId);

    const p = parsed.data;
    const nextScope = p.block_scope ?? existing.block_scope;
    if (nextScope === 'tenant') {
      const ok = await canManageTenantScopedBlocks(req.userId, req);
      if (!ok) {
        res.status(403).json({ error: 'Sem permissão para bloqueios da empresa.' });
        return;
      }
    } else {
      if (existing.block_scope === 'tenant' && p.block_scope === 'user' && !p.user_id) {
        res.status(400).json({ error: 'Informe o utilizador ao mudar de empresa para utilizador.' });
        return;
      }
      const targetUid = p.user_id ?? existing.user_id ?? req.userId;
      if (!targetUid) {
        res.status(400).json({ error: 'Informe o utilizador para bloqueio individual.' });
        return;
      }
      const allow = await canActOnUserBlock(req.userId, targetUid, req);
      if (!allow) {
        res.status(403).json({ error: 'Sem permissão para este bloqueio de utilizador.' });
        return;
      }
      const inT = await assertUserBelongsToTenant(targetUid, tenantId);
      if (!inT) {
        res.status(404).json({ error: 'Utilizador não encontrado nesta conta.' });
        return;
      }
    }

    const patchIn: Parameters<typeof patchAvailabilityBlock>[2] = { ...p };
    if (nextScope === 'tenant') {
      patchIn.user_id = null;
    } else if (p.user_id === undefined && existing.block_scope === 'user' && p.block_scope !== 'tenant') {
      patchIn.user_id = existing.user_id;
    } else if (nextScope === 'user' && p.block_scope === 'user' && p.user_id === undefined && !existing.user_id) {
      patchIn.user_id = req.userId;
    }

    const updated = await patchAvailabilityBlock(tenantId, id, patchIn);
    if (updated) {
      await normalizeBlockScopeRow(tenantId, id);
      const finalRow = await getAvailabilityBlockById(tenantId, id);
      res.json({ block: rowToJson(finalRow!) });
    } else {
      res.status(404).json({ error: 'Bloqueio não encontrado' });
    }
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] availability-blocks patch', e);
    res.status(500).json({ error: 'Erro ao atualizar bloqueio' });
  }
}

/** POST /api/appointments/availability-blocks/:id/cancel */
export async function cancelAvailabilityBlockHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  try {
    await assertAgendaView(req);
    const existing = await getAvailabilityBlockById(tenantId, id);
    if (!existing) {
      res.status(404).json({ error: 'Bloqueio não encontrado' });
      return;
    }
    await assertCanModifyBlock(req, existing, tenantId);
    const row = await cancelAvailabilityBlock(tenantId, id);
    if (!row) {
      res.status(404).json({ error: 'Bloqueio não encontrado' });
      return;
    }
    res.json({ block: rowToJson(row) });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] availability-blocks cancel', e);
    res.status(500).json({ error: 'Erro ao cancelar bloqueio' });
  }
}
