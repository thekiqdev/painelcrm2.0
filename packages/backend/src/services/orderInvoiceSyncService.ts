/**
 * Sincroniza pedidos (orders) com o status financeiro da fatura CRM vinculada (customer_invoice_id).
 * Política fechada: ver EXECUCAO_ETAPA_PEDIDOS_LOJA.md
 *
 * Webhooks e rotinas sem `setRequestDb` não têm `app.current_tenant_id`. Com RLS ativo, um `SELECT` em
 * `customer_invoices` ou um `UPDATE` em `orders` sem contexto tende a não enxergar linhas (0 atualizadas).
 * Usamos `withBillingWorkerRlsBypass` — o mesmo padrão de jobs de billing — para aplicar o UPDATE de forma confiável e centralizada.
 */
import { pool, withBillingWorkerRlsBypass } from '../utils/db.js';

export function mapCustomerInvoiceStatusToOrderFields(invoiceStatus: string): {
  payment_status: string;
  status: string;
} {
  const s = String(invoiceStatus || '').toLowerCase().trim();
  if (s === 'paid') {
    return { payment_status: 'paid', status: 'processing' };
  }
  if (s === 'cancelled') {
    return { payment_status: 'failed', status: 'cancelled' };
  }
  if (s === 'failed' || s === 'refunded') {
    return { payment_status: 'failed', status: 'cancelled' };
  }
  return { payment_status: 'pending', status: 'pending' };
}

/**
 * Atualiza todos os pedidos ligados à fatura. Idempotente (reaplicar o mesmo status é seguro).
 */
export async function syncOrdersFromCustomerInvoiceStatus(
  invoiceId: string,
  invoiceStatus: string
): Promise<void> {
  await withBillingWorkerRlsBypass(async () => {
    const exists = await pool.query(`SELECT 1 FROM customer_invoices WHERE id = $1 LIMIT 1`, [invoiceId]);
    if (exists.rowCount === 0) {
      console.warn('[orderInvoiceSync] Fatura não encontrada; sync de pedido ignorado.', { invoiceId });
      return;
    }

    const { payment_status, status } = mapCustomerInvoiceStatusToOrderFields(invoiceStatus);

    await pool.query(
      `UPDATE orders
       SET payment_status = $1, status = $2, updated_at = now()
       WHERE customer_invoice_id = $3`,
      [payment_status, status, invoiceId]
    );
  });
}
