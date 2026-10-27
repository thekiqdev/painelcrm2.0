/**
 * Adapter Stripe SaaS. Sem flag billing2.multi_gateway, nenhuma chamada HTTP
 * (mesmo contrato do skeleton). Com flag e secret, fala com a API Stripe.
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
import { isBilling2FlagEnabled } from '../../../services/billing2/billingFeatureFlags.js';
import { StripeSaasSkeletonError } from './stripeSaasSkeleton.js';
import { createStripePlatformClient, type StripeFetch } from './stripePlatformClient.js';

export type StripeSaasGatewayConfig = {
  api_key?: string;
  env?: 'sandbox' | 'production';
  fetchImpl?: StripeFetch;
};

async function assertStripeHttpAllowed(operation: string): Promise<void> {
  const on = await isBilling2FlagEnabled('multi_gateway');
  if (!on) throw new StripeSaasSkeletonError(operation);
}

export function getStripeSaasGateway(config?: StripeSaasGatewayConfig | null): PaymentGateway {
  const secret = config?.api_key?.trim() || '';
  const capabilities = getGatewayCapabilities('stripe');
  const client = secret
    ? createStripePlatformClient({ secretKey: secret, fetchImpl: config?.fetchImpl })
    : null;

  const gateway: PaymentGateway = {
    capabilities,
    async createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult> {
      await assertStripeHttpAllowed('createCustomer');
      if (!client) throw new StripeSaasSkeletonError('createCustomer');
      const created = await client.post('/customers', {
        email: input.email,
        name: input.name,
      });
      const id = typeof created.id === 'string' ? created.id : '';
      if (!id) throw new Error('Stripe não retornou customer id');
      return { customerId: id };
    },
    async ensureCustomer(tenantId: string): Promise<string> {
      const created = await gateway.createCustomer({
        name: tenantId,
        email: `${tenantId}@billing.painelcrm.local`,
      });
      return created.customerId;
    },
    async createCharge(_input: CreateChargeInput): Promise<CreateChargeResult> {
      await assertStripeHttpAllowed('createCharge');
      throw new Error(
        'Cobrança avulsa Stripe SaaS não é usada. USD/EUR abre Checkout Session (mode=subscription).'
      );
    },
    async getPayment(paymentId: string): Promise<PaymentResult | null> {
      await assertStripeHttpAllowed('getPayment');
      if (!client) throw new StripeSaasSkeletonError('getPayment');
      const path = paymentId.startsWith('in_') ? `/invoices/${paymentId}` : `/subscriptions/${paymentId}`;
      const row = await client.get(path);
      const status = typeof row.status === 'string' ? row.status : 'unknown';
      return { paymentId, status };
    },
    async getCharge(paymentId: string): Promise<PaymentResult | null> {
      return gateway.getPayment(paymentId);
    },
    async updateCharge(_paymentId: string, _input: UpdateChargeInput): Promise<UpdateChargeResult> {
      await assertStripeHttpAllowed('updateCharge');
      throw new StripeSaasSkeletonError('updateCharge');
    },
    async cancelPayment(paymentId: string): Promise<void> {
      await assertStripeHttpAllowed('cancelPayment');
      if (!client) throw new StripeSaasSkeletonError('cancelPayment');
      if (paymentId.startsWith('sub_')) {
        await client.del(`/subscriptions/${paymentId}`);
        return;
      }
      throw new StripeSaasSkeletonError('cancelPayment');
    },
    async payWithCreditCard(_input: PayWithCreditCardInput): Promise<PayWithCreditCardResult> {
      await assertStripeHttpAllowed('payWithCreditCard');
      throw new Error('Cartão SaaS USD/EUR é coletado no Stripe Checkout, não no PAN do PainelCRM.');
    },
  };

  return gateway;
}
