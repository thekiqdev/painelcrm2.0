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
    this.adminToken = process.env.UAZAPI_ADMIN_TOKEN;
  }

  public updateConfig(params: { baseUrl?: string; adminToken?: string }) {
    if (params.baseUrl) {
      this.baseUrl = params.baseUrl.replace(/\/$/, '');
    }
    if (typeof params.adminToken === 'string') {
      this.adminToken = params.adminToken;
    }
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    };

    if (options.useAdminToken) {
      if (!this.adminToken) {
        throw new Error('UAZAPI_ADMIN_TOKEN is not configured');
      }
      headers['admintoken'] = this.adminToken;
    } else if (options.token) {
      headers['token'] = options.token;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body,
    });

    const text = await response.text();
    let payload: any = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (error) {
        payload = text;
      }
    }

    if (!response.ok) {
      const error = new Error(payload?.error || response.statusText);
      (error as any).status = response.status;
      (error as any).payload = payload;
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

  async findChats(instanceToken: string, payload: Record<string, unknown>) {
    return this.request('/chat/find', {
      method: 'POST',
      body: JSON.stringify(payload),
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

  async readChat(instanceToken: string, payload: Record<string, unknown>) {
    return this.request('/chat/read', {
      method: 'POST',
      body: JSON.stringify(payload),
      token: instanceToken,
    });
  }
}

export const uazapiService = new UazapiService();

