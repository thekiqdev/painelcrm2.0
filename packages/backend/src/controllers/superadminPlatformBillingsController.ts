/**
 * GET /api/superadmin/platform-billings — listagem global tenant_billing (somente leitura).
 */
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import {
  getSuperadminPlatformBillingDetail,
  listSuperadminPlatformBillings,
} from '../services/superadminPlatformBillingsService.js';
import { ensureTenantBillingPublicPayToken } from '../services/invoiceService.js';
import { buildPlatformSaasInvoiceUrl } from '../utils/saasPlatformInvoiceUrl.js';

export async function getSuperadminPlatformBillings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const tenant_id = typeof req.query.tenant_id === 'string' ? req.query.tenant_id : null;
    const from = typeof req.query.from === 'string' ? req.query.from : null;
    const to = typeof req.query.to === 'string' ? req.query.to : null;
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
    const offset = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : 0;

    const { rows, total } = await listSuperadminPlatformBillings({
      status,
      tenantId: tenant_id,
      from,
      to,
      limit,
      offset,
    });
    res.json({ billings: rows, total, limit: Math.min(100, Number.isFinite(limit) ? limit : 50), offset });
  } catch (e) {
    console.error('[superadminPlatformBillings]', e);
    res.status(500).json({ error: 'Erro ao listar cobranças da plataforma' });
  }
}

export async function getSuperadminPlatformBillingById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id obrigatório' });
      return;
    }
    const row = await getSuperadminPlatformBillingDetail(id);
    if (!row) {
      res.status(404).json({ error: 'Cobrança não encontrada' });
      return;
    }
    res.json({ billing: row });
  } catch (e) {
    console.error('[superadminPlatformBillingById]', e);
    res.status(500).json({ error: 'Erro ao carregar cobrança' });
  }
}

/** POST /api/superadmin/platform-billings/:id/public-link — garante token e devolve URL (operação idempotente). */
export async function postSuperadminPlatformBillingEnsurePublicLink(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id obrigatório' });
      return;
    }
    const token = await ensureTenantBillingPublicPayToken(id);
    res.json({ platform_invoice_url: buildPlatformSaasInvoiceUrl(token) });
  } catch (e) {
    console.error('[ensurePublicLink]', e);
    res.status(500).json({ error: 'Não foi possível gerar o link público' });
  }
}
