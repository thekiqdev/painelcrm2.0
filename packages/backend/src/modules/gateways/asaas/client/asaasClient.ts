/**
 * Cliente HTTP para a API Asaas v3.
 * Timeout configurável (padrão 30s — sandbox costuma ser mais lento que 10s).
 * Retry 2x em timeout/5xx: cada tentativa usa novo AbortController (evita reusar signal já abortado).
 */
import type {
  AsaasConfig,
  AsaasCustomerRequest,
  AsaasCustomerResponse,
  AsaasIdentificationFieldResponse,
  AsaasPaymentRequest,
  AsaasPaymentResponse,
  AsaasPaymentUpdateRequest,
  AsaasPixQrCodeResponse,
} from '../asaasTypes.js';

/** Sandbox e sequência de chamadas (ex.: createPayment + getPixQrCode) precisam de folga; timeouts muito baixos geram AbortError. */
const MIN_HTTP_TIMEOUT_MS = 20_000;
const DEFAULT_HTTP_TIMEOUT_MS = 40_000;

function defaultHttpTimeoutMs(): number {
  const raw = process.env.ASAAS_HTTP_TIMEOUT_MS;
  if (raw != null && raw.trim() !== '') {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 5_000 && n <= 120_000) {
      return Math.max(n, MIN_HTTP_TIMEOUT_MS);
    }
  }
  return DEFAULT_HTTP_TIMEOUT_MS;
}

/** Timeout/abort do fetch (Node DOMException nem sempre passa em instanceof Error). */
export function isAbortLikeError(e: unknown): boolean {
  if (e == null || typeof e !== 'object') return false;
  const name = 'name' in e ? String((e as { name?: string }).name) : '';
  return name === 'AbortError';
}

const HTTP_TIMEOUT_MS = defaultHttpTimeoutMs();
/** Cartão: documentação Asaas recomenda timeout ≥ 60s para evitar duplicidade. */
const PAY_WITH_CARD_TIMEOUT_MS = 65_000;
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

type RequestOptions = {
  timeoutMs?: number;
  /** Retries só para 5xx (comportamento atual). */
  maxRetries?: number;
};

async function request<T>(
  method: string,
  path: string,
  body?: object,
  config?: AsaasConfig | null,
  options?: RequestOptions
): Promise<T> {
  const apiKey = getApiKey(config);
  if (!apiKey) throw new Error('API key Asaas não configurada');
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}${path}`;
  const timeoutMs = options?.timeoutMs ?? HTTP_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? HTTP_RETRY_ATTEMPTS;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
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
        if (attempt < maxRetries && isRetryable(res.status)) {
          lastError = new Error(`Asaas API ${res.status}: ${text}`);
          continue;
        }
        throw new Error(`Asaas API ${res.status}: ${text}`);
      }
      if (res.status === 204 || text === '') return undefined as T;
      return JSON.parse(text) as T;
    } catch (e: unknown) {
      clearTimeout(timeoutId);
      const isAbort = isAbortLikeError(e);
      const isRetryableErr = isAbort || (e instanceof Error && e.message.includes('5'));
      if (attempt < maxRetries && isRetryableErr) {
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
    if (isAbortLikeError(e)) return null;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('404')) return null;
    throw e;
  }
}

export async function updateCustomer(
  customerId: string,
  data: AsaasCustomerRequest,
  config?: AsaasConfig | null
): Promise<AsaasCustomerResponse> {
  return request<AsaasCustomerResponse>(
    'PUT',
    `/customers/${encodeURIComponent(customerId)}`,
    data,
    config
  );
}

export async function createPayment(
  data: AsaasPaymentRequest,
  config?: AsaasConfig | null
): Promise<AsaasPaymentResponse> {
  return request<AsaasPaymentResponse>('POST', '/payments', data, config);
}

export async function updatePayment(
  paymentId: string,
  data: AsaasPaymentUpdateRequest,
  config?: AsaasConfig | null
): Promise<AsaasPaymentResponse> {
  return request<AsaasPaymentResponse>(
    'PUT',
    `/payments/${encodeURIComponent(paymentId)}`,
    data,
    config
  );
}

export async function getPayment(
  paymentId: string,
  config?: AsaasConfig | null
): Promise<AsaasPaymentResponse | null> {
  try {
    return await request<AsaasPaymentResponse>('GET', `/payments/${paymentId}`, undefined, config);
  } catch (e: unknown) {
    if (isAbortLikeError(e)) return null;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('404')) return null;
    throw e;
  }
}

/**
 * Exclui/cancela cobrança no Asaas (DELETE /v3/payments/:id).
 * Retorna { deleted: true, id } em sucesso; 404 se já não existir.
 */
export async function deletePayment(
  paymentId: string,
  config?: AsaasConfig | null
): Promise<{ deleted: boolean; id: string } | null> {
  try {
    return await request<{ deleted: boolean; id: string }>('DELETE', `/payments/${paymentId}`, undefined, config);
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
/**
 * QR Code PIX pode não existir no instante seguinte ao POST /payments (pixQrCodeId null).
 * Nesse caso o Asaas costuma responder 400 com code invalid_action até o QR estar pronto.
 */
function isPixQrNotYetAvailableError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  if (!msg.includes('400')) return false;
  return msg.includes('invalid_action') || msg.includes('not_yet_available');
}

export async function getPixQrCode(
  paymentId: string,
  config?: AsaasConfig | null
): Promise<AsaasPixQrCodeResponse | null> {
  try {
    return await request<AsaasPixQrCodeResponse>('GET', `/payments/${paymentId}/pixQrCode`, undefined, config);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('404')) return null;
    if (isPixQrNotYetAvailableError(e)) return null;
    throw e;
  }
}

/**
 * Linha digitável do boleto (GET /v3/payments/{id}/identificationField).
 */
/**
 * POST /v3/payments/{id}/payWithCreditCard — captura cartão em cobrança já criada (Desenho A).
 * Sem retry em 4xx; timeout longo conforme doc Asaas.
 */
export async function payWithCreditCard(
  paymentId: string,
  body: {
    creditCard: {
      holderName: string;
      number: string;
      expiryMonth: string;
      expiryYear: string;
      ccv: string;
    };
    creditCardHolderInfo: {
      name: string;
      email: string;
      cpfCnpj: string;
      postalCode: string;
      addressNumber: string;
      addressComplement?: string | null;
      phone: string;
      mobilePhone?: string | null;
    };
    creditCardToken?: string;
  },
  config?: AsaasConfig | null
): Promise<AsaasPaymentResponse> {
  return request<AsaasPaymentResponse>(
    'POST',
    `/payments/${encodeURIComponent(paymentId)}/payWithCreditCard`,
    body,
    config,
    { timeoutMs: PAY_WITH_CARD_TIMEOUT_MS, maxRetries: 0 }
  );
}

export async function getIdentificationField(
  paymentId: string,
  config?: AsaasConfig | null
): Promise<AsaasIdentificationFieldResponse | null> {
  try {
    return await request<AsaasIdentificationFieldResponse>(
      'GET',
      `/payments/${paymentId}/identificationField`,
      undefined,
      config
    );
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
