/**
 * Metadados do payload de pagamento público (Fase 10) — mesmo critério no GET e no POST /complete.
 */
export type PaymentOptionsSummary = 'none' | 'pix' | 'hosted' | 'pix_and_hosted';

export interface PublicPayPayloadMeta {
  has_payment_payload: boolean;
  payment_options_summary: PaymentOptionsSummary;
}

export function buildPublicPayPayloadMeta(payment_urls: {
  invoiceUrl?: string;
  bankSlipUrl?: string;
  bankSlipDigitableLine?: string;
  pixQrCode?: string;
  pixCopyPaste?: string;
  /** Fase 3 MP Checkout Pro — URL de redirecionamento seguro (init_point / sandbox). */
  mercado_pago_init_point?: string;
}): PublicPayPayloadMeta {
  const pixQr = (payment_urls.pixQrCode ?? '').trim();
  const hasPixVisual = Boolean((payment_urls.pixCopyPaste ?? '').trim() || pixQr.length > 0);
  const hasHosted = Boolean(
    (payment_urls.invoiceUrl ?? '').trim() ||
      (payment_urls.bankSlipUrl ?? '').trim() ||
      (payment_urls.bankSlipDigitableLine ?? '').trim() ||
      (payment_urls.mercado_pago_init_point ?? '').trim()
  );
  const has_payment_payload = hasPixVisual || hasHosted;
  let payment_options_summary: PaymentOptionsSummary = 'none';
  if (hasPixVisual && hasHosted) payment_options_summary = 'pix_and_hosted';
  else if (hasPixVisual) payment_options_summary = 'pix';
  else if (hasHosted) payment_options_summary = 'hosted';
  return { has_payment_payload, payment_options_summary };
}
