/**
 * Cliente HTTP mínimo da API Stripe (form-urlencoded).
 * Quem chama precisa já ter decidido que a flag e a credencial permitem a chamada.
 */

export type StripeFetch = typeof fetch;

export class StripePlatformApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'StripePlatformApiError';
    this.status = status;
  }
}

export type StripePlatformClient = {
  post(path: string, body: Record<string, string>): Promise<Record<string, unknown>>;
  get(path: string): Promise<Record<string, unknown>>;
  del(path: string): Promise<Record<string, unknown>>;
};

export function createStripePlatformClient(params: {
  secretKey: string;
  fetchImpl?: StripeFetch;
}): StripePlatformClient {
  const fetchImpl = params.fetchImpl ?? fetch;
  const secretKey = params.secretKey.trim();

  async function request(method: string, path: string, body?: Record<string, string>) {
    const res = await fetchImpl(`https://api.stripe.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: body ? new URLSearchParams(body).toString() : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = json.error as { message?: string } | undefined;
      throw new StripePlatformApiError(err?.message || `Stripe HTTP ${res.status}`, res.status);
    }
    return json;
  }

  return {
    post: (path, body) => request('POST', path, body),
    get: (path) => request('GET', path),
    del: (path) => request('DELETE', path),
  };
}
