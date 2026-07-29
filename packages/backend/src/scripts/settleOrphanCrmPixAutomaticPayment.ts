/**
 * Recupera liquidação do 1º pagamento Pix Automático CRM quando o webhook
 * PAYMENT_RECEIVED chegou órfão (sem externalReference / paymentId novo).
 *
 * **Não** reenvie o mesmo webhook Asaas (idempotência ignora reprocessamento).
 *
 * Uso (cwd packages/backend):
 *   npx tsx src/scripts/settleOrphanCrmPixAutomaticPayment.ts \
 *     --paymentId=pay_xxx \
 *     --pixQrCodeId=...ASA \
 *     [--conciliationId=...] \
 *     [--invoiceId=uuid] \
 *     [--authorizationId=...]
 *
 * Em Docker (dist):
 *   node dist/scripts/settleOrphanCrmPixAutomaticPayment.js --paymentId=... --pixQrCodeId=...
 */
import { settleOrphanPixAutomaticCustomerInvoice } from '../services/crm/crmPixAutomaticService.js';

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() || null : null;
}

async function main(): Promise<void> {
  const paymentId = arg('paymentId');
  if (!paymentId) {
    console.error('Obrigatório: --paymentId=pay_...');
    process.exit(1);
  }
  const result = await settleOrphanPixAutomaticCustomerInvoice({
    paymentId,
    pixQrCodeId: arg('pixQrCodeId'),
    conciliationId: arg('conciliationId'),
    invoiceId: arg('invoiceId'),
    authorizationId: arg('authorizationId'),
    gatewayStatus: arg('gatewayStatus') ?? 'RECEIVED',
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
