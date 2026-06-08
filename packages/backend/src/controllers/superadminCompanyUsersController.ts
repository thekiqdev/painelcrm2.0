import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';
import {
  getSuperadminTenantUser,
  patchSuperadminTenantUser,
  patchSuperadminTenantUserSchema,
  resetPasswordSchema,
  resetSuperadminTenantUserPassword,
} from '../services/superadminCompanyUsersService.js';

export async function getSuperadminCompanyUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = String(req.params.tenantId ?? '');
    const userId = String(req.params.userId ?? '');
    const user = await getSuperadminTenantUser(tenantId, userId);
    if (!user) {
      res.status(404).json({ ok: false, error: 'Usuário não encontrado' });
      return;
    }
    res.json({ ok: true, user });
  } catch (e) {
    console.error('[superadmin/companies/users] get', e);
    res.status(500).json({ ok: false, error: 'Erro ao carregar usuário' });
  }
}

export async function patchSuperadminCompanyUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const actorUserId = req.userId;
    if (!actorUserId) {
      res.status(401).json({ ok: false, error: 'Não autenticado' });
      return;
    }
    const tenantId = String(req.params.tenantId ?? '');
    const userId = String(req.params.userId ?? '');
    const body = patchSuperadminTenantUserSchema.parse(req.body);
    const result = await patchSuperadminTenantUser({
      actorUserId,
      tenantId,
      targetUserId: userId,
      body,
    });
    if (!result.ok) {
      res.status(result.status).json({ ok: false, error: result.error });
      return;
    }
    res.json({ ok: true, user: result.user, changes: result.changes });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, error: e.errors[0]?.message ?? 'Dados inválidos' });
      return;
    }
    console.error('[superadmin/companies/users] patch', e);
    res.status(500).json({ ok: false, error: 'Erro ao atualizar usuário' });
  }
}

export async function postSuperadminCompanyUserResetPassword(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const actorUserId = req.userId;
    if (!actorUserId) {
      res.status(401).json({ ok: false, error: 'Não autenticado' });
      return;
    }
    const tenantId = String(req.params.tenantId ?? '');
    const userId = String(req.params.userId ?? '');
    const body = resetPasswordSchema.parse(req.body);
    const result = await resetSuperadminTenantUserPassword({
      actorUserId,
      tenantId,
      targetUserId: userId,
      newPassword: body.new_password,
    });
    if (!result.ok) {
      res.status(result.status).json({ ok: false, error: result.error });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, error: e.errors[0]?.message ?? 'Dados inválidos' });
      return;
    }
    console.error('[superadmin/companies/users] reset-password', e);
    res.status(500).json({ ok: false, error: 'Erro ao redefinir senha' });
  }
}
