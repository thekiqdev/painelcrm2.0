import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * GET /api/superadmin/audit-log
 * Listagem paginada do log de auditoria.
 * Query: page=1, limit=50, entity_type=tenant, entity_id=xxx
 */
export async function getAuditLog(req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(String(req.query.limit), 10) || DEFAULT_LIMIT));
    const offset = (page - 1) * limit;
    const entityType = typeof req.query.entity_type === 'string' ? req.query.entity_type.trim() : null;
    const entityId = typeof req.query.entity_id === 'string' ? req.query.entity_id.trim() : null;

    let whereClause = '1=1';
    const params: any[] = [];
    let i = 1;
    if (entityType) {
      whereClause += ` AND a.entity_type = $${i++}`;
      params.push(entityType);
    }
    if (entityId) {
      whereClause += ` AND a.entity_id = $${i++}`;
      params.push(entityId);
    }
    const countParams = [...params];
    params.push(limit, offset);

    const [rowsResult, totalResult] = await Promise.all([
      pool.query(
        `SELECT a.id, a.user_id, a.action, a.entity_type, a.entity_id, a.payload, a.created_at,
                u.email AS user_email
         FROM super_admin_audit_log a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE ${whereClause}
         ORDER BY a.created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        params
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM super_admin_audit_log a WHERE ${whereClause}`,
        countParams
      ),
    ]);

    const total = totalResult.rows[0]?.c ?? 0;
    res.json({
      items: rowsResult.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('getAuditLog error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
