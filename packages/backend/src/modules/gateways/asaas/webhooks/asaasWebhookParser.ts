/**
 * Parser do webhook Asaas: payload bruto → ParsedWebhookPayload para webhookCore.
 * Fase 3 — PLANO-REFATORACAO-MULTI-GATEWAY.
 */
import type { ParsedWebhookPayload } from '../../../payments/paymentGatewayTypes.js';

function mapAsaasBillingTypeToPaymentMethod(billingType: string | null): string | null {
  if (!billingType) return null;
  const t = billingType.toUpperCase();
  if (t === 'PIX') return 'PIX';
  if (t === 'BOLETO') return 'BOLETO';
  if (t === 'CREDIT_CARD' || t === 'DEBIT_CARD') return 'CREDIT_CARD';
  return null;
}

/**
 * Extrai evento e pagamento do payload Asaas para o formato interno.
 */
export function parseAsaasWebhookPayload(payload: unknown): ParsedWebhookPayload {
  const body = payload as Record<string, unknown> | null | undefined;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Payload deve ser um objeto');
  }
  const eventId = typeof body.id === 'string' ? body.id : '';
  const payment = body.payment as Record<string, unknown> | null | undefined;
  const referenceId = payment && typeof payment.id === 'string' ? payment.id : '';
  const externalStatus = payment && typeof payment.status === 'string' ? payment.status : null;
  const billingType = payment && typeof payment.billingType === 'string' ? payment.billingType : null;
  const paymentMethod = mapAsaasBillingTypeToPaymentMethod(billingType);

  const metadata: Record<string, unknown> = {};
  if (paymentMethod) metadata.paymentMethod = paymentMethod;
  // Sprint 10 — conciliation do 1º pagamento da jornada Pix Automático.
  // Asaas docs: immediateQrCode.conciliationIdentifier reaparece no payment.
  // Em produção o PAYMENT_RECEIVED auto-gerado ("Cobrança gerada automaticamente…")
  // frequentemente traz o mesmo valor em `pixQrCodeId` e sem externalReference.
  if (payment && typeof payment.conciliationIdentifier === 'string') {
    metadata.conciliationIdentifier = payment.conciliationIdentifier;
  }
  if (payment && typeof payment.pixQrCodeId === 'string') {
    metadata.pixQrCodeId = payment.pixQrCodeId;
    if (!metadata.conciliationIdentifier) {
      metadata.conciliationIdentifier = payment.pixQrCodeId;
    }
  }

  return {
    eventId,
    referenceId,
    externalStatus,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

export const asaasWebhookParser = {
  parsePayload: parseAsaasWebhookPayload,
};
