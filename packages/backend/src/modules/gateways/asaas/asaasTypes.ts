/**
 * Tipos e interfaces específicos do Asaas (request/response da API, DTOs internos).
 */

/** Configuração injetada (ex.: do banco) para o módulo Asaas. Quando ausente, usa variáveis de ambiente. */
export interface AsaasConfig {
  api_key: string;
  /** 'sandbox' | 'production' ou URL base completa */
  env?: 'sandbox' | 'production';
  base_url?: string;
}

export interface AsaasCustomerRequest {
  name: string;
  email: string;
  cpfCnpj?: string;
  phone?: string;
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  province?: string;
  city?: string;
  state?: string;
  /** Identificador externo (ex.: tenant_id) para resolver tenant no webhook. */
  externalReference?: string;
}

export interface AsaasCustomerResponse {
  id: string;
  name?: string;
  email?: string;
  cpfCnpj?: string;
  [key: string]: unknown;
}

export interface AsaasPaymentRequest {
  customer: string;
  billingType: 'BOLETO' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'PIX' | 'UNDEFINED';
  value: number;
  dueDate: string;
  description?: string;
  /** Identificador externo (ex.: tenant_id) para resolver tenant no webhook. */
  externalReference?: string;
}

export interface AsaasPaymentResponse {
  id: string;
  status: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  invoiceNumber?: string;
  paymentDate?: string | null;
  dateCreated?: string;
  /** ID do QR Code PIX (para consulta); alguns fluxos retornam payload PIX no GET */
  pixQrCodeId?: string | null;
  [key: string]: unknown;
}

/** Resposta do GET /v3/payments/{id}/pixQrCode */
export interface AsaasPixQrCodeResponse {
  encodedImage?: string;
  payload?: string;
  expirationDate?: string;
  description?: string;
}
