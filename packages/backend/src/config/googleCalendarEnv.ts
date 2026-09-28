/**
 * Integração Google Calendar (OAuth + Calendar API).
 * Ative com ENABLE_GOOGLE_CALENDAR=true e variáveis Google + cifra de tokens.
 */

export function isGoogleCalendarIntegrationEnabled(): boolean {
  return String(process.env.ENABLE_GOOGLE_CALENDAR || '').toLowerCase() === 'true';
}

function maskGoogleClientId(clientId: string): string {
  const t = clientId.trim();
  if (!t) return '(não definido)';
  if (t.length <= 20) return '***';
  return `${t.slice(0, 12)}…${t.slice(-8)}`;
}

/**
 * Uma linha no arranque: confirma ENABLE, FRONTEND_URL, redirect e client_id (mascarado). Não loga segredos.
 */
export function logGoogleCalendarBootDiagnostics(): void {
  const enabled = isGoogleCalendarIntegrationEnabled();
  const rawId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const rawRedirect = String(process.env.GOOGLE_REDIRECT_URI || '').trim();
  if (!enabled && !rawId && !rawRedirect) {
    return;
  }
  const frontend = String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  const cfg = getGoogleOAuthClientConfig();
  console.log('[google-calendar:boot]', {
    ENABLE_GOOGLE_CALENDAR: enabled,
    FRONTEND_URL: frontend,
    GOOGLE_CLIENT_ID: maskGoogleClientId(rawId),
    GOOGLE_REDIRECT_URI: rawRedirect || '(não definido — OAuth não completo)',
    oauth_ready: !!cfg,
  });
  if (enabled && !cfg) {
    console.warn(
      '[google-calendar:boot] ENABLE_GOOGLE_CALENDAR=true mas faltam GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e/ou GOOGLE_REDIRECT_URI',
    );
  }
}

export function getGoogleOAuthClientConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} | null {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const redirectUri = String(process.env.GOOGLE_REDIRECT_URI || '').trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function assertGoogleCalendarConfigured(): void {
  if (!isGoogleCalendarIntegrationEnabled()) {
    throw new Error('Integração Google Agenda desativada (ENABLE_GOOGLE_CALENDAR).');
  }
  if (!getGoogleOAuthClientConfig()) {
    throw new Error('Google OAuth não configurado (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI).');
  }
}
