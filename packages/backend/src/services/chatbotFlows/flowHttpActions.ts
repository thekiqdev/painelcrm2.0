/**
 * HTTP / webhook out para Chatbot Flows (S5) — SSRF guard + fetch com timeout.
 */
import { createHmac } from 'node:crypto';
import { interpolateTemplate } from './flowRuntimeEngine.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** Hosts permitidos (CSV). Vazio = qualquer host público. */
export function getHttpHostAllowlist(): string[] | null {
  const raw = (process.env.CHATBOT_FLOWS_HTTP_HOST_ALLOWLIST || '').trim();
  if (!raw) return null;
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function assertSafePublicHttpUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('URL inválida');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Apenas http/https');
  }
  const host = (u.hostname || '').toLowerCase();
  if (!host) throw new Error('Host inválido');
  if (LOCAL_HOSTS.has(host)) throw new Error('Host local bloqueado');
  if (isPrivateIpv4(host)) throw new Error('IP privado bloqueado');
  const allow = getHttpHostAllowlist();
  if (allow && !allow.includes(host)) {
    throw new Error(`Host não permitido: ${host}`);
  }
  return u;
}

export function getByDotPath(root: unknown, path: string): unknown {
  if (!path.trim()) return undefined;
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(p);
      if (!Number.isInteger(idx)) return undefined;
      cur = cur[idx];
      continue;
    }
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function interpolateHeaders(
  headers: Array<{ key: string; value: string }> | Record<string, string> | undefined,
  variables: Record<string, unknown>
): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(headers)) {
    for (const h of headers) {
      const k = String(h.key || '').trim();
      if (!k) continue;
      out[k] = interpolateTemplate(String(h.value ?? ''), variables);
    }
    return out;
  }
  if (headers && typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers)) {
      if (!k.trim()) continue;
      out[k] = interpolateTemplate(String(v ?? ''), variables);
    }
  }
  return out;
}

export type FlowHttpRequestResult = {
  ok: boolean;
  status: number;
  bodyText: string;
  bodyJson: unknown;
  error?: string;
  mapped: Record<string, string>;
};

/**
 * Monta status/response/response_map → variáveis.
 * Aplica em **qualquer** status HTTP (2xx, 4xx, 5xx…); `ok` (2xx) só decide a saída do nó.
 */
export function buildHttpResponseMapped(opts: {
  status: number;
  bodyText: string;
  bodyJson: unknown;
  statusVariable?: string;
  responseVariable?: string;
  responseMap?: Array<{ path: string; variable: string }>;
}): Record<string, string> {
  const mapped: Record<string, string> = {};
  if (opts.statusVariable) mapped[opts.statusVariable] = String(opts.status);
  if (opts.responseVariable) {
    mapped[opts.responseVariable] =
      opts.bodyJson != null ? JSON.stringify(opts.bodyJson) : opts.bodyText.slice(0, 8000);
  }
  for (const m of opts.responseMap || []) {
    const variable = String(m.variable || '').trim();
    if (!variable) continue;
    const v = getByDotPath(opts.bodyJson, m.path);
    mapped[variable] = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  }
  return mapped;
}

export function isHttpSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

export async function executeFlowHttpRequest(opts: {
  method: string;
  url: string;
  headers?: Array<{ key: string; value: string }> | Record<string, string>;
  body?: string;
  timeoutMs: number;
  variables: Record<string, unknown>;
  responseVariable?: string;
  statusVariable?: string;
  responseMap?: Array<{ path: string; variable: string }>;
}): Promise<FlowHttpRequestResult> {
  const urlRaw = interpolateTemplate(opts.url, opts.variables).trim();
  const url = assertSafePublicHttpUrl(urlRaw);
  const method = (opts.method || 'GET').toUpperCase();
  const headers = interpolateHeaders(opts.headers, opts.variables);
  const body =
    method === 'GET' || method === 'HEAD'
      ? undefined
      : interpolateTemplate(String(opts.body ?? ''), opts.variables);

  if (body != null && body !== '' && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  const mapOpts = {
    statusVariable: opts.statusVariable,
    responseVariable: opts.responseVariable,
    responseMap: opts.responseMap,
  };

  const timeoutMs = Math.max(500, Math.min(30_000, opts.timeoutMs || 10_000));
  const ac = new AbortController();
  const startedAt = Date.now();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body === '' ? undefined : body,
      signal: ac.signal,
      redirect: 'manual',
    });
    const bodyText = await res.text();
    let bodyJson: unknown = null;
    try {
      bodyJson = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      bodyJson = null;
    }

    // Mapear sempre (antes de ok) — 4xx/5xx também preenchem variáveis.
    const mapped = buildHttpResponseMapped({
      status: res.status,
      bodyText,
      bodyJson,
      ...mapOpts,
    });
    const ok = isHttpSuccessStatus(res.status);
    return {
      ok,
      status: res.status,
      bodyText,
      bodyJson,
      mapped,
      error: ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (e) {
    const elapsedMs = Date.now() - startedAt;
    const name = e instanceof Error ? e.name : '';
    const raw = e instanceof Error ? e.message : 'http_failed';
    const isAbort =
      name === 'AbortError' ||
      /aborted|abort/i.test(raw) ||
      (typeof (e as { code?: string })?.code === 'string' &&
        String((e as { code?: string }).code).toUpperCase() === 'ABORT_ERR');
    const msg = isAbort
      ? `Timeout após ${timeoutMs}ms (sem resposta HTTP; aguardou ~${elapsedMs}ms)`
      : raw;
    return {
      ok: false,
      status: 0,
      bodyText: '',
      bodyJson: null,
      mapped: buildHttpResponseMapped({
        status: 0,
        bodyText: '',
        bodyJson: null,
        ...mapOpts,
      }),
      error: msg,
    };
  } finally {
    clearTimeout(t);
  }
}

export type WebhookOutPayloadMode = 'envelope' | 'envelope_plus' | 'custom';

/** Monta o body JSON do webhook_out (S8). */
export function buildWebhookOutBody(opts: {
  payloadMode: WebhookOutPayloadMode;
  bodyTemplate: string;
  variables: Record<string, unknown>;
  conversationId: string;
  tenantId: string;
  includeSessionVars: boolean;
}): string {
  const mode = opts.payloadMode || 'envelope';
  const interpolated = interpolateTemplate(String(opts.bodyTemplate || ''), opts.variables).trim();

  if (mode === 'custom') {
    if (!interpolated) {
      return JSON.stringify({
        event: 'chatbot_flows.webhook_out',
        tenant_id: opts.tenantId,
        conversation_id: opts.conversationId,
        sent_at: new Date().toISOString(),
      });
    }
    // Se for JSON válido, re-stringify canônico; senão envia texto bruto
    try {
      return JSON.stringify(JSON.parse(interpolated));
    } catch {
      return interpolated;
    }
  }

  const envelope: Record<string, unknown> = {
    event: 'chatbot_flows.webhook_out',
    tenant_id: opts.tenantId,
    conversation_id: opts.conversationId,
    sent_at: new Date().toISOString(),
    variables: opts.includeSessionVars ? opts.variables : {},
  };

  if (mode === 'envelope_plus' && interpolated) {
    try {
      envelope.data = JSON.parse(interpolated);
    } catch {
      envelope.data = interpolated;
    }
  }

  return JSON.stringify(envelope);
}

export async function executeFlowWebhookOut(opts: {
  url: string;
  method?: string;
  secret?: string;
  timeoutMs: number;
  variables: Record<string, unknown>;
  conversationId: string;
  tenantId: string;
  includeSessionVars: boolean;
  payloadMode?: WebhookOutPayloadMode;
  bodyTemplate?: string;
  headers?: Array<{ key: string; value: string }> | Record<string, string>;
}): Promise<FlowHttpRequestResult> {
  const method = (opts.method || 'POST').toUpperCase();
  const body =
    method === 'GET' || method === 'HEAD'
      ? ''
      : buildWebhookOutBody({
          payloadMode: opts.payloadMode || 'envelope',
          bodyTemplate: opts.bodyTemplate || '',
          variables: opts.variables,
          conversationId: opts.conversationId,
          tenantId: opts.tenantId,
          includeSessionVars: opts.includeSessionVars,
        });
  const customHeaders = interpolateHeaders(opts.headers, opts.variables);
  const headers: Record<string, string> = {
    ...customHeaders,
    'X-PainelCRM-Event': 'chatbot_flows.webhook_out',
  };
  if (body && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }
  const secret = (opts.secret || '').trim();
  if (secret && body) {
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    headers['X-PainelCRM-Signature'] = `sha256=${sig}`;
  }

  return executeFlowHttpRequest({
    method,
    url: opts.url,
    headers,
    body,
    timeoutMs: opts.timeoutMs,
    variables: opts.variables,
  });
}
