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
  /** Métodos permitidos para UX pública (não altera contrato do gateway atual). */
  allowedPaymentMethods?: PaymentMethod[];
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
  /** Linha digitável do boleto (quando o gateway expõe, ex.: Asaas GET .../identificationField). */
  bankSlipDigitableLine?: string;
  pixQrCode?: string;
  pixCopyPaste?: string;
}

export interface PaymentResult {
  paymentId: string;
  status: string;
  paidAt?: string | null;
}

/** Desenho A: captura em cobrança já criada (ex.: Asaas payWithCreditCard). Outros gateways: opcional. */
export interface PayWithCreditCardInput {
  paymentId: string;
  creditCard: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  creditCardHolderInfo: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    addressComplement?: string | null;
    phone: string;
    mobilePhone?: string | null;
  };
}

export interface PayWithCreditCardResult {
  paymentId: string;
  status: string;
  paidAt?: string | null;
}

/**
 * Dados do gateway para persistência (customer_invoices / tenant_billing).
 * Fase 2 multi-gateway: uso de gateway_reference_id + gateway_metadata + gateway_status;
 * Fase 4: apenas colunas genéricas (sem dual write legado).
 */
export interface GatewayPaymentData {
  gateway: string;
  payment_method: string | null;
  gateway_reference_id: string | null;
  gateway_metadata?: Record<string, unknown> | null;
  gateway_status: string | null;
  idempotency_key?: string | null;
}

/** Status interno de pagamento (fonte da verdade). Fase 3 webhook. */
export type InternalPaymentStatus =
  | 'pending'
  | 'waiting_payment'
  | 'processing'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'failed'
  | 'refunded';

/** Payload parseado pelo parser do gateway para o webhookCore. */
export interface ParsedWebhookPayload {
  eventId: string;
  referenceId: string;
  externalStatus: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Parser de webhook por gateway: payload bruto → formato interno. */
export interface GatewayWebhookParser {
  parsePayload(payload: unknown): ParsedWebhookPayload;
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
  /** CRM: criar ou reutilizar cliente do gateway para um client_id; retorna gateway_customer_id. Dados do cliente em clientData. */
  ensureCustomerForClient?(tenantId: string, clientId: string, clientData: CreateCustomerInput): Promise<string>;
  createCharge(input: CreateChargeInput): Promise<CreateChargeResult>;
  getPayment(paymentId: string): Promise<PaymentResult | null>;
  /** Alias de getPayment para padronizar nome na interface. */
  getCharge?(paymentId: string): Promise<PaymentResult | null>;
  /** Cancela cobrança no gateway (ex.: DELETE no Asaas). Opcional; falha não deve bloquear cancelamento no sistema. */
  cancelPayment?(paymentId: string): Promise<void>;
  /**
   * Captura cartão em cobrança pendente (Desenho A). Só Asaas na v1; demais gateways podem omitir
   * e o backend retorna indisponível — pivot possível para Desenho B mantendo o contrato público.
   */
  payWithCreditCard?(input: PayWithCreditCardInput): Promise<PayWithCreditCardResult>;
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
