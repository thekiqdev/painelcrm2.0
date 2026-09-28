/**
 * Parser webhook Stripe SaaS (skeleton) — registra path genérico; rejeita até adapter real.
 */
import type { ParsedWebhookPayload } from '../../payments/paymentGatewayTypes.js';
import { registerGatewayParser } from '../../payments/webhook/webhookCore.js';

export function parseStripeSaasWebhookPayload(_payload: unknown): ParsedWebhookPayload {
  throw new Error(
    'Stripe SaaS webhook parser (skeleton S11): não processa eventos até o adapter real.'
  );
}

export const stripeSaasWebhookParser = {
  parsePayload: parseStripeSaasWebhookPayload,
};

/** Side-effect safe: registra parser no mapa genérico (isolamento por gateway_key). */
registerGatewayParser('stripe', stripeSaasWebhookParser);
