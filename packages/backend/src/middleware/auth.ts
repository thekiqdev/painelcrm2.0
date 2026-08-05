import { Request, Response, NextFunction } from 'express';
import type { PoolClient } from 'pg';
import { verifyToken } from '../utils/jwt.js';
import { pool, dbRequestStorage } from '../utils/db.js';
import { userHasFeature } from '../services/featureFlagService.js';
import { isPhase2TrialCrmGateEnabled } from '../config/checkoutTrialFeatureFlags.js';
import { getTenantIdForUser } from '../utils/tenant.js';
import type { ModulePermissionsMap } from '../permissions/permissionTypes.js';
import { bindRequestContext } from './bindRequestContext.js';

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
 * Autenticação opcional: se houver Authorization válido, preenche req.userId e req.tenantId.
 * Se não houver token ou for inválido, segue sem preencher (não retorna 401).
 * Útil para rotas que aceitam chamada logada ou anônima (ex.: POST /api/plan-purchase).
 */
export async function optionalAuthenticateAndTenant(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    next();
    return;
  }
  try {
    const payload = verifyToken(token);
    const result = await pool.query(
      'SELECT id, email, is_super_admin FROM users WHERE id = $1',
      [payload.userId]
    );
    if (result.rows.length === 0) {
      next();
      return;
    }
    const row = result.rows[0];
    req.userId = row.id;
    req.user = {
      id: row.id,
      email: row.email,
      is_super_admin: row.is_super_admin === true,
    };
    req.tenantId = await getTenantIdForUser(row.id);
  } catch {
    // token inválido ou expirado: segue sem user/tenant
  }
  next();
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
    res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
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
    res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
    return;
  }
  next();
}

/**
 * Bloqueia o app CRM (clientes, leads, chat, etc.) quando não há tenant no contexto.
 * Super admin de plataforma (sem tenant_id) deve usar apenas /api/superadmin.
 * Não incluir em /api/auth/me, /api/profile, /api/onboarding (exceto onde o fluxo já exige tenant), /api/me/tenant.
 */
export function requireTenantForBusinessApp(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const tid = req.tenantId;
  if (tid != null && String(tid).length > 0) {
    next();
    return;
  }
  res.status(403).json({ error: 'TENANT_REQUIRED_FOR_OPERATION' });
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
    const actorIdValue = escapeSetLocalValue(req.userId);
    await client.query(`SET LOCAL app.actor_user_id = '${actorIdValue}'`);
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

/**
 * Bloqueia uso do CRM quando trial acabou sem pagamento ou conta suspensa por trial expirado.
 * Rotas de cobrança/checkout ficam fora desta cadeia (plan-purchase, billing status, auth/me).
 */
export async function requireTenantCommercialAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.tenantId) {
    next();
    return;
  }
  if (req.user?.is_super_admin) {
    next();
    return;
  }
  if (!isPhase2TrialCrmGateEnabled()) {
    next();
    return;
  }
  try {
    const row = await pool.query<{
      status: string;
      suspension_reason: string | null;
      trial_ends_at: string | null;
      activated_billing_id: string | null;
    }>(
      `SELECT status, suspension_reason, trial_ends_at, activated_billing_id
       FROM tenants WHERE id = $1`,
      [req.tenantId]
    );
    const t = row.rows[0];
    if (!t) {
      next();
      return;
    }

    if (t.activated_billing_id || t.status === 'active') {
      next();
      return;
    }

    const trialEndedUnpaid =
      t.status === 'trial' &&
      t.trial_ends_at != null &&
      new Date(t.trial_ends_at) < new Date() &&
      t.activated_billing_id == null;

    const trialEndedWhilePaymentPending =
      t.status === 'payment_pending' &&
      t.trial_ends_at != null &&
      new Date(t.trial_ends_at) < new Date() &&
      t.activated_billing_id == null;

    if (
      trialEndedUnpaid ||
      trialEndedWhilePaymentPending ||
      (t.status === 'suspended' && t.suspension_reason === 'trial_expired')
    ) {
      res.status(403).json({
        error: 'Período de trial encerrado. Conclua o pagamento para continuar.',
        code: 'TRIAL_EXPIRED',
        requires_checkout_resume: true,
      });
      return;
    }

    next();
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Middleware que bloqueia acesso se o período do plano do tenant estiver expirado (plan_period_end < now()).
 * Retorna 402 com code PLAN_EXPIRED para o front redirecionar para /meu-plano.
 * Se o tenant não tiver plan_period_end (ex.: trial legado), permite.
 */
export async function requireActivePlanPeriod(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.tenantId) {
    next();
    return;
  }
  try {
    const row = await pool.query<{ plan_period_end: string | null }>(
      'SELECT plan_period_end FROM tenants WHERE id = $1',
      [req.tenantId]
    );
    const periodEnd = row.rows[0]?.plan_period_end;
    if (!periodEnd) {
      next();
      return;
    }
    const end = new Date(periodEnd);
    if (end < new Date()) {
      res.status(402).json({
        error: 'Período do plano expirado. Renove para continuar acessando.',
        code: 'PLAN_EXPIRED',
        redirect: '/meu-plano',
      });
      return;
    }
    next();
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Hub comercial (Meu plano / retomada): auth + tenant + RLS, sem bloquear trial expirado.
 * Usado em GET/PUT /api/me/tenant/plan para o primary conseguir ver o plano e ir ao checkout.
 */
export const tenantAuthCommercialHub = [
  authenticateToken,
  setCurrentTenant,
  bindRequestContext,
  requireTenantForBusinessApp,
  setRequestDb,
];

/**
 * Contexto de sessão para /api/auth/me e /me/features: sem gate comercial nem exigência de período ativo.
 * Trial expirado precisa receber 200 com requires_checkout_resume (o CRM continua bloqueado em outras rotas).
 */
export const authSessionContext = [authenticateToken, setCurrentTenant, bindRequestContext];

/** Cadeia para rotas tenant-scoped: auth + tenant + período ativo + RLS (SET LOCAL). */
export const tenantAuth = [
  authenticateToken,
  setCurrentTenant,
  bindRequestContext,
  requireTenantCommercialAccess,
  requireActivePlanPeriod,
  setRequestDb,
];

/** Como tenantAuth, mas exige tenant (bloqueia super admin sem conta CRM). */
export const tenantAuthCrm = [
  authenticateToken,
  setCurrentTenant,
  bindRequestContext,
  requireTenantForBusinessApp,
  requireTenantCommercialAccess,
  requireActivePlanPeriod,
  setRequestDb,
];

/** CRM com feature "agenda" (módulo Agenda / compromissos). */
export const appointmentsAuth = [
  authenticateToken,
  setCurrentTenant,
  bindRequestContext,
  requireTenantForBusinessApp,
  requireTenantCommercialAccess,
  requireActivePlanPeriod,
  requireFeature('agenda'),
  setRequestDb,
];

/** CRM com feature "chatbot_flows" (editor visual de fluxos). */
export const chatbotFlowsAuth = [
  authenticateToken,
  setCurrentTenant,
  bindRequestContext,
  requireTenantForBusinessApp,
  requireTenantCommercialAccess,
  requireActivePlanPeriod,
  requireFeature('chatbot_flows'),
  setRequestDb,
];

/** Cadeia para rotas superadmin: auth + superadmin + RLS (bypass). */
export const superadminAuth = [authenticateToken, requireSuperAdmin, bindRequestContext, setRequestDb];


