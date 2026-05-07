/**
 * Registo seguro de parâmetros OAuth Google ao iniciar ligação (auditoria / diagnóstico).
 *
 * Ativo quando:
 * - `NODE_ENV` ≠ `production`, ou
 * - `GOOGLE_OAUTH_AUDIT_LOG=true` (útil em staging com NODE_ENV=production).
 *
 * Nunca regista: client_secret, refresh_token, access_token, authorization code completo.
 */

function maskGoogleClientId(clientId: string): string {
  const t = clientId.trim();
  if (!t) return '(não definido)';
  if (t.length <= 20) return '***';
  return `${t.slice(0, 12)}…${t.slice(-8)}`;
}

export function shouldLogGoogleOAuthAudit(): boolean {
  if (String(process.env.GOOGLE_OAUTH_AUDIT_LOG || '').toLowerCase() === 'true') {
    return true;
  }
  return String(process.env.NODE_ENV || '') !== 'production';
}

export type GoogleOAuthConnectAuditPayload = {
  provider: 'google_calendar' | 'google_drive';
  tenantId: string;
  userId: string;
  scopesRequested: string;
  redirectUri: string;
  clientIdMasked: string;
};

export function logGoogleOAuthConnectAudit(payload: GoogleOAuthConnectAuditPayload): void {
  if (!shouldLogGoogleOAuthAudit()) return;
  console.log('[google-oauth:audit:connect]', {
    provider: payload.provider,
    tenant_id: payload.tenantId,
    user_id: payload.userId,
    scopes_requested: payload.scopesRequested,
    redirect_uri: payload.redirectUri,
    client_id_masked: payload.clientIdMasked,
  });
}

export { maskGoogleClientId as maskGoogleClientIdForAudit };
