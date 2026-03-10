/**
 * Tipos genéricos para gateways de pagamento (Asaas, Stripe, PagarMe, etc.).
 * Qualquer implementação de PaymentGateway usa esses DTOs.
 */

export interface CreateCustomerInput {
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
}

export interface CreateCustomerResult {
  customerId: string;
}

export type PaymentMethod = 'PIX' | 'BOLETO' | 'CREDIT_CARD';

export interface CreateChargeInput {
  customerId: string;
  amountCents: number;
  dueDate: string;
  paymentMethod?: PaymentMethod;
  description?: string;
  periodStart?: string;
  periodEnd?: string;
  idempotencyKey?: string;
  /** Identificador externo (ex.: tenant_id) para resolver tenant no webhook. */
  externalReference?: string;
}

export interface CreateChargeResult {
  paymentId: string;
  status: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixQrCode?: string;
  pixCopyPaste?: string;
}

export interface PaymentResult {
  paymentId: string;
  status: string;
  paidAt?: string | null;
}

/**
 * Interface que todo gateway de pagamento deve implementar.
 * Permite trocar Asaas por Stripe/PagarMe sem alterar serviços que chamam getActiveGateway().
 * ensureCustomer: criar ou reutilizar cliente (ex.: por tenant); getCharge alias de getPayment.
 */
export interface PaymentGateway {
  createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult>;
  /** Criar ou reutilizar cliente (ex.: por tenant_id); retorna gateway_customer_id. */
  ensureCustomer?(tenantId: string): Promise<string>;
  createCharge(input: CreateChargeInput): Promise<CreateChargeResult>;
  getPayment(paymentId: string): Promise<PaymentResult | null>;
  /** Alias de getPayment para padronizar nome na interface. */
  getCharge?(paymentId: string): Promise<PaymentResult | null>;
}

export type BillingType = 'saas' | 'crm';

/**
 * Contexto para resolução do gateway: saas = cobrança de planos (config global), crm = cobrança ao cliente do CRM (config do tenant).
 * tenantId é obrigatório quando billingType = 'crm'.
 */
export interface GatewayProviderContext {
  billingType?: BillingType;
  tenantId?: string;
}
