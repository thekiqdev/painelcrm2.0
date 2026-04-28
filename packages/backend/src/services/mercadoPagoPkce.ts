/**
 * PKCE OAuth (RFC 7636) — Mercado Pago exige code_challenge + code_verifier na troca do code.
 */
import { createHash, randomBytes } from 'crypto';

/** code_verifier: 32 bytes → base64url (~43 chars), dentro do intervalo 43–128. */
export function generateMercadoPagoPkceCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function mercadoPagoPkceCodeChallengeS256(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier, 'utf8').digest('base64url');
}
