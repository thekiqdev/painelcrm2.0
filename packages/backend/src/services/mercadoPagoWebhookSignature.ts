/**
 * Validação de x-signature (HMAC-SHA256) conforme documentação Mercado Pago — Webhooks.
 * @see https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
import crypto from 'crypto';

/** Extrai ts e v1 do header `ts=...,v1=...` (partes separadas por vírgula). */
export function parseMercadoPagoXSignature(header: string | undefined): { ts: string; v1Hex: string } | null {
  if (!header || typeof header !== 'string') return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  let ts: string | undefined;
  let v1Hex: string | undefined;
  for (const part of trimmed.split(',')) {
    const p = part.trim();
    const eq = p.indexOf('=');
    if (eq <= 0) continue;
    const key = p.slice(0, eq).trim().toLowerCase();
    const val = p.slice(eq + 1).trim();
    if (key === 'ts') ts = val;
    if (key === 'v1') v1Hex = val;
  }
  if (!ts || !v1Hex) return null;
  return { ts, v1Hex };
}

/**
 * Template oficial: id → request-id (opcional) → ts.
 * Se request-id não existir, omitir do manifest (documentação MP).
 */
export function buildMercadoPagoManifest(dataId: string, requestId: string | undefined, ts: string): string {
  let manifest = `id:${dataId};`;
  const rid = requestId?.trim();
  if (rid) {
    manifest += `request-id:${rid};`;
  }
  manifest += `ts:${ts};`;
  return manifest;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(String(a).trim().toLowerCase(), 'hex');
    const bb = Buffer.from(String(b).trim().toLowerCase(), 'hex');
    if (ba.length !== bb.length || ba.length === 0) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/** data.id para assinatura: se alfanumérico, minúsculas (regra MP para query). */
export function normalizeMercadoPagoManifestDataId(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/[a-zA-Z]/.test(t)) return t.toLowerCase();
  return t;
}

function pickQuery(
  query: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const v = query[key];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return '';
}

/**
 * ID do recurso usado no manifest (prioriza query `data.id`, depois body data.id, depois topic=id).
 */
export function extractMercadoPagoManifestDataId(
  query: Record<string, string | string[] | undefined>,
  body: unknown,
  fallbackPaymentId: string,
): string {
  const fromQueryDataDotId = pickQuery(query, 'data.id');
  if (fromQueryDataDotId) return normalizeMercadoPagoManifestDataId(fromQueryDataDotId);
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const data = (body as Record<string, unknown>).data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const id = (data as Record<string, unknown>).id;
      if (id != null && String(id).trim() !== '') {
        return normalizeMercadoPagoManifestDataId(String(id));
      }
    }
  }
  const topic = pickQuery(query, 'topic');
  const qid = pickQuery(query, 'id');
  if (topic === 'payment' && qid) return normalizeMercadoPagoManifestDataId(qid);
  return normalizeMercadoPagoManifestDataId(fallbackPaymentId);
}

export type MercadoPagoSignatureVerifyResult =
  | { ok: true; mode: 'skipped_no_secret' }
  | { ok: true; mode: 'verified' }
  | { ok: false; reason: string };

/**
 * `webhookSecret`: assinatura gerada no painel MP (Suas integrações → Webhooks).
 * Sem secret: retorna skipped_no_secret (modo compatível).
 */
export function verifyMercadoPagoWebhookSignature(params: {
  webhookSecret: string | undefined;
  tsToleranceMs: number;
  xSignatureHeader: string | undefined;
  xRequestIdHeader: string | undefined;
  manifestDataId: string;
}): MercadoPagoSignatureVerifyResult {
  const secret = params.webhookSecret?.trim();
  if (!secret) {
    return { ok: true, mode: 'skipped_no_secret' };
  }

  const dataId = params.manifestDataId.trim();
  if (!dataId) {
    return { ok: false, reason: 'empty_manifest_data_id' };
  }

  const parsed = parseMercadoPagoXSignature(params.xSignatureHeader);
  if (!parsed) {
    return { ok: false, reason: 'missing_or_malformed_x_signature' };
  }

  const rid = params.xRequestIdHeader?.trim();
  const manifest = buildMercadoPagoManifest(dataId, rid || undefined, parsed.ts);
  const expectedHex = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  if (!timingSafeEqualHex(expectedHex, parsed.v1Hex)) {
    return { ok: false, reason: 'hmac_mismatch' };
  }

  const tsNum = Number(parsed.ts);
  if (!Number.isFinite(tsNum)) {
    return { ok: false, reason: 'invalid_ts' };
  }
  const tsMs = tsNum < 1e12 ? tsNum * 1000 : tsNum;
  const tol = params.tsToleranceMs;
  if (tol > 0) {
    const delta = Math.abs(Date.now() - tsMs);
    if (delta > tol) {
      return { ok: false, reason: 'ts_out_of_tolerance' };
    }
  }

  return { ok: true, mode: 'verified' };
}
