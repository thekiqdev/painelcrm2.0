/**
 * Recupera liquidação do 1º pagamento Pix Automático quando o webhook
 * PAYMENT_RECEIVED chegou órfão (sem externalReference / paymentId novo).
 *
 * Uso:
 *   npx tsx src/scripts/settleOrphanPixAutomaticPayment.ts \
 *     --paymentId=pay_xxx \
 *     --pixQrCodeId=...ASA \
 *     [--billingId=uuid]
 */
import { settleOrphanPixAutomaticFirstPayment } from '../services/billing2/billingPixAutomaticService.js';

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
  const result = await settleOrphanPixAutomaticFirstPayment({
    paymentId,
    pixQrCodeId: arg('pixQrCodeId'),
    conciliationId: arg('conciliationId'),
    billingId: arg('billingId'),
    gatewayStatus: arg('gatewayStatus') ?? 'RECEIVED',
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
