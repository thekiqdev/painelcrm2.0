import { randomBytes } from 'crypto';
import { pool } from '../utils/db.js';
import { saveTenantConfig, getConfigForTest, updateConnectionTestResult } from './paymentGatewayConfigService.js';
import { testConnection } from '../modules/gateways/asaas/services/asaasService.js';
import { createWebhook, listWebhooks } from '../modules/gateways/asaas/client/asaasClient.js';
import {
  ASAAS_PIX_AUTOMATIC_WEBHOOK_EVENT_NAMES,
} from '../modules/gateways/asaas/asaasEvents.js';

export type AsaasEnvironment = 'sandbox' | 'production';

export type AsaasIntegrationStatusDto = {
  api: 'connected' | 'error' | 'not_configured';
  webhook: 'created' | 'pending' | 'error';
  environment: AsaasEnvironment | null;
  webhook_url: string | null;
  webhook_id: string | null;
  last_test_at: string | null;
  last_webhook_received_at: string | null;
  last_webhook_error: string | null;
  friendly_message: string;
  webhook_email?: string | null;
  webhook_events?: string[];
  webhook_auth_token?: string | null;
  gateway_status?: string | null;
};

/** PAYMENT_* + PIX_AUTOMATIC_* (CRM0 / SaaS) — lista única de provisionamento. */
const ASAAS_WEBHOOK_EVENTS = [
  'PAYMENT_CREATED',
  'PAYMENT_UPDATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_DELETED',
  'PAYMENT_REFUNDED',
  'PAYMENT_RESTORED',
  'PAYMENT_REFUND_IN_PROGRESS',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_CHARGEBACK_DISPUTE',
  'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
  ...ASAAS_PIX_AUTOMATIC_WEBHOOK_EVENT_NAMES,
] as const;

function normalizeEnvironment(raw: unknown): AsaasEnvironment {
  return String(raw || '').trim().toLowerCase() === 'production' ? 'production' : 'sandbox';
}

function webhookUrlFromBase(publicApiUrl: string): string {
  const base = publicApiUrl.replace(/\/$/, '');
  return `${base}/api/webhooks/asaas`;
}

function validatePublicApiUrlForWebhook(rawUrl: string): { ok: true; webhookUrl: string } | { ok: false; reason: string } {
  const base = String(rawUrl || '').trim();
  if (!base) {
    return {
      ok: false,
      reason: 'A URL pública do sistema não está configurada. Configure PUBLIC_API_URL para criar o webhook automaticamente.',
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    return {
      ok: false,
      reason: 'A URL pública do sistema é inválida. Configure PUBLIC_API_URL com uma URL HTTPS válida.',
    };
  }
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
    return {
      ok: false,
      reason: 'A URL pública do sistema não está configurada. Configure PUBLIC_API_URL para criar o webhook automaticamente.',
    };
  }
  if (parsed.protocol !== 'https:') {
    return {
      ok: false,
      reason: 'A URL pública do sistema não está configurada. Configure PUBLIC_API_URL com o domínio público do backend para criar o webhook automaticamente.',
    };
  }
  return { ok: true, webhookUrl: webhookUrlFromBase(base) };
}

function generateWebhookAuthToken(): string {
  return randomBytes(36).toString('base64url');
}

function mapAsaasError(error: unknown, environment: AsaasEnvironment): string {
  const msg = error instanceof Error ? error.message : String(error || '');
  const lower = msg.toLowerCase();
  if (lower.includes('401') || lower.includes('403') || lower.includes('autenticação')) {
    return 'API Key inválida ou sem permissão para este ambiente.';
  }
  if (lower.includes('webhook') && (lower.includes('write') || lower.includes('forbidden'))) {
    return 'A API Key não possui permissão WEBHOOK:WRITE.';
  }
  if (lower.includes('limit') && lower.includes('webhook')) {
    return 'Limite de webhooks atingido no Asaas.';
  }
  if (lower.includes('sandbox') && environment === 'production') {
    return 'A chave parece ser de Sandbox, mas o ambiente selecionado é Produção.';
  }
  if (lower.includes('production') && environment === 'sandbox') {
    return 'A chave parece ser de Produção, mas o ambiente selecionado é Sandbox.';
  }
  return msg || 'Falha ao integrar com o Asaas.';
}

type TenantAsaasConfigRow = {
  id: string;
  tenant_id: string;
  credentials: Record<string, unknown> | null;
  status: string | null;
  last_connection_test_at: string | null;
  last_connection_status: string | null;
  webhook_id: string | null;
  webhook_auth_token: string | null;
  webhook_status: string | null;
  webhook_url: string | null;
  webhook_email: string | null;
  webhook_events: unknown;
  last_webhook_received_at: string | null;
  last_webhook_error: string | null;
};

async function getTenantAsaasConfigRow(tenantId: string): Promise<TenantAsaasConfigRow | null> {
  const r = await pool.query<TenantAsaasConfigRow>(
    `SELECT id, tenant_id, credentials, status, last_connection_test_at, last_connection_status,
            webhook_id, webhook_auth_token, webhook_status, webhook_url, webhook_email, webhook_events,
            last_webhook_received_at, last_webhook_error
     FROM payment_gateway_configs
     WHERE scope = 'tenant' AND tenant_id = $1::uuid AND gateway_key = 'asaas'
     ORDER BY is_active DESC, updated_at DESC
     LIMIT 1`,
    [tenantId],
  );
  return r.rows[0] ?? null;
}

function parseWebhookEvents(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

export async function getAsaasIntegrationStatus(tenantId: string): Promise<AsaasIntegrationStatusDto> {
  const row = await getTenantAsaasConfigRow(tenantId);
  if (!row) {
    return {
      api: 'not_configured',
      webhook: 'pending',
      environment: null,
      webhook_url: null,
      webhook_id: null,
      last_test_at: null,
      last_webhook_received_at: null,
      last_webhook_error: null,
      friendly_message: 'Asaas não configurado.',
      webhook_email: null,
      webhook_events: [],
      gateway_status: null,
    };
  }
  const credentials = (row.credentials ?? {}) as Record<string, unknown>;
  const environment = normalizeEnvironment(credentials.env);
  const api = row.last_connection_status === 'ok' ? 'connected' : row.last_connection_status ? 'error' : 'not_configured';
  const webhook =
    row.webhook_id && row.webhook_status !== 'error'
      ? 'created'
      : ((row.webhook_status as 'created' | 'pending' | 'error' | null) ?? 'pending');
  const friendly_message =
    api === 'connected' && webhook === 'created'
      ? 'Asaas conectado e webhook ativo.'
      : api === 'connected' && webhook !== 'created'
        ? 'Falta só um passo para finalizar a integração. Clique em Ativar integração para configurar automaticamente o recebimento de atualizações do Asaas.'
        : api === 'error'
          ? 'Asaas configurado com erro de conexão.'
          : 'Asaas não configurado.';
  return {
    api,
    webhook,
    environment,
    webhook_url: row.webhook_url,
    webhook_id: row.webhook_id,
    last_test_at: row.last_connection_test_at,
    last_webhook_received_at: row.last_webhook_received_at,
    last_webhook_error: row.last_webhook_error,
    friendly_message,
    webhook_email: row.webhook_email,
    webhook_events: parseWebhookEvents(row.webhook_events),
    webhook_auth_token: row.webhook_auth_token,
    gateway_status: row.status,
  };
}

async function updateWebhookFields(
  tenantId: string,
  payload: {
    webhookId?: string | null;
    webhookAuthToken?: string | null;
    webhookStatus?: 'created' | 'pending' | 'error' | null;
    webhookUrl?: string | null;
    webhookEmail?: string | null;
    webhookEvents?: string[] | null;
    lastWebhookError?: string | null;
  },
): Promise<void> {
  await pool.query(
    `UPDATE payment_gateway_configs
     SET webhook_id = COALESCE($2::text, webhook_id),
         webhook_auth_token = COALESCE($3::text, webhook_auth_token),
         webhook_status = COALESCE($4::text, webhook_status),
         webhook_url = COALESCE($5::text, webhook_url),
         webhook_email = COALESCE($6::text, webhook_email),
         webhook_events = COALESCE($7::jsonb, webhook_events),
         last_webhook_error = $8::text,
         updated_at = now()
     WHERE scope = 'tenant' AND tenant_id = $1::uuid AND gateway_key = 'asaas' AND is_active = true`,
    [
      tenantId,
      payload.webhookId ?? null,
      payload.webhookAuthToken ?? null,
      payload.webhookStatus ?? null,
      payload.webhookUrl ?? null,
      payload.webhookEmail ?? null,
      payload.webhookEvents ? JSON.stringify(payload.webhookEvents) : null,
      payload.lastWebhookError ?? null,
    ],
  );
}

export async function connectAsaasIntegration(params: {
  tenantId: string;
  environment: AsaasEnvironment;
  apiKey: string;
  webhookEmail?: string | null;
  webhookAuthTokenManual?: string | null;
  fallbackEmail?: string | null;
  publicApiUrl: string;
}): Promise<AsaasIntegrationStatusDto> {
  const env = normalizeEnvironment(params.environment);
  const current = await getConfigForTest('tenant', params.tenantId, 'asaas');
  const currentCredentials = (current?.credentials ?? {}) as Record<string, unknown>;
  const apiKey = String(params.apiKey || currentCredentials.api_key || '').trim();
  if (!apiKey) throw new Error('API Key é obrigatória.');
  const urlValidation = validatePublicApiUrlForWebhook(params.publicApiUrl);

  const asaasConfig = { api_key: apiKey, env };
  try {
    await testConnection(asaasConfig);
  } catch (error) {
    await updateConnectionTestResult('tenant', params.tenantId, 'asaas', 'auth_error', 'error');
    throw new Error(mapAsaasError(error, env));
  }

  const previousCredentials = currentCredentials;
  const keepWebhookToken =
    typeof previousCredentials.webhook_auth_token === 'string' && previousCredentials.webhook_auth_token.trim()
      ? previousCredentials.webhook_auth_token.trim()
      : null;
  const manualToken = String(params.webhookAuthTokenManual || '').trim();
  if (manualToken) {
    if (manualToken.includes(' ') || manualToken.length < 32 || manualToken.length > 255) {
      throw new Error('Token manual inválido. Use entre 32 e 255 caracteres, sem espaços.');
    }
  }
  const webhookAuthToken = manualToken || keepWebhookToken || generateWebhookAuthToken();
  const effectiveWebhookEmail = String(params.webhookEmail || params.fallbackEmail || '').trim() || null;

  await saveTenantConfig(params.tenantId, {
    gateway_key: 'asaas',
    credentials: { ...previousCredentials, api_key: apiKey, env, webhook_auth_token: webhookAuthToken },
    options: { ...(current?.options ?? {}), env },
  });
  await updateConnectionTestResult('tenant', params.tenantId, 'asaas', 'ok', 'active');

  const webhookUrl = urlValidation.ok ? urlValidation.webhookUrl : null;
  const rowAfterSave = await getTenantAsaasConfigRow(params.tenantId);
  if (rowAfterSave?.webhook_id) {
    return getAsaasIntegrationStatus(params.tenantId);
  }

  if (!urlValidation.ok || !webhookUrl) {
    await updateWebhookFields(params.tenantId, {
      webhookStatus: 'error',
      webhookUrl: null,
      webhookEmail: effectiveWebhookEmail,
      webhookEvents: [...ASAAS_WEBHOOK_EVENTS],
      lastWebhookError: urlValidation.ok ? null : urlValidation.reason,
    });
    return getAsaasIntegrationStatus(params.tenantId);
  }

  if (!effectiveWebhookEmail) {
    const reason = 'E-mail do webhook não informado. Preencha o e-mail para notificações do webhook.';
    await updateWebhookFields(params.tenantId, {
      webhookStatus: 'error',
      webhookUrl,
      webhookEmail: null,
      webhookEvents: [...ASAAS_WEBHOOK_EVENTS],
      lastWebhookError: reason,
    });
    return getAsaasIntegrationStatus(params.tenantId);
  }

  try {
    console.info('[asaas.connect] starting webhook provisioning', {
      tenant_id: params.tenantId,
      environment: env,
      webhook_url: webhookUrl,
      webhook_email: effectiveWebhookEmail,
      sendType: 'SEQUENTIALLY',
      apiVersion: 3,
      events_count: ASAAS_WEBHOOK_EVENTS.length,
      authToken_length: webhookAuthToken.length,
    });
    let candidate = null as { id: string; authToken?: string } | null;
    try {
      const existing = await listWebhooks(asaasConfig);
      const matched = existing.find((w) => {
        const byUrl = typeof w.url === 'string' && w.url.trim() === webhookUrl;
        const byName = typeof w.name === 'string' && w.name.trim().toLowerCase() === 'painelcrm - pagamentos';
        return byUrl || byName;
      });
      if (matched?.id) {
        candidate = { id: matched.id, authToken: typeof matched.authToken === 'string' ? matched.authToken : undefined };
      }
    } catch {
      // Se não puder listar webhooks (permissão/plano), seguimos com tentativa de criação.
    }

    const created = candidate
      ? candidate
      : await createWebhook(
          {
            name: 'PainelCRM - Pagamentos',
            url: webhookUrl,
            email: effectiveWebhookEmail,
            enabled: true,
            interrupted: false,
            apiVersion: 3,
            authToken: webhookAuthToken,
            sendType: 'SEQUENTIALLY',
            events: [...ASAAS_WEBHOOK_EVENTS],
          },
          asaasConfig,
        );
    if (candidate) {
      // Reuso por URL/nome não atualiza a lista de eventos na Asaas.
      // Tenants existentes precisam de POST …/asaas/recreate-webhook (CRM0 G2).
      console.warn('[asaas.connect] webhook reused; recreate-webhook to subscribe PIX_AUTOMATIC_*', {
        tenant_id: params.tenantId,
        webhook_id: candidate.id,
        expected_events: ASAAS_WEBHOOK_EVENTS.length,
      });
    }
    await updateWebhookFields(params.tenantId, {
      webhookId: typeof created.id === 'string' ? created.id : null,
      webhookAuthToken:
        typeof created.authToken === 'string' && created.authToken.trim() ? created.authToken.trim() : webhookAuthToken,
      webhookStatus: 'created',
      webhookUrl,
      webhookEmail: effectiveWebhookEmail,
      webhookEvents: [...ASAAS_WEBHOOK_EVENTS],
      lastWebhookError: null,
    });
    console.info('[asaas.connect] webhook configured', {
      tenant_id: params.tenantId,
      environment: env,
      webhook_url: webhookUrl,
      mode: candidate ? 'reused' : 'created',
    });
  } catch (error) {
    const mappedError = mapAsaasError(error, env);
    console.warn('[asaas.connect] webhook provisioning failed', {
      tenant_id: params.tenantId,
      environment: env,
      webhook_url: webhookUrl,
      error: mappedError,
    });
    await updateWebhookFields(params.tenantId, {
      webhookStatus: 'error',
      webhookUrl,
      webhookEmail: effectiveWebhookEmail,
      webhookEvents: [...ASAAS_WEBHOOK_EVENTS],
      lastWebhookError: mappedError,
    });
    // Não desfaz a configuração de API Key; status refletirá "conectado, webhook pendente".
  }

  return getAsaasIntegrationStatus(params.tenantId);
}

export async function testAsaasIntegration(params: {
  tenantId: string;
  environment?: AsaasEnvironment;
  apiKey?: string;
}): Promise<{ connected: boolean; status: AsaasIntegrationStatusDto }> {
  const cfg = await getConfigForTest('tenant', params.tenantId, 'asaas');
  const storedCredentials = (cfg?.credentials ?? {}) as Record<string, unknown>;
  const env = normalizeEnvironment(params.environment ?? storedCredentials.env ?? 'sandbox');
  const apiKey = String(params.apiKey || storedCredentials.api_key || '').trim();
  if (!apiKey) throw new Error('API Key não configurada.');
  try {
    await testConnection({ api_key: apiKey, env });
    await updateConnectionTestResult('tenant', params.tenantId, 'asaas', 'ok', 'active');
    return { connected: true, status: await getAsaasIntegrationStatus(params.tenantId) };
  } catch (error) {
    await updateConnectionTestResult('tenant', params.tenantId, 'asaas', 'auth_error', 'error');
    throw new Error(mapAsaasError(error, env));
  }
}

export async function recreateAsaasWebhook(params: {
  tenantId: string;
  webhookEmail?: string | null;
  webhookAuthTokenManual?: string | null;
  fallbackEmail?: string | null;
  publicApiUrl: string;
}): Promise<AsaasIntegrationStatusDto> {
  const cfg = await getConfigForTest('tenant', params.tenantId, 'asaas');
  if (!cfg) throw new Error('Integração Asaas não configurada para este tenant.');
  const credentials = (cfg.credentials ?? {}) as Record<string, unknown>;
  const apiKey = String(credentials.api_key || '').trim();
  if (!apiKey) throw new Error('API Key não configurada.');
  const env = normalizeEnvironment(credentials.env);
  const manualToken = String(params.webhookAuthTokenManual || '').trim();
  if (manualToken) {
    if (manualToken.includes(' ') || manualToken.length < 32 || manualToken.length > 255) {
      throw new Error('Token manual inválido. Use entre 32 e 255 caracteres, sem espaços.');
    }
  }
  const keepWebhookToken =
    typeof credentials.webhook_auth_token === 'string' && credentials.webhook_auth_token.trim()
      ? credentials.webhook_auth_token.trim()
      : null;
  const webhookAuthToken = manualToken || keepWebhookToken || generateWebhookAuthToken();
  const effectiveWebhookEmail = String(params.webhookEmail || params.fallbackEmail || '').trim() || null;
  const urlValidation = validatePublicApiUrlForWebhook(params.publicApiUrl);
  if (!urlValidation.ok) {
    await updateWebhookFields(params.tenantId, {
      webhookStatus: 'error',
      webhookUrl: null,
      webhookEmail: effectiveWebhookEmail,
      webhookEvents: [...ASAAS_WEBHOOK_EVENTS],
      lastWebhookError: urlValidation.reason,
    });
    throw new Error(urlValidation.reason);
  }
  const webhookUrl = urlValidation.webhookUrl;
  const asaasConfig = { api_key: apiKey, env };
  if (!effectiveWebhookEmail) {
    const reason = 'E-mail do webhook não informado. Preencha o e-mail para notificações do webhook.';
    await updateWebhookFields(params.tenantId, {
      webhookStatus: 'error',
      webhookUrl,
      webhookEmail: null,
      webhookEvents: [...ASAAS_WEBHOOK_EVENTS],
      lastWebhookError: reason,
    });
    throw new Error(reason);
  }

  try {
    console.info('[asaas.recreateWebhook] starting', {
      tenant_id: params.tenantId,
      environment: env,
      webhook_url: webhookUrl,
      webhook_email: effectiveWebhookEmail,
      sendType: 'SEQUENTIALLY',
      apiVersion: 3,
      events_count: ASAAS_WEBHOOK_EVENTS.length,
      authToken_length: webhookAuthToken.length,
    });
    const created = await createWebhook(
      {
        name: 'PainelCRM - Pagamentos',
        url: webhookUrl,
        email: effectiveWebhookEmail,
        enabled: true,
        interrupted: false,
        apiVersion: 3,
        authToken: webhookAuthToken,
        sendType: 'SEQUENTIALLY',
        events: [...ASAAS_WEBHOOK_EVENTS],
      },
      asaasConfig,
    );

    await saveTenantConfig(params.tenantId, {
      gateway_key: 'asaas',
      credentials: {
        ...credentials,
        api_key: apiKey,
        env,
        webhook_auth_token:
          typeof created.authToken === 'string' && created.authToken.trim() ? created.authToken.trim() : webhookAuthToken,
      },
      options: { ...(cfg.options ?? {}), env },
    });
    await updateWebhookFields(params.tenantId, {
      webhookId: typeof created.id === 'string' ? created.id : null,
      webhookAuthToken:
        typeof created.authToken === 'string' && created.authToken.trim() ? created.authToken.trim() : webhookAuthToken,
      webhookStatus: 'created',
      webhookUrl,
      webhookEmail: effectiveWebhookEmail,
      webhookEvents: [...ASAAS_WEBHOOK_EVENTS],
      lastWebhookError: null,
    });
    console.info('[asaas.recreateWebhook] success', {
      tenant_id: params.tenantId,
      environment: env,
      webhook_url: webhookUrl,
    });
  } catch (error) {
    const mappedError = mapAsaasError(error, env);
    console.warn('[asaas.recreateWebhook] failed', {
      tenant_id: params.tenantId,
      environment: env,
      webhook_url: webhookUrl,
      error: mappedError,
    });
    await updateWebhookFields(params.tenantId, {
      webhookStatus: 'error',
      webhookUrl,
      webhookEmail: effectiveWebhookEmail,
      webhookEvents: [...ASAAS_WEBHOOK_EVENTS],
      lastWebhookError: mappedError,
    });
    throw new Error(`Falha ao recriar webhook: ${mappedError}`);
  }

  return getAsaasIntegrationStatus(params.tenantId);
}
