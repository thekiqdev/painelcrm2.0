/**
 * Helpers compartilhados do webhook de entrada (S5+).
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getByDotPath } from './flowHttpActions.js';

export function generateInboundWebhookToken(): string {
  return randomBytes(24).toString('hex');
}

export function getChatbotFlowsPublicBaseUrl(): string {
  const candidates = [
    process.env.API_PUBLIC_BASE_URL,
    process.env.API_PUBLIC_ORIGIN,
    process.env.PUBLIC_API_URL,
    process.env.API_PUBLIC_URL,
  ];
  for (const c of candidates) {
    const v = String(c || '')
      .trim()
      .replace(/\/$/, '');
    if (v) return v;
  }
  return '';
}

export function buildInboundWebhookUrl(token: string): string {
  const base = getChatbotFlowsPublicBaseUrl();
  const path = `/webhooks/chatbot-flows/${encodeURIComponent(token)}`;
  return base ? `${base}${path}` : path;
}

export function extractWebhookInFromGraph(graph: {
  nodes?: unknown[];
}): {
  token: string;
  secret: string;
  nodeId: string;
  payloadMap: Array<{ path: string; variable: string }>;
} | null {
  for (const raw of graph.nodes || []) {
    if (!raw || typeof raw !== 'object') continue;
    const n = raw as Record<string, unknown>;
    if (n.type !== 'webhook_in') continue;
    const data = n.data && typeof n.data === 'object' ? (n.data as Record<string, unknown>) : {};
    const token = String(data.token || '').trim();
    if (!token) continue;
    const payloadMapRaw = Array.isArray(data.payload_map) ? data.payload_map : [];
    const payloadMap = payloadMapRaw
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const r = row as Record<string, unknown>;
        const path = String(r.path || '').trim();
        const variable = String(r.variable || '').trim();
        if (!path || !variable) return null;
        return { path, variable };
      })
      .filter(Boolean) as Array<{ path: string; variable: string }>;
    return {
      token,
      secret: String(data.secret || '').trim(),
      nodeId: String(n.id || ''),
      payloadMap,
    };
  }
  return null;
}

/** S27 — aplica payload_map sobre o JSON do body do webhook. */
export function applyWebhookPayloadMap(
  payload: unknown,
  map: Array<{ path: string; variable: string }>
): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const m of map || []) {
    const name = String(m.variable || '').trim();
    const path = String(m.path || '').trim();
    if (!name || !path) continue;
    const v = getByDotPath(payload, path);
    mapped[name] = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  }
  return mapped;
}

/** Verifica assinatura opcional: header X-PainelCRM-Signature: sha256=hex */
export function verifyInboundWebhookSignature(opts: {
  secret: string;
  rawBody: string | Buffer;
  signatureHeader: string | undefined;
}): boolean {
  const secret = opts.secret.trim();
  if (!secret) return true;
  const header = String(opts.signatureHeader || '').trim();
  const m = /^sha256=(.+)$/i.exec(header);
  if (!m) return false;
  const expected = createHmac('sha256', secret).update(opts.rawBody).digest('hex');
  const got = m[1]!.trim();
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(got, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
