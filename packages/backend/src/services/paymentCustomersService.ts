/**
 * Serviço da tabela payment_customers (Fase 4 — PLANO-EVOLUCAO-PAYMENT-GATEWAYS-PANEL).
 * Vínculo tenant ↔ cliente no gateway; evita consultar a API do gateway em todo ensureCustomer.
 */
import { pool } from '../utils/db.js';

export interface PaymentCustomerRow {
  id: string;
  tenant_id: string;
  gateway_key: string;
  gateway_customer_id: string;
  external_reference: string | null;
  created_at: string;
}

/**
 * Busca o customer do gateway já vinculado ao tenant. Retorna null se não existir.
 */
export async function getPaymentCustomer(
  tenantId: string,
  gatewayKey: string
): Promise<PaymentCustomerRow | null> {
  const r = await pool.query<PaymentCustomerRow>(
    `SELECT id, tenant_id, gateway_key, gateway_customer_id, external_reference, created_at
     FROM payment_customers
     WHERE tenant_id = $1 AND gateway_key = $2
     LIMIT 1`,
    [tenantId, gatewayKey]
  );
  return r.rows[0] ?? null;
}

/**
 * Persiste o vínculo tenant ↔ customer do gateway (após criar o customer na API do gateway).
 */
export async function createPaymentCustomer(
  tenantId: string,
  gatewayKey: string,
  gatewayCustomerId: string,
  externalReference: string | null
): Promise<PaymentCustomerRow> {
  const r = await pool.query<PaymentCustomerRow>(
    `INSERT INTO payment_customers (tenant_id, gateway_key, gateway_customer_id, external_reference)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, gateway_key) DO UPDATE SET
       gateway_customer_id = EXCLUDED.gateway_customer_id,
       external_reference = EXCLUDED.external_reference
     RETURNING id, tenant_id, gateway_key, gateway_customer_id, external_reference, created_at`,
    [tenantId, gatewayKey, gatewayCustomerId, externalReference]
  );
  return r.rows[0];
}
