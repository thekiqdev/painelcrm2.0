/**
 * GET /api/billing/:billingId/status — consulta status da cobrança (para polling após PIX).
 * Se status no banco for "paid", retorna { status: "paid" }.
 * Se status for "pending", consulta a API do Asaas pelo payment_id; se RECEIVED/CONFIRMED,
 * atualiza a cobrança para paid, chama ativação do plano (idempotente) e retorna { status: "paid" }.
 * Assim o fluxo funciona mesmo quando o webhook não está disponível (ex.: ambiente local).
 */
import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import { updateInvoiceStatus } from '../services/invoiceService.js';
import { activatePlanFromBilling } from '../services/subscriptionService.js';

export async function getBillingStatus(req: Request, res: Response): Promise<void> {
  const billingId = req.params.billingId;
  if (!billingId) {
    res.status(400).json({ error: 'billingId é obrigatório' });
    return;
  }

  try {
    const result = await pool.query<{
      id: string;
      status: string;
      tenant_id: string;
      asaas_payment_id: string | null;
      gateway: string | null;
      tenant_status: string | null;
    }>(
      `SELECT b.id, b.status, b.tenant_id, b.asaas_payment_id, b.gateway, t.status AS tenant_status
       FROM tenant_billing b
       LEFT JOIN tenants t ON t.id = b.tenant_id
       WHERE b.id = $1`,
      [billingId]
    );

    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: 'Cobrança não encontrada' });
      return;
    }

    if (row.status === 'paid') {
      res.json({
        billing_id: row.id,
        status: 'paid',
        tenant_status: row.tenant_status ?? null,
      });
      return;
    }

    if (row.status === 'pending' && row.asaas_payment_id && row.gateway === 'asaas') {
      const gateway = await getActiveGateway({ billingType: 'saas', tenantId: row.tenant_id });
      if (gateway?.getPayment) {
        const payment = await gateway.getPayment(row.asaas_payment_id);
        const asaasStatus = payment?.status?.toUpperCase?.() ?? '';
        if (asaasStatus === 'RECEIVED' || asaasStatus === 'CONFIRMED') {
          await updateInvoiceStatus(billingId, 'paid', new Date(), 'PIX');
          await activatePlanFromBilling(billingId);
          const updated = await pool.query<{ tenant_status: string | null }>(
            `SELECT t.status AS tenant_status FROM tenant_billing b LEFT JOIN tenants t ON t.id = b.tenant_id WHERE b.id = $1`,
            [billingId]
          );
          res.json({
            billing_id: row.id,
            status: 'paid',
            tenant_status: updated.rows[0]?.tenant_status ?? 'active',
          });
          return;
        }
      }
    }

    res.json({
      billing_id: row.id,
      status: row.status,
      tenant_status: row.tenant_status ?? null,
    });
  } catch (err) {
    console.error('[billingStatus]', err);
    res.status(500).json({ error: 'Erro ao consultar status da cobrança' });
  }
}
