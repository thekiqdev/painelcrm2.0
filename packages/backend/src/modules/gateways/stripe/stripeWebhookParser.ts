/**
 * Parser de webhook Stripe SaaS. Não chama a API.
 * Eventos de assinatura viram referenceId + status para o núcleo de pagamento.
 */
import type { ParsedWebhookPayload } from '../../payments/paymentGatewayTypes.js';
import { registerGatewayParser } from '../../payments/webhook/webhookCore.js';

export function parseStripeSaasWebhookPayload(payload: unknown): ParsedWebhookPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload Stripe inválido');
  }
  const event = payload as {
    id?: string;
    type?: string;
    data?: { object?: Record<string, unknown> };
  };
  const eventId = typeof event.id === 'string' ? event.id : '';
  const obj = event.data?.object ?? {};
  const referenceId =
    (typeof obj.id === 'string' && obj.id) ||
    (typeof obj.subscription === 'string' && obj.subscription) ||
    '';
  if (!eventId || !referenceId) {
    throw new Error('Evento Stripe sem id ou referência');
  }
  const type = event.type || '';
  let externalStatus: string | null = typeof obj.status === 'string' ? obj.status : null;
  if (type === 'invoice.paid' || obj.payment_status === 'paid') externalStatus = 'paid';
  if (type === 'invoice.payment_failed') externalStatus = 'payment_failed';
  if (type === 'customer.subscription.deleted') externalStatus = 'canceled';
  return {
    eventId,
    referenceId,
    externalStatus,
    metadata: (obj.metadata as Record<string, unknown> | undefined) ?? null,
  };
}

export const stripeSaasWebhookParser = {
  parsePayload: parseStripeSaasWebhookPayload,
};

registerGatewayParser('stripe', stripeSaasWebhookParser);
