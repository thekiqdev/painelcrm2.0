/**
 * S28 — URL de amostra fixa do webhook_in (persistente; não dispara runtime).
 */
import { pool } from '../../utils/db.js';
import {
  generateInboundWebhookToken,
  getChatbotFlowsPublicBaseUrl,
} from './flowWebhookIn.js';

const MAX_BODY_CHARS = 64_000;

export function buildInboundWebhookSamplePath(token: string): string {
  return `/webhooks/chatbot-flows-sample/${encodeURIComponent(token)}`;
}

export function buildInboundWebhookSampleUrl(token: string): string {
  const base = getChatbotFlowsPublicBaseUrl();
  const path = buildInboundWebhookSamplePath(token);
  return base ? `${base}${path}` : path;
}

export type WebhookInSampleState = {
  sampleToken: string;
  ingestPath: string;
  ingestUrl: string;
  payload: unknown | null;
  capturedAt: string | null;
};

function mapSampleRow(row: {
  inbound_webhook_sample_token: string | null;
  inbound_webhook_sample_payload: unknown;
  inbound_webhook_sample_at: Date | string | null;
}): WebhookInSampleState | null {
  const t = row.inbound_webhook_sample_token?.trim() || null;
  if (!t) return null;
  const at = row.inbound_webhook_sample_at
    ? new Date(row.inbound_webhook_sample_at).toISOString()
    : null;
  return {
    sampleToken: t,
    ingestPath: buildInboundWebhookSamplePath(t),
    ingestUrl: buildInboundWebhookSampleUrl(t),
    payload: row.inbound_webhook_sample_payload ?? null,
    capturedAt: at,
  };
}

/** Garante token de amostra; cria se ainda não existir. */
export async function ensureWebhookInSampleToken(opts: {
  tenantId: string;
  flowId: string;
}): Promise<WebhookInSampleState> {
  const existing = await pool.query<{
    inbound_webhook_sample_token: string | null;
    inbound_webhook_sample_payload: unknown;
    inbound_webhook_sample_at: Date | null;
  }>(
    `SELECT inbound_webhook_sample_token, inbound_webhook_sample_payload, inbound_webhook_sample_at
     FROM chatbot_flows
     WHERE tenant_id = $1::uuid AND id = $2::uuid
     LIMIT 1`,
    [opts.tenantId, opts.flowId]
  );
  const row = existing.rows[0];
  if (!row) {
    const err = new Error('Flow não encontrado') as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  if (row.inbound_webhook_sample_token?.trim()) {
    return mapSampleRow(row)!;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateInboundWebhookToken();
    try {
      const upd = await pool.query<{
        inbound_webhook_sample_token: string;
        inbound_webhook_sample_payload: unknown;
        inbound_webhook_sample_at: Date | null;
      }>(
        `UPDATE chatbot_flows
         SET inbound_webhook_sample_token = $3,
             updated_at = now()
         WHERE tenant_id = $1::uuid AND id = $2::uuid
           AND (inbound_webhook_sample_token IS NULL OR inbound_webhook_sample_token = '')
         RETURNING inbound_webhook_sample_token, inbound_webhook_sample_payload, inbound_webhook_sample_at`,
        [opts.tenantId, opts.flowId, token]
      );
      if (upd.rows[0]?.inbound_webhook_sample_token) {
        return mapSampleRow(upd.rows[0])!;
      }
      // Race: outro request preencheu
      const again = await pool.query<{
        inbound_webhook_sample_token: string | null;
        inbound_webhook_sample_payload: unknown;
        inbound_webhook_sample_at: Date | null;
      }>(
        `SELECT inbound_webhook_sample_token, inbound_webhook_sample_payload, inbound_webhook_sample_at
         FROM chatbot_flows
         WHERE tenant_id = $1::uuid AND id = $2::uuid
         LIMIT 1`,
        [opts.tenantId, opts.flowId]
      );
      const mapped = again.rows[0] ? mapSampleRow(again.rows[0]) : null;
      if (mapped) return mapped;
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === '23505') continue; // unique violation
      throw e;
    }
  }
  throw new Error('Não foi possível gerar token de amostra');
}

/** Rotaciona token; invalida URL antiga. Mantém último payload. */
export async function rotateWebhookInSampleToken(opts: {
  tenantId: string;
  flowId: string;
}): Promise<WebhookInSampleState> {
  const flow = await pool.query(
    `SELECT id FROM chatbot_flows WHERE tenant_id = $1::uuid AND id = $2::uuid LIMIT 1`,
    [opts.tenantId, opts.flowId]
  );
  if (!flow.rows[0]) {
    const err = new Error('Flow não encontrado') as Error & { status?: number };
    err.status = 404;
    throw err;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateInboundWebhookToken();
    try {
      const upd = await pool.query<{
        inbound_webhook_sample_token: string;
        inbound_webhook_sample_payload: unknown;
        inbound_webhook_sample_at: Date | null;
      }>(
        `UPDATE chatbot_flows
         SET inbound_webhook_sample_token = $3,
             updated_at = now()
         WHERE tenant_id = $1::uuid AND id = $2::uuid
         RETURNING inbound_webhook_sample_token, inbound_webhook_sample_payload, inbound_webhook_sample_at`,
        [opts.tenantId, opts.flowId, token]
      );
      return mapSampleRow(upd.rows[0])!;
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === '23505') continue;
      throw e;
    }
  }
  throw new Error('Não foi possível rotacionar token de amostra');
}

export async function getWebhookInSampleState(opts: {
  tenantId: string;
  flowId: string;
}): Promise<WebhookInSampleState> {
  return ensureWebhookInSampleToken(opts);
}

/** Ingest público — grava payload; não inicia sessão. */
export async function ingestWebhookInSamplePayload(opts: {
  sampleToken: string;
  body: unknown;
}): Promise<{ ok: true; flowId: string } | { ok: false; error: string; status: number }> {
  const token = String(opts.sampleToken || '').trim();
  if (!token) return { ok: false, error: 'token_obrigatorio', status: 400 };

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

  const upd = await pool.query<{ id: string }>(
    `UPDATE chatbot_flows
     SET inbound_webhook_sample_payload = $2::jsonb,
         inbound_webhook_sample_at = now(),
         updated_at = now()
     WHERE inbound_webhook_sample_token = $1
       AND status IS DISTINCT FROM 'archived'
     RETURNING id`,
    [token, JSON.stringify(payload)]
  );
  const id = upd.rows[0]?.id;
  if (!id) return { ok: false, error: 'webhook_sample_nao_encontrado', status: 404 };
  return { ok: true, flowId: String(id) };
}
