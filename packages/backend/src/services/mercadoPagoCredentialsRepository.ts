/**
 * Persistência isolada Mercado Pago — não desativa outras configs do tenant (Asaas permanece ativo).
 */
import { pool } from '../utils/db.js';
import type { PaymentGatewayConfigStatus } from './paymentGatewayConfigService.js';

const GATEWAY_KEY = 'mercado_pago';

export async function upsertMercadoPagoTenantCredentials(params: {
  tenantId: string;
  credentials: Record<string, unknown>;
  status?: PaymentGatewayConfigStatus;
  lastConnectionStatus?: 'ok' | 'auth_error' | 'error';
}): Promise<void> {
  const { tenantId, credentials } = params;
  const status = params.status ?? 'active';
  const lastConnectionStatus = params.lastConnectionStatus ?? 'ok';

  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM payment_gateway_configs
     WHERE scope = 'tenant' AND tenant_id = $1::uuid AND gateway_key = $2`,
    [tenantId, GATEWAY_KEY],
  );

  if (existing.rows[0]?.id) {
    await pool.query(
      `UPDATE payment_gateway_configs
       SET credentials = $2::jsonb,
           status = $3,
           last_connection_test_at = now(),
           last_connection_status = $4,
           updated_at = now()
       WHERE id = $1::uuid`,
      [existing.rows[0].id, JSON.stringify(credentials), status, lastConnectionStatus],
    );
    return;
  }

  await pool.query(
    `INSERT INTO payment_gateway_configs (
       scope, tenant_id, gateway_key, is_active, status, display_name, credentials, options,
       enabled_payment_methods, default_payment_method,
       last_connection_test_at, last_connection_status
     )
     VALUES (
       'tenant', $1::uuid, $2, false, $3, $4, $5::jsonb, '{}'::jsonb,
       '["pix","boleto","credit_card"]'::jsonb, 'pix',
       now(), $6
     )`,
    [tenantId, GATEWAY_KEY, status, 'Mercado Pago', JSON.stringify(credentials), lastConnectionStatus],
  );
}

export async function getMercadoPagoTenantConfigRow(tenantId: string): Promise<{
  id: string;
  credentials: Record<string, unknown>;
  status: string | null;
  last_connection_test_at: string | null;
  last_connection_status: string | null;
  is_active: boolean;
} | null> {
  const r = await pool.query<{
    id: string;
    credentials: unknown;
    status: string | null;
    last_connection_test_at: string | null;
    last_connection_status: string | null;
    is_active: boolean;
  }>(
    `SELECT id, credentials, status, last_connection_test_at, last_connection_status, is_active
     FROM payment_gateway_configs
     WHERE scope = 'tenant' AND tenant_id = $1::uuid AND gateway_key = $2
     LIMIT 1`,
    [tenantId, GATEWAY_KEY],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    ...row,
    credentials: (row.credentials as Record<string, unknown>) ?? {},
  };
}

export async function clearMercadoPagoTenantCredentials(tenantId: string): Promise<void> {
  await pool.query(
    `UPDATE payment_gateway_configs
     SET credentials = '{}'::jsonb,
         status = 'disabled',
         last_connection_status = NULL,
         updated_at = now()
     WHERE scope = 'tenant' AND tenant_id = $1::uuid AND gateway_key = $2`,
    [tenantId, GATEWAY_KEY],
  );
}
