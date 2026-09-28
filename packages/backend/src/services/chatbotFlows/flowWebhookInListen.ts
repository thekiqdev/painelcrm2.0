/**
 * S27.1 — listen one-shot do webhook_in no editor (sem disparar runtime).
 * Store em memória: POST público grava payload; GET autenticado lê.
 */
import { randomBytes } from 'node:crypto';
import { getChatbotFlowsPublicBaseUrl } from './flowWebhookIn.js';

export type WebhookInListenSession = {
  listenId: string;
  tenantId: string;
  flowId: string;
  createdAt: number;
  expiresAt: number;
  receivedAt: number | null;
  payload: unknown | null;
  contentType: string | null;
};

const MAX_BODY_CHARS = 64_000;
const DEFAULT_TTL_MS = 60_000;
const MAX_TTL_MS = 120_000;
const MAX_SESSIONS = 200;

const sessions = new Map<string, WebhookInListenSession>();

function pruneExpired(now = Date.now()) {
  for (const [id, s] of sessions) {
    if (s.expiresAt <= now) sessions.delete(id);
  }
  if (sessions.size <= MAX_SESSIONS) return;
  const ordered = [...sessions.values()].sort((a, b) => a.createdAt - b.createdAt);
  for (const s of ordered) {
    if (sessions.size <= MAX_SESSIONS) break;
    sessions.delete(s.listenId);
  }
}

export function createWebhookInListenSession(opts: {
  tenantId: string;
  flowId: string;
  ttlMs?: number;
}): {
  listenId: string;
  expiresAt: string;
  ingestPath: string;
  ingestUrl: string;
  ttlMs: number;
} {
  pruneExpired();
  const ttlMs = Math.min(
    Math.max(Number(opts.ttlMs) || DEFAULT_TTL_MS, 5_000),
    MAX_TTL_MS
  );
  const listenId = randomBytes(18).toString('hex');
  const now = Date.now();
  const expiresAt = now + ttlMs;
  sessions.set(listenId, {
    listenId,
    tenantId: opts.tenantId,
    flowId: opts.flowId,
    createdAt: now,
    expiresAt,
    receivedAt: null,
    payload: null,
    contentType: null,
  });
  const ingestPath = `/webhooks/chatbot-flows-listen/${encodeURIComponent(listenId)}`;
  const base = getChatbotFlowsPublicBaseUrl();
  // Em dev sem API_PUBLIC_*: path relativo; Vite faz proxy de /webhooks e /api/webhooks.
  return {
    listenId,
    expiresAt: new Date(expiresAt).toISOString(),
    ingestPath,
    ingestUrl: base ? `${base}${ingestPath}` : ingestPath,
    ttlMs,
  };
}

export function getWebhookInListenSession(
  listenId: string
): WebhookInListenSession | null {
  pruneExpired();
  return sessions.get(listenId) || null;
}

export function cancelWebhookInListenSession(opts: {
  listenId: string;
  tenantId: string;
  flowId: string;
}): boolean {
  const s = sessions.get(opts.listenId);
  if (!s) return false;
  if (s.tenantId !== opts.tenantId || s.flowId !== opts.flowId) return false;
  sessions.delete(opts.listenId);
  return true;
}

export function ingestWebhookInListenPayload(opts: {
  listenId: string;
  body: unknown;
  contentType?: string | null;
}): { ok: true } | { ok: false; error: string; status: number } {
  pruneExpired();
  const s = sessions.get(opts.listenId);
  if (!s) return { ok: false, error: 'listen_nao_encontrado', status: 404 };
  if (s.expiresAt <= Date.now()) {
    sessions.delete(opts.listenId);
    return { ok: false, error: 'listen_expirado', status: 410 };
  }
  if (s.receivedAt != null) {
    return { ok: false, error: 'listen_ja_recebido', status: 409 };
  }

  let payload: unknown = opts.body;
  try {
    const raw =
      typeof payload === 'string'
        ? payload
        : Buffer.isBuffer(payload)
          ? payload.toString('utf8')
          : JSON.stringify(payload ?? null);
    if (raw.length > MAX_BODY_CHARS) {
      return { ok: false, error: 'payload_muito_grande', status: 413 };
    }
    if (typeof opts.body === 'string') {
      try {
        payload = JSON.parse(opts.body);
      } catch {
        payload = opts.body;
      }
    } else if (Buffer.isBuffer(opts.body)) {
      const text = opts.body.toString('utf8');
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
  } catch {
    return { ok: false, error: 'payload_invalido', status: 400 };
  }

  s.payload = payload;
  s.contentType = opts.contentType ? String(opts.contentType) : null;
  s.receivedAt = Date.now();
  return { ok: true };
}

/** Aguarda payload até timeout (long-poll). */
export async function waitWebhookInListenPayload(opts: {
  listenId: string;
  tenantId: string;
  flowId: string;
  waitMs?: number;
}): Promise<
  | { status: 'waiting' }
  | { status: 'received'; payload: unknown; received_at: string; content_type: string | null }
  | { status: 'expired' }
  | { status: 'not_found' }
  | { status: 'forbidden' }
> {
  const deadline = Date.now() + Math.min(Math.max(opts.waitMs ?? 25_000, 0), 55_000);
  for (;;) {
    pruneExpired();
    const s = sessions.get(opts.listenId);
    if (!s) {
      return { status: 'not_found' };
    }
    if (s.tenantId !== opts.tenantId || s.flowId !== opts.flowId) {
      return { status: 'forbidden' };
    }
    if (s.receivedAt != null) {
      const result = {
        status: 'received' as const,
        payload: s.payload,
        received_at: new Date(s.receivedAt).toISOString(),
        content_type: s.contentType,
      };
      sessions.delete(opts.listenId);
      return result;
    }
    if (s.expiresAt <= Date.now()) {
      sessions.delete(opts.listenId);
      return { status: 'expired' };
    }
    if (Date.now() >= deadline) {
      return { status: 'waiting' };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

/** Só para testes unitários. */
export function __resetWebhookInListenStoreForTests() {
  sessions.clear();
}
