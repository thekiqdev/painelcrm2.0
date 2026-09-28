/**
 * Checkout Pro — Preferences API (Mercado Pago).
 * https://www.mercadopago.com.br/developers/pt/reference/preferences/_checkout_preferences/post
 */

export type MercadoPagoPreferenceItem = {
  id?: string;
  title: string;
  description?: string;
  quantity: number;
  currency_id: string;
  unit_price: number;
};

export type MercadoPagoCreatePreferenceBody = {
  items: MercadoPagoPreferenceItem[];
  external_reference?: string;
  payer?: {
    name?: string;
    surname?: string;
    email?: string;
  };
  back_urls?: {
    success?: string;
    pending?: string;
    failure?: string;
  };
  auto_return?: 'approved' | 'all';
  notification_url?: string;
  metadata?: Record<string, unknown>;
};

export type MercadoPagoPreferenceResponse = {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
  collector_id?: number;
  [key: string]: unknown;
};

export async function createCheckoutPreference(
  accessToken: string,
  body: MercadoPagoCreatePreferenceBody,
): Promise<MercadoPagoPreferenceResponse> {
  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Mercado Pago preferences ${res.status}: ${text.slice(0, 600)}`);
  }
  return JSON.parse(text) as MercadoPagoPreferenceResponse;
}
