/**
 * Adapter Stripe do tenant (cobrança avulsa / loja). Não lê credencial global.
 * Flag OFF: nenhuma chamada HTTP.
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
import { createStripePlatformClient, type StripeFetch } from './stripePlatformClient.js';
import { isStripeTenantEnabled } from './stripeTenantFlags.js';

export type StripeTenantGatewayConfig = {
  secretKey: string;
  fetchImpl?: StripeFetch;
};

function normalizeChargeCurrency(raw: string | undefined): 'brl' | 'usd' | 'eur' {
  const c = (raw || 'BRL').trim().toLowerCase();
  if (c === 'usd' || c === 'eur' || c === 'brl') return c;
  throw new Error('Stripe do tenant aceita apenas BRL, USD ou EUR');
}

export function getStripeTenantGateway(config: StripeTenantGatewayConfig): PaymentGateway {
  const secret = config.secretKey.trim();
  const client = secret ? createStripePlatformClient({ secretKey: secret, fetchImpl: config.fetchImpl }) : null;
  const capabilities = getGatewayCapabilities('stripe');

  const gateway: PaymentGateway = {
    capabilities,
    async createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult> {
      if (!(await isStripeTenantEnabled())) {
        throw new Error('Stripe do tenant está desligada');
      }
      if (!client) throw new Error('Secret Stripe do tenant ausente');
      const created = await client.post('/customers', {
        email: input.email,
        name: input.name,
      });
      const id = typeof created.id === 'string' ? created.id : '';
      if (!id) throw new Error('Stripe não retornou customer id');
      return { customerId: id };
    },
    async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
      if (!(await isStripeTenantEnabled())) {
        throw new Error('Stripe do tenant está desligada');
      }
      if (!client) throw new Error('Secret Stripe do tenant ausente');
      const method = input.paymentMethod ?? 'CREDIT_CARD';
      if (method === 'PIX' || method === 'BOLETO') {
        throw new Error('PIX e boleto do tenant permanecem no Asaas. Stripe é só cartão.');
      }
      const currency = normalizeChargeCurrency(input.currency);
      const base = (process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:8080').replace(/\/$/, '');
      const session = await client.post('/checkout/sessions', {
        mode: 'payment',
        ...(input.customerId?.startsWith('cus_') ? { customer: input.customerId } : {}),
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': currency,
        'line_items[0][price_data][unit_amount]': String(Math.max(0, Math.trunc(input.amountCents))),
        'line_items[0][price_data][product_data][name]': (input.description || 'Fatura').slice(0, 120),
        success_url: `${base}/pay/stripe-return?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/pay/stripe-return?canceled=1`,
        ...(input.externalReference ? { 'metadata[external_reference]': input.externalReference } : {}),
        'metadata[currency]': currency.toUpperCase(),
      });
      const id = typeof session.id === 'string' ? session.id : '';
      const url = typeof session.url === 'string' ? session.url : '';
      if (!id || !url) throw new Error('Stripe não retornou checkout');
      return { paymentId: id, status: 'pending', invoiceUrl: url };
    },
    async getPayment(paymentId: string): Promise<PaymentResult | null> {
      if (!(await isStripeTenantEnabled())) return null;
      if (!client) return null;
      const path = paymentId.startsWith('cs_') ? `/checkout/sessions/${paymentId}` : `/payment_intents/${paymentId}`;
      const row = await client.get(path);
      const paid = row.payment_status === 'paid' || row.status === 'succeeded';
      return { paymentId, status: paid ? 'paid' : typeof row.status === 'string' ? row.status : 'pending' };
    },
    async getCharge(paymentId: string): Promise<PaymentResult | null> {
      return gateway.getPayment(paymentId);
    },
    async updateCharge(_paymentId: string, _input: UpdateChargeInput): Promise<UpdateChargeResult> {
      throw new Error('Stripe do tenant não altera cobrança avulsa já criada');
    },
    async cancelPayment(paymentId: string): Promise<void> {
      if (!(await isStripeTenantEnabled()) || !client) return;
      if (paymentId.startsWith('cs_')) {
        await client.post(`/checkout/sessions/${paymentId}/expire`, {});
      }
    },
    async payWithCreditCard(_input: PayWithCreditCardInput): Promise<PayWithCreditCardResult> {
      throw new Error('O cartão do cliente é coletado no Stripe Checkout do tenant.');
    },
  };

  return gateway;
}
