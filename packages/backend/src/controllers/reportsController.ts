import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';

/**
 * GET /api/superadmin/reports
 * Métricas: adoção por plano, receita (estimada), churn (tenants inativos/suspensos).
 */
export async function getReports(req: AuthRequest, res: Response): Promise<void> {
  try {
    const [adoption, revenue, churn] = await Promise.all([
      pool.query(
        `SELECT p.id, p.name, p.slug, COUNT(t.id)::int AS tenants_count
         FROM plans p
         LEFT JOIN tenants t ON t.plan_id = p.id AND t.status = 'active'
         GROUP BY p.id, p.name, p.slug
         ORDER BY p.sort_order, p.name`
      ).then((r) => r.rows),
      pool.query(
        `SELECT p.id, p.name, p.slug, p.price_cents, p.billing_interval,
                COUNT(t.id)::int AS active_tenants,
                (COUNT(t.id) * p.price_cents)::bigint AS revenue_cents
         FROM plans p
         LEFT JOIN tenants t ON t.plan_id = p.id AND t.status = 'active'
         GROUP BY p.id, p.name, p.slug, p.price_cents, p.billing_interval
         ORDER BY p.sort_order`
      ).then((r) => r.rows),
      pool.query(
        `SELECT status, COUNT(*)::int AS count FROM tenants GROUP BY status`
      ).then((r) => r.rows),
    ]);

    const churnByStatus: Record<string, number> = {};
    churn.forEach((row: { status: string; count: number }) => {
      churnByStatus[row.status] = row.count;
    });

    res.json({
      adoption,
      revenue,
      churn: churnByStatus,
      totals: {
        tenants_active: churnByStatus.active ?? 0,
        tenants_suspended: churnByStatus.suspended ?? 0,
        tenants_trial: churnByStatus.trial ?? 0,
      },
    });
  } catch (error: any) {
    console.error('getReports error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
