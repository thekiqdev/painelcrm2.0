/**
 * Controllers domínio personalizado do tenant.
 * Rotas: /api/me/tenant/domain* e /api/superadmin/tenants/:id/domain*
 */
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantId } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { checkDomainVerifyRateLimit } from '../middleware/domainVerifyRateLimit.js';
import { logSuperAdminAction } from '../services/auditLogService.js';
import { TenantDomainError } from './tenantDomainErrors.js';
import { logTenantDomain } from './tenantDomainLogger.js';
import {
  clearTenantDomain,
  clearTenantDomainAsAdmin,
  changeTenantHostRole,
  getTenantDomainInstructions,
  listTenantHostsForAdmin,
  setTenantDomain,
  verifyTenantDomain,
} from './tenantDomainService.js';

function handleErr(err: unknown, res: Response): void {
  if (err instanceof TenantDomainError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof ModulePermissionError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: 'Payload inválido', details: err.flatten() });
    return;
  }
  console.error('[tenant-domain]', err);
  res.status(500).json({ error: (err as Error)?.message || 'Internal server error' });
}

const setBodySchema = z.object({
  hostname: z.string().min(3),
  role: z.enum(['store', 'support']),
});

const roleQuerySchema = z.object({
  role: z.enum(['store', 'support']).optional(),
  id: z.string().uuid().optional(),
});

/** GET /api/me/tenant/domain — lista ou um papel (?role=) */
export async function getMyTenantDomain(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const role =
      typeof req.query.role === 'string' && (req.query.role === 'store' || req.query.role === 'support')
        ? req.query.role
        : null;
    const data = await getTenantDomainInstructions(tenantId, role);
    if (role) {
      res.json(data ?? { hostname: null, role, status: 'none' });
      return;
    }
    res.json({ items: data ?? [] });
  } catch (err) {
    handleErr(err, res);
  }
}

/** POST /api/me/tenant/domain */
export async function postMyTenantDomain(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    await assertModulePermission(userId, 'settings', 'edit', undefined, req);

    const parsed = setBodySchema.parse(req.body);
    const instructions = await setTenantDomain({
      tenantId,
      hostnameRaw: parsed.hostname,
      role: parsed.role,
    });
    logTenantDomain('domain_set', {
      tenant_id: tenantId,
      user_id: userId,
      role: instructions.role,
      hostname: instructions.hostname,
      status: instructions.status,
    });
    res.status(201).json(instructions);
  } catch (err) {
    if (err instanceof TenantDomainError && err.code.startsWith('DOMAIN_TAKEN')) {
      logTenantDomain('domain_collision', {
        code: err.code,
        tenant_id: req.tenantId,
      });
    }
    handleErr(err, res);
  }
}

/** POST /api/me/tenant/domain/verify */
export async function postMyTenantDomainVerify(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    await assertModulePermission(userId, 'settings', 'edit', undefined, req);

    if (!checkDomainVerifyRateLimit(`tenant:${tenantId}`)) {
      logTenantDomain('domain_verify_rate_limited', { tenant_id: tenantId });
      res.status(429).json({
        error: 'Máximo de verificações DNS por minuto atingido. Tente novamente em instantes.',
        code: 'RATE_LIMITED',
      });
      return;
    }

    const role = z.enum(['store', 'support']).parse(req.body?.role ?? req.query.role);
    const result = await verifyTenantDomain({ tenantId, role });
    logTenantDomain('domain_verify', {
      tenant_id: tenantId,
      user_id: userId,
      role,
      verified: result.verified,
      method: result.method,
      status: result.status,
    });
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
}

/** POST /api/me/tenant/domain/change-role — TD12 */
export async function postMyTenantDomainChangeRole(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    await assertModulePermission(userId, 'settings', 'edit', undefined, req);

    const parsed = z
      .object({
        from_role: z.enum(['store', 'support']),
        to_role: z.enum(['store', 'support']),
      })
      .parse(req.body);
    const instructions = await changeTenantHostRole({
      tenantId,
      fromRole: parsed.from_role,
      toRole: parsed.to_role,
    });
    logTenantDomain('domain_change_role', {
      tenant_id: tenantId,
      user_id: userId,
      from_role: parsed.from_role,
      to_role: parsed.to_role,
      hostname: instructions.hostname,
    });
    res.json(instructions);
  } catch (err) {
    handleErr(err, res);
  }
}

/** DELETE /api/me/tenant/domain?role= | ?id= */
export async function deleteMyTenantDomain(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    await assertModulePermission(userId, 'settings', 'edit', undefined, req);

    const parsed = roleQuerySchema.parse({
      role: req.query.role,
      id: req.query.id,
    });
    await clearTenantDomain({
      tenantId,
      role: parsed.role ?? null,
      hostId: parsed.id ?? null,
    });
    logTenantDomain('domain_clear', {
      tenant_id: tenantId,
      user_id: userId,
      role: parsed.role ?? null,
      host_id: parsed.id ?? null,
    });
    res.json({ ok: true });
  } catch (err) {
    handleErr(err, res);
  }
}

/** GET /api/superadmin/tenants/:id/domain */
export async function superadminGetTenantDomain(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.params.id;
    const items = await listTenantHostsForAdmin(tenantId);
    res.json({ items });
  } catch (err) {
    handleErr(err, res);
  }
}

/** DELETE /api/superadmin/tenants/:id/domain?role=|&id= */
export async function superadminClearTenantDomain(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.params.id;
    const parsed = roleQuerySchema.parse({
      role: req.query.role,
      id: req.query.id,
    });
    await clearTenantDomainAsAdmin({
      tenantId,
      role: parsed.role ?? null,
      hostId: parsed.id ?? null,
    });
    if (req.userId) {
      await logSuperAdminAction(
        req.userId,
        'tenant.custom_domain_cleared',
        'tenant',
        tenantId,
        { role: parsed.role ?? null, hostId: parsed.id ?? null }
      );
    }
    logTenantDomain('domain_clear_admin', {
      tenant_id: tenantId,
      role: parsed.role ?? null,
      host_id: parsed.id ?? null,
    });
    res.json({ ok: true });
  } catch (err) {
    handleErr(err, res);
  }
}
