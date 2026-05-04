import { getDevApiBaseUrl } from '@/lib/devBackendOrigin';

// Em produção (HTTPS), usar URLs relativas para evitar Mixed Content
// O Nginx faz proxy de /api para o backend
// Em desenvolvimento: ver `getDevApiBaseUrl` (proxy Vite ou VITE_API_URL explícito)
export const getApiUrl = () => {
  if (import.meta.env.DEV) {
    const dev = getDevApiBaseUrl();
    if (dev !== '') return dev;
    return '';
  }
  
  // Em produção (navegador)
  if (typeof window !== 'undefined') {
    // Se está em HTTPS, sempre usar URL relativa para evitar Mixed Content
    if (window.location.protocol === 'https:') {
      return '';
    }
    
    const envUrl = import.meta.env.VITE_API_URL;
    
    // Se VITE_API_URL não está definido ou está vazio, usar URL relativa
    if (!envUrl || envUrl.trim() === '') {
      return '';
    }
    
    // Se VITE_API_URL contém hostname interno do Docker (sem domínio público)
    // Exemplos: painelcrm:3001
    if (envUrl.includes('painelcrm:')) {
      return '';
    }
  }
  
  // Em produção (SSR ou outros casos), usar URL relativa
  return '';
};

const API_URL = getApiUrl();

/** GET público sem header Authorization (ex.: visualização de contrato por token). */
export async function publicApiGet<T>(
  endpoint: string,
  init?: Pick<RequestInit, 'cache' | 'signal'>,
): Promise<ApiResponse<T>> {
  const url = `${API_URL}${endpoint}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      ...init,
    });
    let data: unknown;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = { message: await response.text() };
    }
    if (!response.ok) {
      const errBody = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
      return {
        error: (errBody.error as string) || (errBody.message as string) || 'Request failed',
        code: typeof errBody.code === 'string' ? errBody.code : undefined,
        details: { status: response.status, url, ...errBody },
      };
    }
    return { data: data as T };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Network error',
      details: { url },
    };
  }
}

/** GET público que devolve PDF (ex.: contrato por token de visualização). */
export type PublicPdfResult =
  | { ok: true; blob: Blob; filename: string }
  | { ok: false; error: string; code?: string };

export async function publicApiGetPdf(endpoint: string): Promise<PublicPdfResult> {
  const url = `${API_URL}${endpoint}`;
  try {
    const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/pdf' } });
    const cd = response.headers.get('Content-Disposition');
    let filename = 'contrato.pdf';
    if (cd) {
      const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
      const quoted = /filename="([^"]+)"/i.exec(cd);
      const raw = star?.[1]?.trim() ?? quoted?.[1]?.trim();
      if (raw) {
        try {
          filename = decodeURIComponent(raw.replace(/^"+|"+$/g, ''));
        } catch {
          filename = raw.replace(/^"+|"+$/g, '');
        }
      }
    }
    if (!response.ok) {
      const ct = response.headers.get('content-type');
      let errMsg = 'Falha ao obter o PDF';
      let code: string | undefined;
      if (ct?.includes('application/json')) {
        const j = (await response.json()) as Record<string, unknown>;
        errMsg = (j.error as string) || errMsg;
        code = typeof j.code === 'string' ? j.code : undefined;
      } else {
        const t = await response.text();
        if (t) errMsg = t.slice(0, 200);
      }
      return { ok: false, error: errMsg, code };
    }
    const blob = await response.blob();
    return { ok: true, blob, filename };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede' };
  }
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  /** Código estável de erro (ex.: EMAIL_ALREADY_REGISTERED_USE_LOGIN). */
  code?: string;
  /** Dica curta do backend (ex.: renovar token UazAPI). */
  hint?: string;
  /** Campo de formulário associado ao erro (ex.: cpf_cnpj). */
  field?: string;
  details?: any;
}

/** POST público sem Authorization (ex.: assinatura por convite). */
export async function publicApiPost<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
  const url = `${API_URL}${endpoint}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    let data: unknown;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = { message: await response.text() };
    }
    if (!response.ok) {
      const body = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
      return {
        error: (body.error as string) || (body.message as string) || 'Request failed',
        code: typeof body.code === 'string' ? body.code : undefined,
        details: { status: response.status, url, ...body },
      };
    }
    return { data: data as T };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Network error',
      details: { url },
    };
  }
}

class ApiClient {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    // Load token from localStorage
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
  }

  setToken(token: string | null): void {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('auth_token', token);
      } else {
        localStorage.removeItem('auth_token');
      }
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    const isFormData =
      typeof FormData !== 'undefined' && options.body instanceof FormData;

    const headers = new Headers(options.headers as HeadersInit);
    if (isFormData) {
      headers.delete('Content-Type');
    } else if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    // Debug: log da URL em desenvolvimento
    if (import.meta.env.DEV) {
      console.log('[API Client] Request:', {
        method: options.method || 'GET',
        url,
        baseURL: this.baseURL,
        endpoint,
        hasToken: !!this.token,
      });
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Tentar parsear JSON, mas se falhar, retornar texto
      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch (jsonError) {
          const text = await response.text();
          console.error('Failed to parse JSON response:', text);
          return {
            error: `Invalid JSON response: ${text.substring(0, 100)}`,
            details: { status: response.status, statusText: response.statusText },
          };
        }
      } else {
        const text = await response.text();
        data = { message: text };
      }

      if (!response.ok) {
        const body = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
        const rawErr = body.error;
        const errorMessage =
          typeof rawErr === 'string'
            ? rawErr
            : rawErr !== undefined && rawErr !== null
              ? JSON.stringify(rawErr)
              : typeof body.message === 'string'
                ? body.message
                : 'Request failed';
        return {
          error: errorMessage,
          code: typeof body.code === 'string' ? body.code : undefined,
          hint: typeof body.hint === 'string' ? body.hint : undefined,
          field: typeof body.field === 'string' ? body.field : undefined,
          details: {
            ...body,
            status: response.status,
            statusText: response.statusText,
            url,
          },
        };
      }

      return { data };
    } catch (error) {
      console.error('API request error:', error, 'URL:', url);
      return {
        error: error instanceof Error ? error.message : 'Network error',
        details: { url },
      };
    }
  }

  async get<T>(
    endpoint: string,
    init?: Pick<RequestInit, 'signal' | 'cache'>,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET', ...init });
  }

  /** GET binário (imagem) com Authorization — ex.: `/api/chat/avatar-proxy`. */
  async getBlob(
    endpoint: string,
    init?: Pick<RequestInit, 'signal'>,
  ): Promise<{ blob?: Blob; error?: string; status?: number }> {
    const url = `${this.baseURL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const headers = new Headers();
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }
    try {
      const response = await fetch(url, { method: 'GET', headers, ...init });
      if (!response.ok) {
        return { error: `HTTP ${response.status}`, status: response.status };
      }
      const blob = await response.blob();
      return { blob };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Network error' };
    }
  }

  async post<T>(
    endpoint: string,
    body?: any,
    init?: Pick<RequestInit, 'headers'>
  ): Promise<ApiResponse<T>> {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    return this.request<T>(endpoint, {
      method: 'POST',
      body: isForm ? body : JSON.stringify(body),
      headers: init?.headers,
    });
  }

  async put<T>(
    endpoint: string,
    body?: any,
    init?: Pick<RequestInit, 'headers'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: init?.headers,
    });
  }

  async patch<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient(API_URL);


