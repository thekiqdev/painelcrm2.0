/**
 * Serviço de configuração de gateways de pagamento (payment_gateways, payment_gateway_configs).
 * Usado pelo gatewayProvider e pelas rotas de configuração (Super Admin / tenant).
 */
import type { BillingType } from '../modules/payments/paymentGatewayTypes.js';
import { pool } from '../utils/db.js';

export type PaymentGatewayConfigStatus = 'pending' | 'active' | 'error' | 'disabled';
export type LastConnectionStatus = 'ok' | 'auth_error' | 'error';

export interface PaymentGatewayConfigRow {
  id: string;
  scope: 'global' | 'tenant';
  tenant_id: string | null;
  gateway_key: string;
  is_active: boolean;
  display_name: string | null;
  credentials: Record<string, unknown>;
  options: Record<string, unknown>;
  status?: PaymentGatewayConfigStatus;
  last_connection_test_at?: string | null;
  last_connection_status?: LastConnectionStatus | null;
}

/** Config sem credenciais em claro (para API/front); indica se há credencial configurada. */
export interface PaymentGatewayConfigPublic {
  id: string;
  scope: 'global' | 'tenant';
  gateway_key: string;
  display_name: string | null;
  options: Record<string, unknown>;
  hasCredentials: boolean;
  credentialsMasked?: Record<string, string>;
  api_key_masked?: string | null;
  status?: PaymentGatewayConfigStatus;
  last_connection_test_at?: string | null;
  last_connection_status?: LastConnectionStatus | null;
  /** Ambiente do gateway (ex.: sandbox, production). */
  environment?: 'sandbox' | 'production' | null;
  /** Se a URL do webhook está definida (sempre true quando configurado para Asaas). */
  webhook_configured?: boolean;
}

/** Item retornado por GET .../payment-gateways/status para montar os cards do painel. */
export interface GatewayStatusItem {
  key: string;
  name: string;
  is_enabled: boolean;
  configured: boolean;
  connection_status: LastConnectionStatus | null;
  last_connection_test_at: string | null;
  environment: 'sandbox' | 'production' | null;
  webhook_configured: boolean;
  status: PaymentGatewayConfigStatus | null;
}

function maskCredentials(credentials: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(credentials)) {
    const v = credentials[key];
    if (v !== null && v !== undefined && String(v).length > 0) {
      out[key] = '••••••••';
    }
  }
  return out;
}

/** Máscara API Key mostrando apenas os últimos 4 caracteres (ex: •••••••••••••••••a1b2). */
function maskApiKeyWithSuffix(apiKey: unknown): string | null {
  if (apiKey == null || typeof apiKey !== 'string') return null;
  const s = apiKey.trim();
  if (s.length === 0) return null;
  if (s.length <= 4) return '••••••••';
  return '••••••••••••••••'.slice(0, Math.max(0, s.length - 4)) + s.slice(-4);
}

/**
 * Valida se gateway_key existe em payment_gateways e está habilitado.
 */
export async function isGatewayKeyValid(gatewayKey: string): Promise<boolean> {
  const r = await pool.query<{ id: string }>(
    `SELECT id FROM payment_gateways WHERE key = $1 AND is_enabled = true`,
    [gatewayKey]
  );
  return r.rows.length > 0;
}

/** Item da lista de gateways (para dropdown no front). */
export interface PaymentGatewayListItem {
  key: string;
  name: string;
  is_enabled: boolean;
}

/**
 * Lista gateways suportados (payment_gateways) para dropdown na configuração.
 */
export async function listGateways(): Promise<PaymentGatewayListItem[]> {
  const r = await pool.query<PaymentGatewayListItem>(
    `SELECT key, name, is_enabled FROM payment_gateways ORDER BY sort_order, name`
  );
  return r.rows;
}

/**
 * Retorna a config ativa para o contexto (uso interno pelo gatewayProvider; inclui credentials).
 * Fase 3: considera apenas configs com status = 'active' (além de is_active).
 */
export async function getActiveConfig(
  billingType: BillingType,
  tenantId?: string
): Promise<PaymentGatewayConfigRow | null> {
  if (billingType === 'crm') {
    if (!tenantId) return null;
    const r = await pool.query<PaymentGatewayConfigRow & { status?: string; last_connection_test_at?: string | null; last_connection_status?: string | null }>(
      `SELECT id, scope, tenant_id, gateway_key, is_active, display_name, credentials, options,
              status, last_connection_test_at, last_connection_status
       FROM payment_gateway_configs
       WHERE scope = 'tenant' AND tenant_id = $1 AND is_active = true AND status = 'active'
       LIMIT 1`,
      [tenantId]
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      ...row,
      credentials: (row.credentials as Record<string, unknown>) ?? {},
      options: (row.options as Record<string, unknown>) ?? {},
    };
  }

  const r = await pool.query<PaymentGatewayConfigRow & { status?: string; last_connection_test_at?: string | null; last_connection_status?: string | null }>(
    `SELECT id, scope, tenant_id, gateway_key, is_active, display_name, credentials, options,
            status, last_connection_test_at, last_connection_status
     FROM payment_gateway_configs
     WHERE scope = 'global' AND is_active = true AND status IN ('active', 'pending')
     ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END
     LIMIT 1`
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    ...row,
    credentials: (row.credentials as Record<string, unknown>) ?? {},
    options: (row.options as Record<string, unknown>) ?? {},
  };
}

/**
 * Retorna a config para teste (qualquer status). Usado pelo endpoint POST .../payment-gateway/test.
 * Para tenant, gatewayKey opcional: se informado, retorna a config daquele gateway (permite testar no card — Fase 7).
 */
export async function getConfigForTest(
  scope: 'global' | 'tenant',
  tenantId?: string,
  gatewayKey?: string
): Promise<PaymentGatewayConfigRow | null> {
  if (scope === 'tenant') {
    if (!tenantId) return null;
    if (gatewayKey) {
      const r = await pool.query<PaymentGatewayConfigRow & { status?: string; last_connection_test_at?: string | null; last_connection_status?: string | null }>(
        `SELECT id, scope, tenant_id, gateway_key, is_active, display_name, credentials, options,
                status, last_connection_test_at, last_connection_status
         FROM payment_gateway_configs
         WHERE scope = 'tenant' AND tenant_id = $1 AND gateway_key = $2
         LIMIT 1`,
        [tenantId, gatewayKey]
      );
      const row = r.rows[0];
      if (!row) return null;
      return { ...row, credentials: (row.credentials as Record<string, unknown>) ?? {}, options: (row.options as Record<string, unknown>) ?? {} };
    }
    const r = await pool.query<PaymentGatewayConfigRow & { status?: string; last_connection_test_at?: string | null; last_connection_status?: string | null }>(
      `SELECT id, scope, tenant_id, gateway_key, is_active, display_name, credentials, options,
              status, last_connection_test_at, last_connection_status
       FROM payment_gateway_configs
       WHERE scope = 'tenant' AND tenant_id = $1 AND is_active = true
       LIMIT 1`,
      [tenantId]
    );
    const row = r.rows[0];
    if (!row) return null;
    return { ...row, credentials: (row.credentials as Record<string, unknown>) ?? {}, options: (row.options as Record<string, unknown>) ?? {} };
  }
  const r = await pool.query<PaymentGatewayConfigRow & { status?: string; last_connection_test_at?: string | null; last_connection_status?: string | null }>(
    `SELECT id, scope, tenant_id, gateway_key, is_active, display_name, credentials, options,
            status, last_connection_test_at, last_connection_status
     FROM payment_gateway_configs
     WHERE scope = 'global' AND is_active = true
     LIMIT 1`
  );
  const row = r.rows[0];
  if (!row) return null;
  return { ...row, credentials: (row.credentials as Record<string, unknown>) ?? {}, options: (row.options as Record<string, unknown>) ?? {} };
}

/**
 * Retorna a config global ativa para exibição na API (credenciais mascaradas).
 */
export async function getGlobalConfig(): Promise<PaymentGatewayConfigPublic | null> {
  const r = await pool.query<PaymentGatewayConfigRow & { status?: string; last_connection_test_at?: string | null; last_connection_status?: string | null }>(
    `SELECT id, scope, tenant_id, gateway_key, is_active, display_name, credentials, options,
            status, last_connection_test_at, last_connection_status
     FROM payment_gateway_configs
     WHERE scope = 'global' AND is_active = true
     LIMIT 1`
  );
  const row = r.rows[0];
  if (!row) return null;
  const credentials = (row.credentials as Record<string, unknown>) ?? {};
  const env = credentials.env === 'production' ? 'production' : 'sandbox';
  return {
    id: row.id,
    scope: 'global',
    gateway_key: row.gateway_key,
    display_name: row.display_name,
    options: (row.options as Record<string, unknown>) ?? {},
    hasCredentials: Object.keys(credentials).length > 0,
    credentialsMasked: maskCredentials(credentials),
    api_key_masked: maskApiKeyWithSuffix(credentials.api_key),
    status: (row.status as PaymentGatewayConfigStatus) ?? undefined,
    last_connection_test_at: row.last_connection_test_at ?? undefined,
    last_connection_status: (row.last_connection_status as LastConnectionStatus) ?? undefined,
    environment: env,
    webhook_configured: !!row.gateway_key,
  };
}

/**
 * Salva/atualiza a config global. Valida gateway_key em payment_gateways.
 * Desativa qualquer outra config global ativa; ativa/insere a config para o gateway_key informado.
 */
export async function saveGlobalConfig(data: {
  gateway_key: string;
  display_name?: string | null;
  credentials: Record<string, unknown>;
  options?: Record<string, unknown>;
}): Promise<PaymentGatewayConfigRow> {
  const valid = await isGatewayKeyValid(data.gateway_key);
  if (!valid) {
    throw new Error(`Gateway "${data.gateway_key}" não existe ou não está habilitado.`);
  }

  await pool.query(
    `UPDATE payment_gateway_configs SET is_active = false WHERE scope = 'global' AND is_active = true`
  );

  const existing = await pool.query<PaymentGatewayConfigRow>(
    `SELECT id, scope, tenant_id, gateway_key, is_active, display_name, credentials, options
     FROM payment_gateway_configs WHERE scope = 'global' AND gateway_key = $1`,
    [data.gateway_key]
  );

  if (existing.rows.length > 0) {
    const existingCreds = (existing.rows[0].credentials as Record<string, unknown>) ?? {};
    const mergedCredentials: Record<string, unknown> = { ...existingCreds };
    for (const [k, v] of Object.entries(data.credentials)) {
      if (v !== '' && v !== '••••••••' && v != null) mergedCredentials[k] = v;
    }
    const u = await pool.query<PaymentGatewayConfigRow>(
      `UPDATE payment_gateway_configs
       SET is_active = true, status = 'active', display_name = $2, credentials = $3::jsonb, options = $4::jsonb, updated_at = now()
       WHERE scope = 'global' AND gateway_key = $1
       RETURNING id, scope, tenant_id, gateway_key, is_active, display_name, credentials, options`,
      [data.gateway_key, data.display_name ?? null, JSON.stringify(mergedCredentials), JSON.stringify(data.options ?? {})]
    );
    const row = u.rows[0];
    return {
      ...row,
      credentials: (row.credentials as Record<string, unknown>) ?? {},
      options: (row.options as Record<string, unknown>) ?? {},
    };
  }

  const ins = await pool.query<PaymentGatewayConfigRow>(
    `INSERT INTO payment_gateway_configs (scope, gateway_key, is_active, status, display_name, credentials, options)
     VALUES ('global', $1, true, 'active', $2, $3::jsonb, $4::jsonb)
     RETURNING id, scope, tenant_id, gateway_key, is_active, display_name, credentials, options`,
    [data.gateway_key, data.display_name ?? null, JSON.stringify(data.credentials), JSON.stringify(data.options ?? {})]
  );
  const row = ins.rows[0];
  return {
    ...row,
    credentials: (row.credentials as Record<string, unknown>) ?? {},
    options: (row.options as Record<string, unknown>) ?? {},
  };
}

/**
 * Retorna a config do tenant (scope tenant) para exibição na API (credenciais mascaradas).
 * Usado pelas rotas GET /api/me/tenant/payment-gateway.
 */
export async function getTenantConfig(tenantId: string): Promise<PaymentGatewayConfigPublic | null> {
  const r = await pool.query<PaymentGatewayConfigRow & { status?: string; last_connection_test_at?: string | null; last_connection_status?: string | null }>(
    `SELECT id, scope, tenant_id, gateway_key, is_active, display_name, credentials, options,
            status, last_connection_test_at, last_connection_status
     FROM payment_gateway_configs
     WHERE scope = 'tenant' AND tenant_id = $1 AND is_active = true
     LIMIT 1`,
    [tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const credentials = (row.credentials as Record<string, unknown>) ?? {};
  const env = credentials.env === 'production' ? 'production' : 'sandbox';
  return {
    id: row.id,
    scope: 'tenant',
    gateway_key: row.gateway_key,
    display_name: row.display_name,
    options: (row.options as Record<string, unknown>) ?? {},
    hasCredentials: Object.keys(credentials).length > 0,
    credentialsMasked: maskCredentials(credentials),
    api_key_masked: maskApiKeyWithSuffix(credentials.api_key),
    status: (row.status as PaymentGatewayConfigStatus) ?? undefined,
    last_connection_test_at: row.last_connection_test_at ?? undefined,
    last_connection_status: (row.last_connection_status as LastConnectionStatus) ?? undefined,
    environment: env,
    webhook_configured: !!row.gateway_key,
  };
}

/**
 * Salva/atualiza a config do tenant (scope tenant). Valida gateway_key.
 * Desativa qualquer outra config ativa do tenant; ativa/insere a config para o gateway_key informado.
 */
export async function saveTenantConfig(
  tenantId: string,
  data: {
    gateway_key: string;
    display_name?: string | null;
    credentials: Record<string, unknown>;
    options?: Record<string, unknown>;
  }
): Promise<PaymentGatewayConfigRow> {
  const valid = await isGatewayKeyValid(data.gateway_key);
  if (!valid) {
    throw new Error(`Gateway "${data.gateway_key}" não existe ou não está habilitado.`);
  }

  await pool.query(
    `UPDATE payment_gateway_configs SET is_active = false WHERE scope = 'tenant' AND tenant_id = $1 AND is_active = true`,
    [tenantId]
  );

  const existing = await pool.query<PaymentGatewayConfigRow>(
    `SELECT id, scope, tenant_id, gateway_key, is_active, display_name, credentials, options
     FROM payment_gateway_configs WHERE scope = 'tenant' AND tenant_id = $1 AND gateway_key = $2`,
    [tenantId, data.gateway_key]
  );

  if (existing.rows.length > 0) {
    const existingCreds = (existing.rows[0].credentials as Record<string, unknown>) ?? {};
    const mergedCredentials: Record<string, unknown> = { ...existingCreds };
    for (const [k, v] of Object.entries(data.credentials)) {
      if (v !== '' && v !== '••••••••' && v != null) mergedCredentials[k] = v;
    }
    const u = await pool.query<PaymentGatewayConfigRow>(
      `UPDATE payment_gateway_configs
       SET is_active = true, status = 'pending', display_name = $3, credentials = $4::jsonb, options = $5::jsonb, updated_at = now()
       WHERE scope = 'tenant' AND tenant_id = $1 AND gateway_key = $2
       RETURNING id, scope, tenant_id, gateway_key, is_active, display_name, credentials, options`,
      [tenantId, data.gateway_key, data.display_name ?? null, JSON.stringify(mergedCredentials), JSON.stringify(data.options ?? {})]
    );
    const row = u.rows[0];
    return {
      ...row,
      credentials: (row.credentials as Record<string, unknown>) ?? {},
      options: (row.options as Record<string, unknown>) ?? {},
    };
  }

  const ins = await pool.query<PaymentGatewayConfigRow>(
    `INSERT INTO payment_gateway_configs (scope, tenant_id, gateway_key, is_active, status, display_name, credentials, options)
     VALUES ('tenant', $1, $2, true, 'pending', $3, $4::jsonb, $5::jsonb)
     RETURNING id, scope, tenant_id, gateway_key, is_active, display_name, credentials, options`,
    [tenantId, data.gateway_key, data.display_name ?? null, JSON.stringify(data.credentials), JSON.stringify(data.options ?? {})]
  );
  const row = ins.rows[0];
  return {
    ...row,
    credentials: (row.credentials as Record<string, unknown>) ?? {},
    options: (row.options as Record<string, unknown>) ?? {},
  };
}

/**
 * Define status da config do tenant para um gateway (Fase 7 — ex.: disabled).
 */
export async function setTenantGatewayStatus(
  tenantId: string,
  gatewayKey: string,
  status: PaymentGatewayConfigStatus
): Promise<void> {
  await pool.query(
    `UPDATE payment_gateway_configs
     SET status = $3, updated_at = now()
     WHERE scope = 'tenant' AND tenant_id = $1 AND gateway_key = $2`,
    [tenantId, gatewayKey, status]
  );
}

/**
 * Atualiza resultado do teste de conexão na config (Fase 3).
 */
export async function updateConnectionTestResult(
  scope: 'global' | 'tenant',
  tenantId: string | null,
  gatewayKey: string,
  lastConnectionStatus: LastConnectionStatus,
  status: 'active' | 'error'
): Promise<void> {
  if (scope === 'tenant' && tenantId) {
    await pool.query(
      `UPDATE payment_gateway_configs
       SET last_connection_test_at = now(), last_connection_status = $3, status = $4, updated_at = now()
       WHERE scope = 'tenant' AND tenant_id = $1 AND gateway_key = $2`,
      [tenantId, gatewayKey, lastConnectionStatus, status]
    );
    return;
  }
  if (scope === 'global') {
    await pool.query(
      `UPDATE payment_gateway_configs
       SET last_connection_test_at = now(), last_connection_status = $2, status = $3, updated_at = now()
       WHERE scope = 'global' AND gateway_key = $1`,
      [gatewayKey, lastConnectionStatus, status]
    );
  }
}

/**
 * Retorna todas as configs do tenant por gateway_key (para status do painel — Fase 7).
 */
async function getTenantConfigsForStatus(tenantId: string): Promise<Map<string, {
  status: PaymentGatewayConfigStatus | null;
  last_connection_test_at: string | null;
  last_connection_status: LastConnectionStatus | null;
  environment: 'sandbox' | 'production' | null;
  hasCredentials: boolean;
}>> {
  const r = await pool.query<{
    gateway_key: string;
    status: string | null;
    last_connection_test_at: string | null;
    last_connection_status: string | null;
    credentials: unknown;
  }>(
    `SELECT gateway_key, status, last_connection_test_at, last_connection_status, credentials
     FROM payment_gateway_configs
     WHERE scope = 'tenant' AND tenant_id = $1`,
    [tenantId]
  );
  const map = new Map<string, {
    status: PaymentGatewayConfigStatus | null;
    last_connection_test_at: string | null;
    last_connection_status: LastConnectionStatus | null;
    environment: 'sandbox' | 'production' | null;
    hasCredentials: boolean;
  }>();
  for (const row of r.rows) {
    const credentials = (row.credentials as Record<string, unknown>) ?? {};
    const env = credentials.env === 'production' ? 'production' : 'sandbox';
    map.set(row.gateway_key, {
      status: (row.status as PaymentGatewayConfigStatus) ?? null,
      last_connection_test_at: row.last_connection_test_at,
      last_connection_status: (row.last_connection_status as LastConnectionStatus) ?? null,
      environment: env,
      hasCredentials: Object.keys(credentials).length > 0 && !!credentials.api_key,
    });
  }
  return map;
}

/**
 * Lista gateways com status para o painel (GET .../payment-gateways/status).
 * Fase 7: tenant usa todas as configs por gateway_key (inclui status disabled).
 */
export async function getGatewaysStatus(
  scope: 'global' | 'tenant',
  tenantId?: string
): Promise<GatewayStatusItem[]> {
  const gateways = await listGateways();
  let config: (PaymentGatewayConfigPublic & { gateway_key: string }) | null = null;
  let tenantConfigs: Map<string, {
    status: PaymentGatewayConfigStatus | null;
    last_connection_test_at: string | null;
    last_connection_status: LastConnectionStatus | null;
    environment: 'sandbox' | 'production' | null;
    hasCredentials: boolean;
  }> | null = null;

  if (scope === 'tenant' && tenantId) {
    tenantConfigs = await getTenantConfigsForStatus(tenantId);
  }
  if (scope === 'global') {
    config = await getGlobalConfig();
  }

  return gateways.map((g): GatewayStatusItem => {
    if (tenantConfigs) {
      const cfg = tenantConfigs.get(g.key);
      const configured = !!(cfg && cfg.hasCredentials);
      return {
        key: g.key,
        name: g.name,
        is_enabled: g.is_enabled,
        configured,
        connection_status: cfg?.last_connection_status ?? null,
        last_connection_test_at: cfg?.last_connection_test_at ?? null,
        environment: cfg?.environment ?? null,
        webhook_configured: configured && !!g.key,
        status: cfg?.status ?? null,
      };
    }
    const isConfigured = !!(config && config.gateway_key === g.key);
    return {
      key: g.key,
      name: g.name,
      is_enabled: g.is_enabled,
      configured: isConfigured,
      connection_status: isConfigured && config?.last_connection_status ? config.last_connection_status : null,
      last_connection_test_at: isConfigured && config?.last_connection_test_at ? config.last_connection_test_at : null,
      environment: isConfigured && config?.environment ? config.environment : null,
      webhook_configured: isConfigured && (config?.webhook_configured ?? false),
      status: isConfigured && config?.status ? config.status : null,
    };
  });
}
