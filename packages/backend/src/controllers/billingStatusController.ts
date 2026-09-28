/**
 * GET /api/billing/:billingId/status — consulta status da cobrança (polling no checkout do plano).
 * - Com `tenant_billing_payment_attempts`: consulta o gateway em TODAS as tentativas abertas (PIX pago com cartão
 *   selecionado na UI continua sendo detectado).
 * - Ao detectar RECEIVED/CONFIRMED: consolida como nas faturas CRM (`runPostPaidCleanupForTenantBilling`: linha
 *   agregada + ativação + supersede das outras tentativas no gateway e no banco).
 */
import { Request, Response } from 'express';
import { syncAndGetTenantBillingStatusJson } from '../services/tenantBillingStatusSyncService.js';

export async function getBillingStatus(req: Request, res: Response): Promise<void> {
  const billingId = req.params.billingId;
  if (!billingId) {
    res.status(400).json({ error: 'billingId é obrigatório' });
    return;
  }

  try {
    const payload = await syncAndGetTenantBillingStatusJson(billingId);
    if (!payload) {
      res.status(404).json({ error: 'Cobrança não encontrada' });
      return;
    }
    res.json(payload);
  } catch (err) {
    console.error('[billingStatus]', err);
    res.status(500).json({ error: 'Erro ao consultar status da cobrança' });
  }
}
