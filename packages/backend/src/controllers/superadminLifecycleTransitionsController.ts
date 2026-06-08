/**
 * GET /api/superadmin/lifecycle/transitions — dashboard observacional Sprint J.
 */
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { listSuperadminLifecycleTransitions } from '../services/superadminLifecycleTransitionsService.js';

function pickQueryString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function getSuperadminLifecycleTransitions(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user?.is_super_admin) {
      res.status(403).json({ error: 'Acesso restrito a super administradores' });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = parseInt(String(req.query.limit), 10) || 50;
    const order = req.query.order === 'asc' ? 'asc' : 'desc';
    const sort = 'created_at' as const;

    const filters = {
      eventType: pickQueryString(req.query.event_type),
      result: pickQueryString(req.query.result),
      tenantQuery: pickQueryString(req.query.tenant),
      leadQuery: pickQueryString(req.query.lead),
      from: pickQueryString(req.query.from),
      to: pickQueryString(req.query.to),
      page,
      limit,
      sort,
      order: order as 'asc' | 'desc',
    };

    console.info('[lifecycle_dashboard] access', {
      user_id: req.user.id,
      filters: {
        event_type: filters.eventType,
        result: filters.result,
        tenant: filters.tenantQuery,
        lead: filters.leadQuery,
        from: filters.from,
        to: filters.to,
        page: filters.page,
        limit: filters.limit,
        sort: filters.sort,
        order: filters.order,
      },
    });

    const payload = await listSuperadminLifecycleTransitions(filters);
    res.json(payload);
  } catch (e) {
    console.error('[lifecycle_dashboard] list_error', e);
    res.status(500).json({ error: 'Erro ao carregar transições do lifecycle' });
  }
}
