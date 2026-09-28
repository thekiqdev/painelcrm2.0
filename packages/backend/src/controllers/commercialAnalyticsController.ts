import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import {
  getCommercialMetrics,
  getCommercialOverridesReport,
} from '../services/commercialAnalyticsService.js';

/**
 * GET /api/superadmin/commercial/metrics
 */
export async function getSuperadminCommercialMetrics(req: AuthRequest, res: Response): Promise<void> {
  try {
    const metrics = await getCommercialMetrics();
    res.json(metrics);
  } catch (e: unknown) {
    console.error('[commercialAnalyticsController] getSuperadminCommercialMetrics', e);
    const msg = e instanceof Error ? e.message : 'Erro ao carregar métricas comerciais';
    res.status(500).json({ error: msg });
  }
}

/**
 * GET /api/superadmin/commercial/overrides/report
 */
export async function getSuperadminCommercialOverridesReport(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const report = await getCommercialOverridesReport();
    res.json({ items: report });
  } catch (e: unknown) {
    console.error('[commercialAnalyticsController] getSuperadminCommercialOverridesReport', e);
    const msg = e instanceof Error ? e.message : 'Erro ao carregar relatório de overrides';
    res.status(500).json({ error: msg });
  }
}
