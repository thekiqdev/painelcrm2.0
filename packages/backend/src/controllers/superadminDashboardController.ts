import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { getSuperadminDashboardSnapshot } from '../services/superadminDashboardService.js';

/**
 * GET /api/superadmin/dashboard
 * Dashboard consolidado para Super Admin, mantendo campos legados para compatibilidade.
 */
export async function getSuperadminDashboard(req: AuthRequest, res: Response): Promise<void> {
  try {
    const payload = await getSuperadminDashboardSnapshot();
    res.json(payload);
  } catch (e: unknown) {
    console.error('[superadminDashboard] getSuperadminDashboard', e);
    const msg = e instanceof Error ? e.message : 'Erro ao carregar dashboard superadmin';
    res.status(500).json({ error: msg });
  }
}

