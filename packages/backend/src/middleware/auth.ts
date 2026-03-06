import { Request, Response, NextFunction } from 'express';
import type { PoolClient } from 'pg';
import { verifyToken } from '../utils/jwt.js';
import { pool, dbRequestStorage } from '../utils/db.js';
import { userHasFeature } from '../services/featureFlagService.js';
import { getTenantIdForUser } from '../utils/tenant.js';
import type { ModulePermissionsMap } from '../permissions/permissionTypes.js';

export interface AuthRequest extends Request {
  userId?: string;
  tenantId?: string | null;
  user?: {
    id: string;
    email: string;
    is_super_admin?: boolean;
  };
  /** Cache de permissões por userId no request (preenchido pelo permissionEngine). */
  permissionMap?: Record<string, ModulePermissionsMap>;
}

export async function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({ error: 'Authentication token required' });
      return;
    }

    const payload = verifyToken(token);
    
    // Verify user still exists and get is_super_admin
    const result = await pool.query(
      'SELECT id, email, is_super_admin FROM users WHERE id = $1',
      [payload.userId]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const row = result.rows[0];
    req.userId = row.id;
    req.user = {
      id: row.id,
      email: row.email,
      is_super_admin: row.is_super_admin === true,
    };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Middleware que define o tenant atual no request (req.tenantId).
 * Deve ser usado após authenticateToken nas rotas tenant-scoped.
 * Se o usuário não tiver tenant_id (ex.: superadmin), req.tenantId fica null.
 */
export async function setCurrentTenant(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    req.tenantId = await getTenantIdForUser(req.userId);
    next();
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Retorna o tenant_id do request (já definido por setCurrentTenant) ou null.
 */
export function getCurrentTenantId(req: AuthRequest): string | null {
  return req.tenantId ?? null;
}

/**
 * Retorna o tenant_id do request ou lança 403 se o usuário não estiver vinculado a um tenant.
 * Use em rotas que exigem tenant (ex.: listagens por conta).
 */
export function requireTenantId(req: AuthRequest, res: Response): string | null {
  const tenantId = req.tenantId ?? null;
  if (!tenantId) {
    res.status(403).json({ error: 'Usuário não vinculado a uma conta (tenant)' });
    return null;
  }
  return tenantId;
}

/**
 * Middleware que exige que o usuário tenha um tenant (req.tenantId).
 * Retorna 403 se for null. Usar após setCurrentTenant em rotas que obrigatoriamente precisam de tenant.
 */
export function requireTenant(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (req.tenantId == null) {
    res.status(403).json({ error: 'Usuário não vinculado a uma conta (tenant)' });
    return;
  }
  next();
}

/**
 * Middleware que exige que o usuário seja Super Admin.
 * Deve ser usado após authenticateToken nas rotas /api/superadmin.
 */
export function requireSuperAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user?.is_super_admin) {
    res.status(403).json({ error: 'Acesso restrito a Super Admin' });
    return;
  }
  next();
}

/**
 * Middleware que exige que o usuário tenha a feature indicada (plano/tenant).
 * Usar após authenticateToken. Retorna 403 se não tiver a feature.
 */
export function requireFeature(featureKey: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    try {
      const has = await userHasFeature(req.userId, featureKey);
      if (!has) {
        res.status(403).json({ error: `Recurso não disponível no seu plano: ${featureKey}` });
        return;
      }
      next();
    } catch (e) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * Etapa 5 RLS: define o client da conexão com SET LOCAL app.current_tenant_id e app.bypass_rls
 * para que as políticas RLS no banco apliquem o isolamento (ou bypass para superadmin).
 * Deve rodar após authenticateToken e, quando aplicável, após setCurrentTenant ou requireSuperAdmin.
 */
/** Escapa valor para uso em SET LOCAL (evita SQL injection; PostgreSQL não aceita $1 em SET). */
function escapeSetLocalValue(value: string): string {
  return (value ?? '').replace(/'/g, "''");
}

export async function setRequestDb(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.userId) {
    next();
    return;
  }
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (e) {
    console.error('setRequestDb: pool.connect failed', e);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
  let released = false;
  const releaseOnce = () => {
    if (!released) {
      released = true;
      client.release();
    }
  };
  res.once('finish', releaseOnce);
  try {
    const tenantIdValue = escapeSetLocalValue(req.tenantId ?? '');
    await client.query(`SET LOCAL app.current_tenant_id = '${tenantIdValue}'`);
    if (req.user?.is_super_admin) {
      await client.query("SET LOCAL app.bypass_rls = '1'");
    }
  } catch (e) {
    releaseOnce();
    console.error('setRequestDb: SET LOCAL failed', e);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
  dbRequestStorage.run({ client }, () => {
    next();
  });
}

/** Cadeia para rotas tenant-scoped: auth + tenant + RLS (SET LOCAL). */
export const tenantAuth = [authenticateToken, setCurrentTenant, setRequestDb];

/** Cadeia para rotas superadmin: auth + superadmin + RLS (bypass). */
export const superadminAuth = [authenticateToken, requireSuperAdmin, setRequestDb];


