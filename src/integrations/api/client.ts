// Em produção (HTTPS), usar URLs relativas para evitar Mixed Content
// O Nginx faz proxy de /api para o backend
// Em desenvolvimento, usar VITE_API_URL ou localhost
const getApiUrl = () => {
  // Em desenvolvimento, sempre usar VITE_API_URL ou localhost:3001
  if (import.meta.env.DEV) {
    const envUrl = import.meta.env.VITE_API_URL;
    return envUrl || 'http://localhost:3001';
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
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
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
        return {
          error: data.error || data.message || 'Request failed',
          code: typeof data.code === 'string' ? data.code : undefined,
          hint: typeof data.hint === 'string' ? data.hint : undefined,
          field: typeof data.field === 'string' ? data.field : undefined,
          details: { 
            ...data.details, 
            status: response.status, 
            statusText: response.statusText,
            url 
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

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async put<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
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


