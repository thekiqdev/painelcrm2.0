import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import { SQL_T_IS_PLATFORM_CUSTOMER } from '../partner/superadminTenantListScope.js';

/**
 * GET /api/superadmin/me
 * Confirma que o usuário é super admin e retorna dados básicos.
 * Só é alcançado se passar por authenticateToken + requireSuperAdmin.
 */
export async function getSuperAdminMe(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  res.json({
    ok: true,
    is_super_admin: true,
    user_id: authReq.userId,
    email: authReq.user?.email,
  });
}

/**
 * GET /api/superadmin/dashboard
 * Totais e últimos cadastros para o dashboard do Super Admin.
 */
export async function getDashboard(req: Request, res: Response): Promise<void> {
  try {
    const [plansCount, tenantsCount, activeTenantsCount, usersCount, recentTenants, recentUsers] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM plans').then((r) => r.rows[0]?.c ?? 0),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM tenants t WHERE ${SQL_T_IS_PLATFORM_CUSTOMER}`
      ).then((r) => r.rows[0]?.c ?? 0),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM tenants t WHERE t.status = 'active' AND ${SQL_T_IS_PLATFORM_CUSTOMER}`
      ).then((r) => r.rows[0]?.c ?? 0),
      pool.query(
        `SELECT COUNT(*)::int AS c
         FROM users u
         INNER JOIN tenants t ON t.id = u.tenant_id AND ${SQL_T_IS_PLATFORM_CUSTOMER}`
      ).then((r) => r.rows[0]?.c ?? 0),
      pool.query(
        `SELECT t.id, t.name, t.slug, t.status, t.created_at, p.name AS plan_name
         FROM tenants t
         JOIN plans p ON p.id = t.plan_id
         WHERE ${SQL_T_IS_PLATFORM_CUSTOMER}
         ORDER BY t.created_at DESC LIMIT 10`
      ).then((r) => r.rows),
      pool.query(
        `SELECT u.id, u.email, u.created_at, t.name AS tenant_name
         FROM users u
         INNER JOIN tenants t ON t.id = u.tenant_id AND ${SQL_T_IS_PLATFORM_CUSTOMER}
         ORDER BY u.created_at DESC LIMIT 10`
      ).then((r) => r.rows),
    ]);

    res.json({
      totals: {
        plans: plansCount,
        tenants: tenantsCount,
        active_tenants: activeTenantsCount,
        users: usersCount,
      },
      recent_tenants: recentTenants,
      recent_users: recentUsers,
    });
  } catch (error: any) {
    console.error('getDashboard error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
