/**
 * Endpoints para o módulo Financeiro (relatório unificado).
 * GET /billing-receipts: receitas de cobrança (customer_invoices com status=paid) do tenant.
 */
import type { Response } from 'express';
import { pool } from '../utils/db.js';
import type { AuthRequest } from '../middleware/auth.js';

export interface BillingReceiptRow {
  id: string;
  amount_cents: number;
  paid_at: string;
  invoice_number: string | null;
  client_id: string | null;
}

/** GET /api/finance/billing-receipts — lista cobranças pagas do tenant para o relatório financeiro. */
export async function getBillingReceipts(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Tenant não identificado' });
      return;
    }

    const { from, to } = req.query;
    const params: unknown[] = [tenantId];
    let dateClause = '';
    if (typeof from === 'string' && from.trim()) {
      params.push(from.trim());
      dateClause += ` AND (paid_at::date) >= $${params.length}::date`;
    }
    if (typeof to === 'string' && to.trim()) {
      params.push(to.trim());
      dateClause += ` AND (paid_at::date) <= $${params.length}::date`;
    }

    const r = await pool.query<BillingReceiptRow>(
      `SELECT id, amount_cents, paid_at, invoice_number, client_id
       FROM customer_invoices
       WHERE tenant_id = $1 AND status = 'paid' AND paid_at IS NOT NULL
       ${dateClause}
       ORDER BY paid_at DESC
       LIMIT 1000`,
      params
    );

    res.json(
      r.rows.map((row) => ({
        id: row.id,
        amount_cents: row.amount_cents,
        paid_at: row.paid_at,
        invoice_number: row.invoice_number,
        client_id: row.client_id,
      }))
    );
  } catch (err) {
    console.error('[financeController] getBillingReceipts error:', err);
    res.status(500).json({ error: 'Erro ao buscar receitas de cobrança' });
  }
}
