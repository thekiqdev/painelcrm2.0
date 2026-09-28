import { getWhatsappOfficialGraphBaseUrl } from '../../config/whatsappOfficialEnv.js';

export type GraphErrorBody = {
  error?: { message?: string; type?: string; code?: number; error_user_msg?: string; error_subcode?: number };
};

/** Links `paging.next` da Meta incluem `access_token` na query; remover e usar só Bearer evita token desfasado/Misto. */
function stripAccessTokenFromUrl(urlString: string): string {
  try {
    const u = new URL(urlString);
    if (u.searchParams.has('access_token')) {
      u.searchParams.delete('access_token');
    }
    return u.toString();
  } catch {
    return urlString;
  }
}

export async function graphFetch(
  method: 'GET' | 'POST',
  path: string,
  accessToken: string,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const base = getWhatsappOfficialGraphBaseUrl();
  let url = path.startsWith('http') ? stripAccessTokenFromUrl(path) : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: method === 'POST' && body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: r.ok, status: r.status, json };
}

function graphErrorMessage(json: unknown): string {
  const err = json as GraphErrorBody;
  const e = err.error;
  if (!e) return 'Graph error';
  const detail = e.error_user_msg || e.message || 'Graph error';
  return e.code != null ? `${detail} (code ${e.code}${e.error_subcode != null ? `/${e.error_subcode}` : ''})` : detail;
}

/** Corpo JSON da Meta: lista em `data` (formato habitual). */
function extractMessageTemplatesData(json: unknown): unknown[] {
  if (!json || typeof json !== 'object') return [];
  const j = json as Record<string, unknown>;
  if (Array.isArray(j.data)) return j.data;
  return [];
}

function graphJsonHasError(json: unknown): boolean {
  if (!json || typeof json !== 'object') return false;
  const j = json as Record<string, unknown>;
  return j.error != null && typeof j.error === 'object';
}

/**
 * Lista todos os message templates do WABA na Graph API, seguindo `paging.next`.
 * - Paginação: só para quando não há `paging.next` (não parar só porque uma página veio vazia).
 * - Tenta campos completos; se a lista vier vazia com HTTP 200, tenta só metadados (sem `components`), por compatibilidade com versões da Graph.
 */
export async function listAllMessageTemplates(
  wabaId: string,
  accessToken: string
): Promise<{ ok: boolean; items?: unknown[]; error?: string }> {
  const id = wabaId.trim();
  const fieldSets = [
    'id,name,status,category,language,components,rejected_reason,quality_score',
    'id,name,status,category,language,rejected_reason,quality_score',
  ];

  for (const fields of fieldSets) {
    const pathOrUrl = `/${id}/message_templates?fields=${encodeURIComponent(fields)}&limit=100`;
    const items: unknown[] = [];

    let url: string = pathOrUrl;
    for (let page = 0; page < 80; page++) {
      const { ok, json } = await graphFetch('GET', url, accessToken);
      if (!ok) {
        const errMsg = graphErrorMessage(json);
        if (fields === fieldSets[0] && fieldSets.length > 1) break;
        return { ok: false, error: errMsg };
      }
      if (graphJsonHasError(json)) {
        const errMsg = graphErrorMessage(json);
        if (fields === fieldSets[0]) break;
        return { ok: false, error: errMsg };
      }
      const chunk = extractMessageTemplatesData(json);
      items.push(...chunk);
      const next = (json as { paging?: { next?: string } }).paging?.next;
      if (!next) break;
      url = stripAccessTokenFromUrl(next);
    }

    if (items.length > 0) {
      return { ok: true, items };
    }
  }

  return { ok: true, items: [] };
}

/** Cria modelo na Meta — POST /{waba-id}/message_templates */
export async function createWhatsAppMessageTemplate(
  wabaId: string,
  accessToken: string,
  templatePayload: Record<string, unknown>
): Promise<{ ok: boolean; json?: unknown; error?: string }> {
  const path = `/${wabaId.trim()}/message_templates`;
  const { ok, json } = await graphFetch('POST', path, accessToken, templatePayload);
  if (!ok) return { ok: false, error: graphErrorMessage(json), json };
  return { ok: true, json };
}

/** @deprecated Preferir listAllMessageTemplates — esta só devolve a primeira página. */
export async function listMessageTemplates(
  wabaId: string,
  accessToken: string
): Promise<{ ok: boolean; data?: { data?: unknown[] }; error?: string }> {
  const path = `/${wabaId.trim()}/message_templates?fields=name,status,category,language,components&limit=100`;
  const { ok, json } = await graphFetch('GET', path, accessToken);
  if (!ok) {
    return { ok: false, error: graphErrorMessage(json) };
  }
  return { ok: true, data: json as { data?: unknown[] } };
}

export async function getPhoneNumberInfo(phoneNumberId: string, accessToken: string): Promise<{
  ok: boolean;
  data?: { display_phone_number?: string; verified_name?: string };
  error?: string;
}> {
  const path = `/${phoneNumberId}?fields=display_phone_number,verified_name`;
  const { ok, json } = await graphFetch('GET', path, accessToken);
  if (!ok) {
    const err = json as GraphErrorBody;
    return { ok: false, error: err.error?.message || 'Graph error' };
  }
  return { ok: true, data: json as { display_phone_number?: string; verified_name?: string } };
}

/**
 * Regista o callback do webhook ao nível da App na Graph API (quando o token tem permissões).
 * Nem todos os access tokens o permitem — nesse caso devolver instruções manuais.
 */
export async function subscribeAppWhatsappBusinessAccountWebhook(
  appId: string,
  accessToken: string,
  input: { callbackUrl: string; verifyToken: string }
): Promise<{ ok: boolean; status: number; error?: string; json: unknown }> {
  const path = `/${appId.trim()}/subscriptions`;
  const body: Record<string, unknown> = {
    object: 'whatsapp_business_account',
    callback_url: input.callbackUrl,
    fields: 'messages',
    verify_token: input.verifyToken,
  };
  const { ok, status, json } = await graphFetch('POST', path, accessToken, body);
  if (!ok) {
    return { ok: false, status, error: graphErrorMessage(json), json };
  }
  return { ok: true, status, json };
}

export async function sendTextMessage(
  phoneNumberId: string,
  accessToken: string,
  toE164Digits: string,
  text: string
): Promise<{ ok: boolean; messages?: { id?: string }[]; error?: string; raw?: unknown }> {
  const path = `/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: toE164Digits.replace(/\D/g, ''),
    type: 'text',
    text: { body: text.slice(0, 4096) },
  };
  const { ok, json } = await graphFetch('POST', path, accessToken, body);
  if (!ok) {
    const err = json as GraphErrorBody;
    return { ok: false, error: err.error?.message || 'Send failed', raw: json };
  }
  const j = json as { messages?: { id?: string }[] };
  return { ok: true, messages: j.messages, raw: json };
}

export async function sendTemplateMessage(
  phoneNumberId: string,
  accessToken: string,
  toE164Digits: string,
  templateName: string,
  language: string,
  components?: unknown[]
): Promise<{ ok: boolean; messages?: { id?: string }[]; error?: string; raw?: unknown }> {
  const path = `/${phoneNumberId}/messages`;
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: toE164Digits.replace(/\D/g, ''),
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      ...(components && components.length > 0 ? { components } : {}),
    },
  };
  const { ok, json } = await graphFetch('POST', path, accessToken, body);
  if (!ok) {
    const err = json as GraphErrorBody;
    return { ok: false, error: err.error?.message || 'Template send failed', raw: json };
  }
  const j = json as { messages?: { id?: string }[] };
  return { ok: true, messages: j.messages, raw: json };
}

export async function sendMediaMessage(
  phoneNumberId: string,
  accessToken: string,
  toE164Digits: string,
  mediaType: 'image' | 'document' | 'audio' | 'video',
  link: string,
  caption?: string
): Promise<{ ok: boolean; messages?: { id?: string }[]; error?: string; raw?: unknown }> {
  const path = `/${phoneNumberId}/messages`;
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: toE164Digits.replace(/\D/g, ''),
    type: mediaType,
    [mediaType]: {
      link,
      ...(caption && mediaType !== 'audio' ? { caption: caption.slice(0, 1024) } : {}),
    },
  };
  const { ok, json } = await graphFetch('POST', path, accessToken, body);
  if (!ok) {
    const err = json as GraphErrorBody;
    return { ok: false, error: err.error?.message || 'Media send failed', raw: json };
  }
  const j = json as { messages?: { id?: string }[] };
  return { ok: true, messages: j.messages, raw: json };
}

export async function markMessageRead(
  phoneNumberId: string,
  accessToken: string,
  messageId: string
): Promise<{ ok: boolean; error?: string }> {
  const path = `/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  };
  const { ok, json } = await graphFetch('POST', path, accessToken, body);
  if (!ok) {
    const err = json as GraphErrorBody;
    return { ok: false, error: err.error?.message || 'read failed' };
  }
  return { ok: true };
}

/** Valida token com chamada mínima à Graph API. */
export async function validateAccessToken(accessToken: string, phoneNumberId: string): Promise<{
  ok: boolean;
  error?: string;
  display_phone_number?: string;
  verified_name?: string;
}> {
  const r = await getPhoneNumberInfo(phoneNumberId, accessToken);
  if (!r.ok) return { ok: false, error: r.error };
  return {
    ok: true,
    display_phone_number: r.data?.display_phone_number,
    verified_name: r.data?.verified_name,
  };
}
