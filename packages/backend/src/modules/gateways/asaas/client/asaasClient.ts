/**
 * Cliente HTTP para a API Asaas v3.
 * Timeout 10s, retry 2x em timeout/5xx.
 */
import type {
  AsaasConfig,
  AsaasCustomerRequest,
  AsaasCustomerResponse,
  AsaasPaymentRequest,
  AsaasPaymentResponse,
  AsaasPixQrCodeResponse,
} from '../asaasTypes.js';

const HTTP_TIMEOUT_MS = 10_000;
const HTTP_RETRY_ATTEMPTS = 2;

function getBaseUrlFromEnv(): string {
  const env = process.env.ASAAS_ENV || 'sandbox';
  if (env === 'production') return 'https://api.asaas.com/v3';
  return 'https://api-sandbox.asaas.com/v3';
}

function getBaseUrl(config?: AsaasConfig | null): string {
  if (config?.base_url) return config.base_url;
  if (config?.env === 'production') return 'https://api.asaas.com/v3';
  if (config?.env === 'sandbox') return 'https://api-sandbox.asaas.com/v3';
  return getBaseUrlFromEnv();
}

function getApiKey(config?: AsaasConfig | null): string | undefined {
  if (config?.api_key) return config.api_key;
  return process.env.ASAAS_API_KEY;
}

function isRetryable(status: number): boolean {
  return status >= 500 && status < 600;
}

async function request<T>(
  method: string,
  path: string,
  body?: object,
  config?: AsaasConfig | null
): Promise<T> {
  const apiKey = getApiKey(config);
  if (!apiKey) throw new Error('API key Asaas não configurada');
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= HTTP_RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          access_token: apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const text = await res.text();
      if (!res.ok) {
        if (attempt < HTTP_RETRY_ATTEMPTS && isRetryable(res.status)) {
          lastError = new Error(`Asaas API ${res.status}: ${text}`);
          continue;
        }
        throw new Error(`Asaas API ${res.status}: ${text}`);
      }
      if (res.status === 204 || text === '') return undefined as T;
      return JSON.parse(text) as T;
    } catch (e: unknown) {
      clearTimeout(timeoutId);
      const isAbort = e instanceof Error && e.name === 'AbortError';
      const isRetryableErr = isAbort || (e instanceof Error && e.message.includes('5'));
      if (attempt < HTTP_RETRY_ATTEMPTS && isRetryableErr) {
        lastError = e instanceof Error ? e : new Error(String(e));
        continue;
      }
      throw e;
    }
  }
  throw lastError ?? new Error('Asaas API request failed');
}

export async function createCustomer(
  data: AsaasCustomerRequest,
  config?: AsaasConfig | null
): Promise<AsaasCustomerResponse> {
  return request<AsaasCustomerResponse>('POST', '/customers', data, config);
}

export async function getCustomer(
  customerId: string,
  config?: AsaasConfig | null
): Promise<AsaasCustomerResponse | null> {
  try {
    return await request<AsaasCustomerResponse>('GET', `/customers/${customerId}`, undefined, config);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('404')) return null;
    throw e;
  }
}

export async function createPayment(
  data: AsaasPaymentRequest,
  config?: AsaasConfig | null
): Promise<AsaasPaymentResponse> {
  return request<AsaasPaymentResponse>('POST', '/payments', data, config);
}

export async function getPayment(
  paymentId: string,
  config?: AsaasConfig | null
): Promise<AsaasPaymentResponse | null> {
  try {
    return await request<AsaasPaymentResponse>('GET', `/payments/${paymentId}`, undefined, config);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('404')) return null;
    throw e;
  }
}

/**
 * Obtém QR Code PIX para um pagamento (obrigatório para PIX: POST /payments não retorna QR).
 * GET /v3/payments/{id}/pixQrCode
 */
export async function getPixQrCode(
  paymentId: string,
  config?: AsaasConfig | null
): Promise<AsaasPixQrCodeResponse | null> {
  try {
    return await request<AsaasPixQrCodeResponse>('GET', `/payments/${paymentId}/pixQrCode`, undefined, config);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('404')) return null;
    throw e;
  }
}

export function isConfigured(config?: AsaasConfig | null): boolean {
  return !!getApiKey(config);
}

/**
 * Testa a conexão com a API Asaas (GET /customers?limit=1).
 * Em caso de 401/403 lança erro com mensagem "Erro de autenticação".
 */
export async function testConnection(config?: AsaasConfig | null): Promise<void> {
  const apiKey = getApiKey(config);
  if (!apiKey) throw new Error('API key Asaas não configurada');
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/customers?limit=1`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        access_token: apiKey,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error('Erro de autenticação');
    }
    if (!res.ok) {
      throw new Error(text || `Asaas API ${res.status}`);
    }
  } catch (e: unknown) {
    clearTimeout(timeoutId);
    throw e;
  }
}
