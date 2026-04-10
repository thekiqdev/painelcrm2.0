import { isUazIntegrationVerboseLogs } from '../utils/chatObservability.js';

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  token?: string;
  useAdminToken?: boolean;
}

export class UazapiService {
  private baseUrl: string;
  private adminToken?: string;

  constructor() {
    this.baseUrl = (process.env.UAZAPI_BASE_URL || 'https://free.uazapi.com').replace(/\/$/, '');
    const raw = process.env.UAZAPI_ADMIN_TOKEN?.trim();
    this.adminToken = raw || undefined;
  }

  public updateConfig(params: { baseUrl?: string; adminToken?: string }) {
    if (params.baseUrl) {
      this.baseUrl = params.baseUrl.replace(/\/$/, '');
    }
    if (typeof params.adminToken === 'string') {
      const t = params.adminToken.trim();
      this.adminToken = t || undefined;
    }
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    };

    if (options.useAdminToken) {
      if (!this.adminToken?.trim()) {
        const error = new Error('UAZAPI_ADMIN_TOKEN is not configured');
        (error as any).status = 500;
        throw error;
      }
      headers['admintoken'] = this.adminToken;
    } else if (options.token) {
      headers['token'] = options.token;
    }

    const url = `${this.baseUrl}${path}`;
    const verbose = isUazIntegrationVerboseLogs();
    if (verbose) {
      console.log(`[UazAPI] ${options.method || 'GET'} ${url}`, {
        hasBody: !!options.body,
        useAdminToken: options.useAdminToken,
        hasToken: !!options.token,
      });
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body,
      });
    } catch (fetchError: any) {
      console.error('[UazAPI] Fetch error:', {
        url,
        error: fetchError.message,
        code: fetchError.code,
      });
      const error = new Error(`Failed to connect to UazAPI: ${fetchError.message}`);
      (error as any).status = 503;
      (error as any).originalError = fetchError;
      throw error;
    }

    const text = await response.text();
    let payload: any = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (error) {
        payload = text;
      }
    }

    if (verbose) {
      const payloadPreview = (() => {
        if (payload == null) return String(payload);
        if (typeof payload === 'string') return payload.substring(0, 200);
        if (typeof payload === 'object' && !Array.isArray(payload) && Array.isArray((payload as any).messages)) {
          const p = payload as Record<string, unknown> & { messages: unknown[] };
          const { messages: _m, ...rest } = p;
          return `${JSON.stringify({ ...rest, messages_count: _m.length, messages_omitted: true }).substring(0, 220)}`;
        }
        return JSON.stringify(payload).substring(0, 200);
      })();
      console.log(`[UazAPI] Response ${response.status}:`, {
        ok: response.ok,
        payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload) : 'not-object',
        payloadPreview,
      });
    } else if (!response.ok) {
      console.warn(`[UazAPI] Response ${response.status} (keys only)`, {
        payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload) : typeof payload,
      });
    }

    if (!response.ok) {
      const error = new Error(payload?.error || payload?.message || response.statusText || 'UazAPI request failed');
      (error as any).status = response.status;
      (error as any).payload = payload;
      (error as any).responseText = text;
      if (verbose) {
        console.error('[UazAPI] Request failed:', {
          status: response.status,
          statusText: response.statusText,
          payload,
        });
      } else {
        console.error('[UazAPI] Request failed:', {
          status: response.status,
          message: payload?.error || payload?.message || response.statusText,
        });
      }
      throw error;
    }

    return payload as T;
  }

  async createInstance(name: string, metadata?: Record<string, unknown>) {
    return this.request('/instance/init', {
      method: 'POST',
      body: JSON.stringify({
        name,
        ...(metadata || {}),
      }),
      useAdminToken: true,
    });
  }

  async connectInstance(instanceToken: string, phone?: string) {
    // Se phone não for fornecido, não enviar no body para gerar QR code
    const body = phone ? { phone } : {};
    return this.request('/instance/connect', {
      method: 'POST',
      body: JSON.stringify(body),
      token: instanceToken,
    });
  }

  async disconnectInstance(instanceToken: string) {
    return this.request('/instance/disconnect', {
      method: 'POST',
      token: instanceToken,
    });
  }

  async getInstanceStatus(instanceToken: string) {
    return this.request('/instance/status', {
      method: 'GET',
      token: instanceToken,
    });
  }

  async configureWebhook(instanceToken: string, payload: Record<string, unknown>) {
    return this.request('/webhook', {
      method: 'POST',
      body: JSON.stringify(payload),
      token: instanceToken,
    });
  }

  async getWebhook(instanceToken: string) {
    return this.request('/webhook', {
      method: 'GET',
      token: instanceToken,
    });
  }

  async sendTextMessage(instanceToken: string, payload: Record<string, unknown>) {
    return this.request('/send/text', {
      method: 'POST',
      body: JSON.stringify(payload),
      token: instanceToken,
    });
  }

  /** Imagem, vídeo, documento, áudio etc. — ver OpenAPI `/send/media` */
  async sendMediaMessage(instanceToken: string, payload: Record<string, unknown>) {
    return this.request('/send/media', {
      method: 'POST',
      body: JSON.stringify(payload),
      token: instanceToken,
    });
  }

  async findChats(instanceToken: string, payload: Record<string, unknown>) {
    return this.request('/chat/find', {
      method: 'POST',
      body: JSON.stringify(payload),
      token: instanceToken,
    });
  }

  /** GET /contacts — agenda completa (sem paginação). Doc: lista de contatos do WhatsApp com jid + nome. */
  async getContacts(instanceToken: string) {
    return this.request<unknown>('/contacts', {
      method: 'GET',
      token: instanceToken,
    });
  }

  /** POST /contacts/list — mesma lista com paginação (pageSize até 1000). */
  async listContactsPage(instanceToken: string, body: Record<string, unknown>) {
    return this.request<Record<string, unknown>>('/contacts/list', {
      method: 'POST',
      body: JSON.stringify(body),
      token: instanceToken,
    });
  }

  async findMessages(instanceToken: string, payload: Record<string, unknown>) {
    return this.request('/message/find', {
      method: 'POST',
      body: JSON.stringify(payload),
      token: instanceToken,
    });
  }

  /** Baixa mídia e obtém URL pública — ver OpenAPI `POST /message/download` */
  async downloadMessageMedia(instanceToken: string, payload: Record<string, unknown>) {
    return this.request('/message/download', {
      method: 'POST',
      body: JSON.stringify(payload),
      token: instanceToken,
    });
  }

  async readChat(instanceToken: string, payload: Record<string, unknown>) {
    return this.request('/chat/read', {
      method: 'POST',
      body: JSON.stringify(payload),
      token: instanceToken,
    });
  }
}

export const uazapiService = new UazapiService();

