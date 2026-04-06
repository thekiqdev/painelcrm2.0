/**
 * Reconciliação de pagamentos: vincula invoices pending sem gateway_reference_id ao pagamento já criado no gateway.
 * Edge case: worker criou a invoice e chamou createCharge, mas crashou antes de salvar gateway_reference_id.
 * Executar a cada ~30 min (cron). Rechama createCharge com a mesma idempotency_key; o gateway retorna o pagamento existente.
 */
import { pool } from '../utils/db.js';
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import { updateInvoiceGatewayData } from './invoiceService.js';
import { getActiveConfig } from './paymentGatewayConfigService.js';
import { billingLog } from './billingLogger.js';

export interface PendingInvoiceRow {
  id: string;
  tenant_id: string;
  amount_cents: number;
  due_date: string;
  idempotency_key: string | null;
  invoice_number: string | null;
  payment_method: string | null;
  gateway: string | null;
}

/**
 * Busca invoices pending sem gateway_reference_id, com idempotency_key, criadas nas últimas 24h.
 */
export async function getPendingInvoicesWithoutPaymentId(): Promise<PendingInvoiceRow[]> {
  const r = await pool.query<PendingInvoiceRow>(
    `SELECT id, tenant_id, amount_cents, due_date, idempotency_key, invoice_number, payment_method, gateway
     FROM tenant_billing
     WHERE status = 'pending'
       AND gateway_reference_id IS NULL
       AND idempotency_key IS NOT NULL
       AND created_at > now() - interval '1 day'
     ORDER BY created_at ASC
     LIMIT 100`
  );
  return r.rows;
}

/**
 * Executa uma rodada de reconciliação: para cada invoice pendente sem payment_id, rechama o gateway
 * com a mesma idempotency_key (retorna o pagamento existente) e persiste gateway_reference_id.
 */
export async function runReconciliation(): Promise<{ processed: number; failed: number; skipped: number }> {
  const invoices = await getPendingInvoicesWithoutPaymentId();
  const result = { processed: 0, failed: 0, skipped: 0 };

  billingLog('reconciliation', 'run_start', { count: invoices.length });

  for (const inv of invoices) {
    if (!inv.idempotency_key) {
      result.skipped++;
      continue;
    }
    const gateway = await getActiveGateway({ billingType: 'saas', tenantId: inv.tenant_id });
    if (!gateway) {
      result.skipped++;
      continue;
    }
    try {
      const customerId = await gateway.ensureCustomer?.(inv.tenant_id);
      if (!customerId) {
        result.skipped++;
        continue;
      }
      const chargeResult = await gateway.createCharge({
        customerId,
        amountCents: inv.amount_cents,
        dueDate: inv.due_date,
        paymentMethod: (inv.payment_method as 'PIX' | 'BOLETO' | 'CREDIT_CARD') ?? 'BOLETO',
        description: inv.invoice_number ?? `Reconciliação ${inv.due_date}`,
        idempotencyKey: inv.idempotency_key,
        externalReference: inv.tenant_id,
      });
      const config = await getActiveConfig('saas');
      const gatewayKey = config?.gateway_key ?? inv.gateway ?? 'asaas';
      await updateInvoiceGatewayData(inv.id, {
        gateway: gatewayKey,
        payment_method: inv.payment_method,
        gateway_reference_id: chargeResult.paymentId,
        gateway_status: chargeResult.status,
        idempotency_key: inv.idempotency_key,
      });
      result.processed++;
      billingLog('reconciliation', 'invoice_linked', {
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number ?? undefined,
        amount: inv.amount_cents,
      });
    } catch (err) {
      result.failed++;
      billingLog('job', 'reconciliation_error', {
        invoiceId: inv.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  billingLog('reconciliation', 'run_done', result);
  return result;
}
