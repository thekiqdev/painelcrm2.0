import { apiClient, type ApiResponse } from '@/integrations/api/client';

export interface StoreCheckoutClientEligibilityBody {
  store_slug: string;
  customer_phone: string;
}

export interface StoreCheckoutClientEligibilityData {
  ok: boolean;
  needs_cpf: boolean;
}

export async function fetchStoreCheckoutClientEligibility(
  body: StoreCheckoutClientEligibilityBody
): Promise<ApiResponse<StoreCheckoutClientEligibilityData>> {
  return apiClient.post<StoreCheckoutClientEligibilityData>('/api/store-checkout/client-eligibility', body);
}

export interface StoreCheckoutCreateBody {
  store_slug: string;
  product_id: string;
  quantity: 1;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  /** Obrigatório no backend se o cliente for novo ou sem CPF no CRM. */
  customer_cpf_cnpj?: string | null;
  expected_total_cents: number;
}

export interface StoreCheckoutCreateResponse {
  ok: boolean;
  order_id: string;
  order_number: string;
  customer_invoice_id: string;
  payment_token: string;
  amount_cents: number;
}

export async function createStoreCheckout(
  body: StoreCheckoutCreateBody,
  idempotencyKey: string
): Promise<ApiResponse<StoreCheckoutCreateResponse>> {
  return apiClient.post<StoreCheckoutCreateResponse>('/api/store-checkout/create', body, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}
