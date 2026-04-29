/**
 * Pagamentos v1 — GET https://api.mercadopago.com/v1/payments/:id
 * Usado pelo webhook Fase 4 (fonte da verdade; não confiar só no POST).
 */

export type MercadoPagoPaymentResource = {
  id?: number | string;
  status?: string;
  status_detail?: string | null;
  external_reference?: string | null;
  metadata?: Record<string, unknown> | null;
  transaction_amount?: number;
  currency_id?: string | null;
  date_approved?: string | null;
  date_last_updated?: string | null;
  collector_id?: number | string | null;
  order?: { id?: string | null } | null;
  [key: string]: unknown;
};

export async function getMercadoPagoPayment(
  accessToken: string,
  paymentId: string,
): Promise<MercadoPagoPaymentResource> {
  const id = encodeURIComponent(paymentId.trim());
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Mercado Pago GET payment ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as MercadoPagoPaymentResource;
}
