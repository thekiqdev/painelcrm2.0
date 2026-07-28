/**
 * Billing 2.0 Sprint 11 — skeleton Stripe SaaS (2º gateway).
 * Não cobra em produção: operações lançam erro explícito até implementação real.
 * Registry + flag billing2.multi_gateway OFF = resolver ignora este adapter.
 */
import type {
  CreateChargeInput,
  CreateChargeResult,
  CreateCustomerInput,
  CreateCustomerResult,
  PayWithCreditCardInput,
  PayWithCreditCardResult,
  PaymentGateway,
  PaymentResult,
  UpdateChargeInput,
  UpdateChargeResult,
} from '../../payments/paymentGatewayTypes.js';
import { getGatewayCapabilities } from '../../payments/gatewayCapabilities.js';

const GATEWAY_KEY = 'stripe';

export class StripeSaasSkeletonError extends Error {
  constructor(operation: string) {
    super(
      `Gateway Stripe SaaS (skeleton S11): operação "${operation}" não implementada. ` +
        `Mantenha billing2.multi_gateway=OFF ou use Asaas até o adapter real.`
    );
    this.name = 'StripeSaasSkeletonError';
  }
}

export type StripeSaasConfig = {
  api_key?: string;
  env?: 'sandbox' | 'production';
};

/**
 * Adapter skeleton — implementa a interface PaymentGateway para o registry.
 * Nenhuma chamada HTTP a Stripe.
 */
export function getStripeSaasSkeletonGateway(
  _config?: StripeSaasConfig | null
): PaymentGateway | null {
  const capabilities = getGatewayCapabilities(GATEWAY_KEY);

  const gateway: PaymentGateway = {
    capabilities,
    async createCustomer(_input: CreateCustomerInput): Promise<CreateCustomerResult> {
      throw new StripeSaasSkeletonError('createCustomer');
    },
    async ensureCustomer(_tenantId: string): Promise<string> {
      throw new StripeSaasSkeletonError('ensureCustomer');
    },
    async createCharge(_input: CreateChargeInput): Promise<CreateChargeResult> {
      throw new StripeSaasSkeletonError('createCharge');
    },
    async getPayment(_paymentId: string): Promise<PaymentResult | null> {
      throw new StripeSaasSkeletonError('getPayment');
    },
    async getCharge(paymentId: string): Promise<PaymentResult | null> {
      return gateway.getPayment(paymentId);
    },
    async updateCharge(
      _paymentId: string,
      _input: UpdateChargeInput
    ): Promise<UpdateChargeResult> {
      throw new StripeSaasSkeletonError('updateCharge');
    },
    async cancelPayment(_paymentId: string): Promise<void> {
      throw new StripeSaasSkeletonError('cancelPayment');
    },
    async payWithCreditCard(_input: PayWithCreditCardInput): Promise<PayWithCreditCardResult> {
      throw new StripeSaasSkeletonError('payWithCreditCard');
    },
  };

  return gateway;
}
