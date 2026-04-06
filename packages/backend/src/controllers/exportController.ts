import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';

function escapeCsv(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * GET /api/superadmin/export/clients - CSV de clientes (tenants)
 */
export async function exportClients(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT t.id, t.name, t.slug, t.domain, t.status, t.trial_ends_at, t.created_at,
              p.name AS plan_name, p.slug AS plan_slug,
              (SELECT COUNT(*)::int FROM users u WHERE u.tenant_id = t.id) AS users_count
       FROM tenants t
       JOIN plans p ON p.id = t.plan_id
       ORDER BY t.name`
    );
    const headers = ['id', 'name', 'slug', 'domain', 'status', 'trial_ends_at', 'plan_name', 'users_count', 'created_at'];
    const rows = result.rows.map((r: Record<string, unknown>) =>
      headers.map((h) => escapeCsv(r[h])).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=clientes.csv');
    res.send('\uFEFF' + csv);
  } catch (error: any) {
    console.error('exportClients error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * GET /api/superadmin/export/plans - CSV de planos
 */
export async function exportPlans(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.slug, p.description, p.price_cents, p.billing_interval,
              p.max_users, p.max_profiles, p.is_active, p.sort_order, p.created_at,
              (SELECT COUNT(*)::int FROM tenants t WHERE t.plan_id = p.id) AS tenants_count
       FROM plans p
       ORDER BY p.sort_order, p.name`
    );
    const headers = ['id', 'name', 'slug', 'description', 'price_cents', 'billing_interval', 'max_users', 'max_profiles', 'is_active', 'tenants_count', 'created_at'];
    const rows = result.rows.map((r: Record<string, unknown>) =>
      headers.map((h) => escapeCsv(r[h])).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=planos.csv');
    res.send('\uFEFF' + csv);
  } catch (error: any) {
    console.error('exportPlans error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * GET /api/superadmin/export/usage - CSV de uso (tenants + usuários por plano)
 */
export async function exportUsage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT t.id AS tenant_id, t.name AS tenant_name, t.slug, t.status,
              p.name AS plan_name, p.max_users, p.max_profiles,
              (SELECT COUNT(*)::int FROM users u WHERE u.tenant_id = t.id) AS users_count,
              (SELECT COUNT(*)::int FROM user_profiles up JOIN users u ON u.id = up.owner_id WHERE u.tenant_id = t.id) AS profiles_count
       FROM tenants t
       JOIN plans p ON p.id = t.plan_id
       ORDER BY p.name, t.name`
    );
    const headers = ['tenant_id', 'tenant_name', 'slug', 'status', 'plan_name', 'max_users', 'max_profiles', 'users_count', 'profiles_count'];
    const rows = result.rows.map((r: Record<string, unknown>) =>
      headers.map((h) => escapeCsv(r[h])).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=uso.csv');
    res.send('\uFEFF' + csv);
  } catch (error: any) {
    console.error('exportUsage error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
