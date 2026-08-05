/**
 * Helpers compartilhados do webhook de entrada (S5+).
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

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
}): { token: string; secret: string; nodeId: string } | null {
  for (const raw of graph.nodes || []) {
    if (!raw || typeof raw !== 'object') continue;
    const n = raw as Record<string, unknown>;
    if (n.type !== 'webhook_in') continue;
    const data = n.data && typeof n.data === 'object' ? (n.data as Record<string, unknown>) : {};
    const token = String(data.token || '').trim();
    if (!token) continue;
    return {
      token,
      secret: String(data.secret || '').trim(),
      nodeId: String(n.id || ''),
    };
  }
  return null;
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
