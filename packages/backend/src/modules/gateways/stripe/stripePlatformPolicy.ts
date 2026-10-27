import { pool } from '../../../utils/db.js';

export class MixedSaasGatewayError extends Error {
  code = 'MIXED_SAAS_GATEWAY';
  constructor() {
    super('Esta assinatura já usa outro gateway. Uma assinatura SaaS não mistura Asaas e Stripe.');
    this.name = 'MixedSaasGatewayError';
  }
}

/**
 * Assinatura SaaS ativa não troca de gateway nem de moeda de cobrança.
 * Draft trialing ainda pode ser reescrito pelo checkout.
 */
export async function assertSaasGatewayCompatible(
  tenantId: string,
  incomingGateway: 'asaas' | 'stripe',
  incomingCurrency: 'BRL' | 'USD' | 'EUR'
): Promise<void> {
  const r = await pool.query<{ gateway: string | null; currency: string | null; status: string }>(
    `SELECT gateway, currency, status
     FROM subscriptions
     WHERE tenant_id = $1::uuid AND type = 'saas' AND status = 'active'
     LIMIT 1`,
    [tenantId]
  );
  const row = r.rows[0];
  if (!row) return;
  const gateway = (row.gateway || 'asaas').toLowerCase();
  const currency = (row.currency || 'BRL').toUpperCase();
  if (gateway !== incomingGateway || currency !== incomingCurrency) {
    throw new MixedSaasGatewayError();
  }
}
