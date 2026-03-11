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
  client_id: string | null;
  created_at: string;
}

/**
 * Busca o customer do gateway já vinculado ao tenant (SaaS). Retorna null se não existir.
 */
export async function getPaymentCustomer(
  tenantId: string,
  gatewayKey: string
): Promise<PaymentCustomerRow | null> {
  const r = await pool.query<PaymentCustomerRow>(
    `SELECT id, tenant_id, gateway_key, gateway_customer_id, external_reference, client_id, created_at
     FROM payment_customers
     WHERE tenant_id = $1 AND gateway_key = $2 AND client_id IS NULL
     LIMIT 1`,
    [tenantId, gatewayKey]
  );
  return r.rows[0] ?? null;
}

/**
 * Persiste o vínculo tenant ↔ customer do gateway (SaaS). client_id = NULL.
 * Usa índice parcial UNIQUE(tenant_id, gateway_key) WHERE client_id IS NULL.
 */
export async function createPaymentCustomer(
  tenantId: string,
  gatewayKey: string,
  gatewayCustomerId: string,
  externalReference: string | null
): Promise<PaymentCustomerRow> {
  const r = await pool.query<PaymentCustomerRow>(
    `INSERT INTO payment_customers (tenant_id, gateway_key, gateway_customer_id, external_reference, client_id)
     VALUES ($1, $2, $3, $4, NULL)
     ON CONFLICT (tenant_id, gateway_key) WHERE (client_id IS NULL) DO UPDATE SET
       gateway_customer_id = EXCLUDED.gateway_customer_id,
       external_reference = EXCLUDED.external_reference
     RETURNING id, tenant_id, gateway_key, gateway_customer_id, external_reference, client_id, created_at`,
    [tenantId, gatewayKey, gatewayCustomerId, externalReference]
  );
  return r.rows[0];
}

/**
 * Busca o customer do gateway vinculado ao tenant + client (CRM). Retorna null se não existir.
 */
export async function getPaymentCustomerForClient(
  tenantId: string,
  gatewayKey: string,
  clientId: string
): Promise<PaymentCustomerRow | null> {
  const r = await pool.query<PaymentCustomerRow>(
    `SELECT id, tenant_id, gateway_key, gateway_customer_id, external_reference, client_id, created_at
     FROM payment_customers
     WHERE tenant_id = $1 AND gateway_key = $2 AND client_id = $3
     LIMIT 1`,
    [tenantId, gatewayKey, clientId]
  );
  return r.rows[0] ?? null;
}

/**
 * Persiste o vínculo tenant + client ↔ customer do gateway (CRM).
 * Usa índice parcial UNIQUE(tenant_id, gateway_key, client_id) WHERE client_id IS NOT NULL.
 */
export async function createPaymentCustomerForClient(
  tenantId: string,
  gatewayKey: string,
  clientId: string,
  gatewayCustomerId: string,
  externalReference: string | null
): Promise<PaymentCustomerRow> {
  const r = await pool.query<PaymentCustomerRow>(
    `INSERT INTO payment_customers (tenant_id, gateway_key, gateway_customer_id, external_reference, client_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, gateway_key, client_id) WHERE (client_id IS NOT NULL) DO UPDATE SET
       gateway_customer_id = EXCLUDED.gateway_customer_id,
       external_reference = EXCLUDED.external_reference
     RETURNING id, tenant_id, gateway_key, gateway_customer_id, external_reference, client_id, created_at`,
    [tenantId, gatewayKey, gatewayCustomerId, externalReference, clientId]
  );
  return r.rows[0];
}
