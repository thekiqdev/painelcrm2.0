/**
 * Integração Mercado Pago — Fase 2: OAuth + status (sem cobrança / webhook).
 */
import { randomBytes } from 'crypto';
import {
  encryptMercadoPagoOAuthToken,
  decryptMercadoPagoOAuthToken,
  isMercadoPagoOAuthTokenEncryptionConfigured,
} from './mercadoPagoOAuthTokenCrypto.js';
import {
  signMercadoPagoOAuthState,
  verifyMercadoPagoOAuthState,
  isMercadoPagoOAuthStateSecretConfigured,
} from './mercadoPagoOAuthState.js';
import {
  upsertMercadoPagoTenantCredentials,
  getMercadoPagoTenantConfigRow,
  clearMercadoPagoTenantCredentials,
} from './mercadoPagoCredentialsRepository.js';
import { exchangeAuthorizationCode, getMercadoPagoUserMe } from '../modules/gateways/mercado_pago/client/mercadoPagoOAuthApi.js';
import {
  getMercadoPagoAuthBaseUrlForEnvironment,
  getMercadoPagoConfiguredOAuthEnvironment,
  getMercadoPagoFrontendRedirectBase,
  isMercadoPagoGatewayEnabled,
} from '../config/mercadoPagoGatewayEnv.js';
import { updateConnectionTestResult } from './paymentGatewayConfigService.js';
import { invalidateGatewayCache } from '../modules/payments/gatewayProvider.js';

const GATEWAY_KEY = 'mercado_pago';

function parseMercadoPagoTokenLiveMode(token: { live_mode?: unknown }): boolean | null {
  const v = token.live_mode;
  if (v === true || v === 'true' || v === 1 || v === '1') return true;
  if (v === false || v === 'false' || v === 0 || v === '0') return false;
  return null;
}

/** Usa live_mode do token quando confiável; se ausente, MERCADO_PAGO_OAUTH_ENVIRONMENT (default production). */
function resolveMercadoPagoEnvFromOAuthToken(token: { live_mode?: unknown }): 'sandbox' | 'production' {
  const lm = parseMercadoPagoTokenLiveMode(token);
  if (lm === true) return 'production';
  if (lm === false) return 'sandbox';
  return getMercadoPagoConfiguredOAuthEnvironment();
}

export type MercadoPagoIntegrationStatusDto = {
  connected: boolean;
  environment: 'sandbox' | 'production' | null;
  user_id: string | null;
  last_test_at: string | null;
  last_connection_status: string | null;
  config_status: string | null;
  is_active_gateway: boolean;
  encryption_configured: boolean;
  oauth_state_configured: boolean;
};

function getOAuthClientConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = String(process.env.MERCADO_PAGO_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.MERCADO_PAGO_CLIENT_SECRET || '').trim();
  const redirectUri = String(process.env.MERCADO_PAGO_REDIRECT_URI || '').trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('MERCADO_PAGO_CLIENT_ID, MERCADO_PAGO_CLIENT_SECRET e MERCADO_PAGO_REDIRECT_URI são obrigatórios.');
  }
  return { clientId, clientSecret, redirectUri };
}

export function getMercadoPagoAvailabilitySync(): {
  enabled: boolean;
  encryption_configured: boolean;
  oauth_state_configured: boolean;
  oauth_client_configured: boolean;
  oauth_environment: 'sandbox' | 'production';
} {
  const clientId = String(process.env.MERCADO_PAGO_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.MERCADO_PAGO_CLIENT_SECRET || '').trim();
  const redirectUri = String(process.env.MERCADO_PAGO_REDIRECT_URI || '').trim();
  return {
    enabled: isMercadoPagoGatewayEnabled(),
    encryption_configured: isMercadoPagoOAuthTokenEncryptionConfigured(),
    oauth_state_configured: isMercadoPagoOAuthStateSecretConfigured(),
    oauth_client_configured: !!(clientId && clientSecret && redirectUri),
    oauth_environment: getMercadoPagoConfiguredOAuthEnvironment(),
  };
}

export function buildMercadoPagoConnectUrl(params: { tenantId: string; userId: string }): string {
  if (!isMercadoPagoOAuthTokenEncryptionConfigured()) {
    throw new Error('Criptografia OAuth não configurada (MERCADO_PAGO_OAUTH_TOKEN_ENCRYPTION_KEY).');
  }
  if (!isMercadoPagoOAuthStateSecretConfigured()) {
    throw new Error('State OAuth não configurado (MERCADO_PAGO_OAUTH_STATE_SECRET).');
  }
  const { clientId, redirectUri } = getOAuthClientConfig();
  const exp = Date.now() + 10 * 60 * 1000;
  const state = signMercadoPagoOAuthState({
    tenantId: params.tenantId,
    userId: params.userId,
    exp,
    nonce: randomBytes(16).toString('hex'),
  });
  const oauthEnv = getMercadoPagoConfiguredOAuthEnvironment();
  const base = getMercadoPagoAuthBaseUrlForEnvironment(oauthEnv);
  const u = new URL('/authorization', base.endsWith('/') ? base : `${base}/`);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  u.searchParams.set('platform_id', 'mp');
  return u.toString();
}

export async function handleMercadoPagoOAuthCallback(params: {
  code: string | undefined;
  state: string | undefined;
  error?: string | undefined;
}): Promise<{ redirectUrl: string }> {
  const front = getMercadoPagoFrontendRedirectBase();
  const fail = (code: string, msg?: string) => {
    const q = new URLSearchParams({ mp_oauth: code });
    if (msg) q.set('mp_oauth_msg', msg.slice(0, 200));
    return { redirectUrl: `${front}/settings/payments/mercado_pago?${q.toString()}` };
  };

  if (params.error) {
    return fail('error', String(params.error));
  }
  if (!params.code || !params.state) {
    return fail('error', 'Parâmetros OAuth ausentes.');
  }

  const payload = verifyMercadoPagoOAuthState(params.state);
  if (!payload) {
    return fail('error', 'State inválido ou expirado.');
  }

  if (!isMercadoPagoOAuthTokenEncryptionConfigured()) {
    return fail('error', 'Servidor sem criptografia de tokens.');
  }

  try {
    const { clientId, clientSecret, redirectUri } = getOAuthClientConfig();
    const token = await exchangeAuthorizationCode({
      clientId,
      clientSecret,
      code: params.code,
      redirectUri,
    });
    const access = typeof token.access_token === 'string' ? token.access_token : '';
    if (!access) {
      return fail('error', 'Resposta OAuth sem access_token.');
    }
    const refresh = typeof token.refresh_token === 'string' ? token.refresh_token : '';
    const expiresIn = typeof token.expires_in === 'number' ? token.expires_in : 0;
    const expiresAt =
      expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    const env = resolveMercadoPagoEnvFromOAuthToken(token);
    const userIdMp =
      token.user_id != null && token.user_id !== undefined ? String(token.user_id) : null;

    const credentials: Record<string, unknown> = {
      oauth_access_token_ciphertext: encryptMercadoPagoOAuthToken(access),
      env,
    };
    if (refresh) {
      credentials.oauth_refresh_token_ciphertext = encryptMercadoPagoOAuthToken(refresh);
    }
    if (expiresAt) {
      credentials.oauth_token_expires_at = expiresAt;
    }
    if (typeof token.scope === 'string' && token.scope) {
      credentials.oauth_scope = token.scope;
    }
    if (userIdMp) {
      credentials.mercado_pago_user_id = userIdMp;
    }

    await upsertMercadoPagoTenantCredentials({
      tenantId: payload.tenantId,
      credentials,
      status: 'active',
      lastConnectionStatus: 'ok',
    });
    invalidateGatewayCache();

    return { redirectUrl: `${front}/settings/payments/mercado_pago?mp_oauth=success` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[mercado_pago.oauth.callback]', { message: msg.slice(0, 200) });
    return fail('error', msg);
  }
}

export async function getMercadoPagoIntegrationStatus(tenantId: string): Promise<MercadoPagoIntegrationStatusDto> {
  const row = await getMercadoPagoTenantConfigRow(tenantId);
  const creds = row?.credentials ?? {};
  const hasToken = typeof creds.oauth_access_token_ciphertext === 'string' && creds.oauth_access_token_ciphertext.length > 0;
  const envStored = creds.env === 'production' ? 'production' : creds.env === 'sandbox' ? 'sandbox' : null;
  const environment =
    envStored ?? (hasToken ? getMercadoPagoConfiguredOAuthEnvironment() : null);

  return {
    connected: hasToken,
    environment,
    user_id: typeof creds.mercado_pago_user_id === 'string' ? creds.mercado_pago_user_id : null,
    last_test_at: row?.last_connection_test_at ?? null,
    last_connection_status: row?.last_connection_status ?? null,
    config_status: row?.status ?? null,
    is_active_gateway: row?.is_active === true,
    encryption_configured: isMercadoPagoOAuthTokenEncryptionConfigured(),
    oauth_state_configured: isMercadoPagoOAuthStateSecretConfigured(),
  };
}

function readDecryptedAccessToken(credentials: Record<string, unknown>): string {
  const ct = credentials.oauth_access_token_ciphertext;
  if (typeof ct !== 'string' || !ct) throw new Error('Mercado Pago não conectado.');
  return decryptMercadoPagoOAuthToken(ct);
}

export async function testMercadoPagoIntegration(tenantId: string): Promise<{
  ok: boolean;
  status: MercadoPagoIntegrationStatusDto;
}> {
  const row = await getMercadoPagoTenantConfigRow(tenantId);
  if (!row) {
    await updateConnectionTestResult('tenant', tenantId, GATEWAY_KEY, 'error', 'error');
    invalidateGatewayCache();
    return { ok: false, status: await getMercadoPagoIntegrationStatus(tenantId) };
  }
  try {
    const access = readDecryptedAccessToken(row.credentials);
    await getMercadoPagoUserMe(access);
    await updateConnectionTestResult('tenant', tenantId, GATEWAY_KEY, 'ok', 'active');
    invalidateGatewayCache();
    return { ok: true, status: await getMercadoPagoIntegrationStatus(tenantId) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isAuth = msg.includes('401') || msg.includes('403');
    await updateConnectionTestResult(
      'tenant',
      tenantId,
      GATEWAY_KEY,
      isAuth ? 'auth_error' : 'error',
      'error',
    );
    invalidateGatewayCache();
    throw new Error(isAuth ? 'Token Mercado Pago inválido ou expirado. Reconecte.' : msg);
  }
}

export async function disconnectMercadoPagoIntegration(tenantId: string): Promise<void> {
  await clearMercadoPagoTenantCredentials(tenantId);
  invalidateGatewayCache();
}
