import { createHash } from 'crypto';
import { isUazIntegrationVerboseLogs } from '../utils/chatObservability.js';

function instanceTokenFingerprintForProviderLog(token: string): string {
  const t = token.trim();
  if (!t) return 'missing';
  const tail = t.length <= 4 ? '****' : `***${t.slice(-4)}`;
  const fp = createHash('sha256').update(t, 'utf8').digest('hex').slice(0, 10);
  return `${tail}|sha256:${fp}`;
}

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

  /**
   * Remove instância no servidor UazAPI (best-effort).
   * Tenta DELETE /instance; em 405 ou falha, POST /instance/delete (variantes de deploy).
   * 404/410 no provedor = já removida → ok para limpeza local.
   */
  async deleteInstanceAtProvider(instanceToken: string): Promise<{
    ok: boolean;
    httpStatus?: number;
    note?: string;
  }> {
    const token = instanceToken?.trim();
    if (!token) return { ok: false, note: 'missing_token' };

    console.log('[UazAPI] deleteInstanceAtProvider', {
      token_fp: instanceTokenFingerprintForProviderLog(token),
      note: 'DELETE /instance ou POST /instance/delete com header token desta instância',
    });

    const tryOnce = async (
      method: string,
      path: string,
      body?: string,
    ): Promise<{ ok: true } | { fail: number | undefined }> => {
      try {
        await this.request<unknown>(path, {
          method,
          token,
          ...(body !== undefined ? { body } : {}),
        });
        return { ok: true };
      } catch (e: unknown) {
        const st =
          typeof e === 'object' && e !== null && 'status' in e ? Number((e as { status: unknown }).status) : undefined;
        return { fail: st };
      }
    };

    const first = await tryOnce('DELETE', '/instance');
    if ('ok' in first && first.ok) return { ok: true };

    const st1 = 'fail' in first ? first.fail : undefined;
    if (st1 === 404 || st1 === 410) return { ok: true, httpStatus: st1, note: 'already_absent' };

    const second = await tryOnce('POST', '/instance/delete', '{}');
    if ('ok' in second && second.ok) return { ok: true };

    const st2 = 'fail' in second ? second.fail : undefined;
    if (st2 === 404 || st2 === 410) return { ok: true, httpStatus: st2, note: 'already_absent' };

    console.warn('[UazAPI] deleteInstanceAtProvider incomplete — local cleanup will continue', {
      deleteStatus: st1,
      postDeleteStatus: st2,
    });
    return { ok: false, httpStatus: st2 ?? st1, note: 'provider_delete_failed' };
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

  /** Botão PIX nativo WhatsApp (código copia e cola EMV ou chave conforme payload). */
  async sendPixButton(instanceToken: string, payload: Record<string, unknown>) {
    return this.request('/send/pix-button', {
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

  /**
   * POST /chat/archive — arquivar (`archive: true`) ou desarquivar (`archive: false`).
   * Contrato UazAPI: `{ number, archive }`.
   */
  async archiveChat(
    instanceToken: string,
    payload: { number: string; archive: boolean },
  ) {
    return this.request('/chat/archive', {
      method: 'POST',
      body: JSON.stringify({
        number: payload.number,
        archive: payload.archive,
      }),
      token: instanceToken,
    });
  }

  /** POST /group/info — detalhes, participantes, convite opcional (token da instância). */
  async groupInfo(instanceToken: string, payload: Record<string, unknown>) {
    return this.request<unknown>('/group/info', {
      method: 'POST',
      body: JSON.stringify(payload),
      token: instanceToken,
    });
  }

  /** POST /group/create — participantes: apenas dígitos (spec UazAPI). */
  async groupCreate(instanceToken: string, payload: { name: string; participants: string[] }) {
    return this.request<unknown>('/group/create', {
      method: 'POST',
      body: JSON.stringify(payload),
      token: instanceToken,
    });
  }

  async groupUpdateName(instanceToken: string, payload: Record<string, unknown>) {
    return this.request<unknown>('/group/updateName', {
      method: 'POST',
      body: JSON.stringify(payload),
      token: instanceToken,
    });
  }

  async groupUpdateDescription(instanceToken: string, payload: Record<string, unknown>) {
    return this.request<unknown>('/group/updateDescription', {
      method: 'POST',
      body: JSON.stringify(payload),
      token: instanceToken,
    });
  }

  async groupUpdateImage(instanceToken: string, payload: Record<string, unknown>) {
    return this.request<unknown>('/group/updateImage', {
      method: 'POST',
      body: JSON.stringify(payload),
      token: instanceToken,
    });
  }

  async groupUpdateAnnounce(instanceToken: string, payload: Record<string, unknown>) {
    return this.request<unknown>('/group/updateAnnounce', {
      method: 'POST',
      body: JSON.stringify(payload),
      token: instanceToken,
    });
  }

  async groupUpdateLocked(instanceToken: string, payload: Record<string, unknown>) {
    return this.request<unknown>('/group/updateLocked', {
      method: 'POST',
      body: JSON.stringify(payload),
      token: instanceToken,
    });
  }

  /**
   * Tenta um POST opcional (ex.: definições ainda não documentadas na OpenAPI).
   * 404 = rota inexistente nesta versão do servidor, sem propagar erro.
   */
  async groupPostOptional(
    instanceToken: string,
    path: string,
    body: Record<string, unknown>
  ): Promise<{ applied: boolean; status: number }> {
    try {
      await this.request<unknown>(path, {
        method: 'POST',
        body: JSON.stringify(body),
        token: instanceToken,
      });
      return { applied: true, status: 200 };
    } catch (e: any) {
      const st = typeof e?.status === 'number' ? e.status : 502;
      if (st === 404) return { applied: false, status: 404 };
      throw e;
    }
  }

  async groupResetInviteCode(instanceToken: string, payload: Record<string, unknown>) {
    return this.request<unknown>('/group/resetInviteCode', {
      method: 'POST',
      body: JSON.stringify(payload),
      token: instanceToken,
    });
  }

  async groupLeave(instanceToken: string, payload: Record<string, unknown>) {
    return this.request<unknown>('/group/leave', {
      method: 'POST',
      body: JSON.stringify(payload),
      token: instanceToken,
    });
  }

  async groupUpdateParticipants(instanceToken: string, payload: Record<string, unknown>) {
    return this.request<unknown>('/group/updateParticipants', {
      method: 'POST',
      body: JSON.stringify(payload),
      token: instanceToken,
    });
  }
}

export const uazapiService = new UazapiService();

