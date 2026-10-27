import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifica Stripe-Signature (t=timestamp,v1=hmac) sobre `${t}.${payload}`.
 * Sem HTTP. Assinatura inválida ou fora da tolerância retorna false.
 */
export function verifyStripeWebhookSignature(params: {
  payload: string;
  header: string | undefined;
  secret: string;
  nowSec?: number;
  toleranceSec?: number;
}): boolean {
  const header = params.header?.trim();
  const secret = params.secret.trim();
  if (!header || !secret) return false;

  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't') timestamp = value;
    if (key === 'v1' && value) signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = params.nowSec ?? Math.floor(Date.now() / 1000);
  const tolerance = params.toleranceSec ?? 300;
  if (Math.abs(now - ts) > tolerance) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${params.payload}`, 'utf8').digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  return signatures.some((sig) => {
    const buf = Buffer.from(sig, 'utf8');
    if (buf.length !== expectedBuf.length) return false;
    return timingSafeEqual(buf, expectedBuf);
  });
}
