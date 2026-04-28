/**
 * State assinado (HMAC-SHA256) para OAuth Mercado Pago — CSRF / binding tenant+user.
 */
import { createHmac, timingSafeEqual } from 'crypto';

export type MercadoPagoOAuthStatePayload = {
  tenantId: string;
  userId: string;
  exp: number;
  nonce: string;
};

function getSecret(): string {
  const s = String(process.env.MERCADO_PAGO_OAUTH_STATE_SECRET || '').trim();
  if (s.length < 16) {
    throw new Error('MERCADO_PAGO_OAUTH_STATE_SECRET não configurada ou muito curta (mín. 16 caracteres).');
  }
  return s;
}

export function isMercadoPagoOAuthStateSecretConfigured(): boolean {
  return String(process.env.MERCADO_PAGO_OAUTH_STATE_SECRET || '').trim().length >= 16;
}

export function signMercadoPagoOAuthState(payload: MercadoPagoOAuthStatePayload): string {
  const secret = getSecret();
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyMercadoPagoOAuthState(state: string): MercadoPagoOAuthStatePayload | null {
  try {
    const secret = getSecret();
    const idx = state.lastIndexOf('.');
    if (idx <= 0) return null;
    const body = state.slice(0, idx);
    const sig = state.slice(idx + 1);
    const expected = createHmac('sha256', secret).update(body).digest('base64url');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const json = Buffer.from(body, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as MercadoPagoOAuthStatePayload;
    if (
      !payload?.tenantId ||
      !payload?.userId ||
      typeof payload.exp !== 'number' ||
      !payload.nonce
    ) {
      return null;
    }
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
