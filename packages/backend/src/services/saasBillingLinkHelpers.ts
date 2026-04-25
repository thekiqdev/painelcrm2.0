/**
 * Links derivados de tenant_billing para UI/notificações (sem expor gateway_metadata completo).
 */
import type { TenantBillingRow } from './invoiceService.js';

export function pickGatewayFallbackUrlFromBilling(row: TenantBillingRow): string {
  const m = row.gateway_metadata && typeof row.gateway_metadata === 'object' ? row.gateway_metadata : {};
  const rec = m as Record<string, unknown>;
  const invoiceUrl = typeof rec.invoiceUrl === 'string' ? rec.invoiceUrl.trim() : '';
  const pix = typeof rec.pixCopyPaste === 'string' ? rec.pixCopyPaste.trim() : '';
  const boleto = typeof rec.bankSlipUrl === 'string' ? rec.bankSlipUrl.trim() : '';
  const pixQr = typeof rec.pixQrCode === 'string' ? rec.pixQrCode.trim() : '';
  return invoiceUrl || pix || boleto || pixQr || '';
}

export function billingHasGatewayFallbackLink(row: TenantBillingRow): boolean {
  return pickGatewayFallbackUrlFromBilling(row).length > 0;
}
