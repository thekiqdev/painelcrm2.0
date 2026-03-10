/**
 * GET /api/billing/:billingId/status — consulta status da cobrança (para polling após PIX).
 * Retorna billing_id, status (pending | paid | overdue), tenant_status.
 * Rota pública: quem tem o billingId (retornado no plan-purchase) pode consultar.
 */
import { Request, Response } from 'express';
import { pool } from '../utils/db.js';

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
      tenant_status: string | null;
    }>(
      `SELECT b.id, b.status, t.status AS tenant_status
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
