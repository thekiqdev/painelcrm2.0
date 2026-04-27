/**
 * Integração Google Calendar (OAuth + Calendar API).
 * Ative com ENABLE_GOOGLE_CALENDAR=true e variáveis Google + cifra de tokens.
 */

export function isGoogleCalendarIntegrationEnabled(): boolean {
  return String(process.env.ENABLE_GOOGLE_CALENDAR || '').toLowerCase() === 'true';
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
